/**
 * Access control — the single place that decides whether a user may open
 * something. (Brief §19, §29.)
 *
 * Everything resolves against the `entitlements` table, so the rules do not
 * care how access was obtained (subscription, one-off purchase, course
 * enrolment, admin grant).
 *
 * The one rule worth stating loudly, because the brief repeats it twice:
 *
 *     Premium membership NEVER unlocks a paid course.
 *
 * That is not enforced by an `if` here. It falls out of the data model: a
 * membership only ever writes a scope='premium' entitlement, and course access
 * is only ever read from scope='course'. There is no code path that could
 * conflate them, so a future edit cannot accidentally weaken it.
 */
import { all, get } from './db'

export type AccessType = 'free' | 'premium' | 'individual' | 'course' | 'specific'
export type Scope = 'premium' | 'course' | 'content' | 'program'

export interface Accessible {
  access_type: AccessType
  price?: number
  /** For access_type='course': which course grants it. */
  course_id?: number | null
  id: number
}

export interface AccessResult {
  allowed: boolean
  /** Why it is locked, for the UI to render the right unlock affordance. */
  reason: 'free' | 'entitled' | 'preview' | 'need_login' | 'need_premium' | 'need_purchase' | 'need_course' | 'not_granted'
  accessType: AccessType
  price: number
  /** Course that must be owned, when reason === 'need_course'. */
  requiredCourseId?: number
}

/** Active = not revoked, started, and not expired. */
const ACTIVE = `
  revoked_at IS NULL
  AND datetime(starts_at) <= datetime('now')
  AND (expires_at IS NULL OR datetime(expires_at) > datetime('now'))
`

export const hasPremium = (userId?: number | null): boolean => {
  if (!userId) return false
  return !!get(
    `SELECT 1 FROM entitlements WHERE user_id = ? AND scope = 'premium' AND ${ACTIVE} LIMIT 1`,
    userId,
  )
}

export const ownsCourse = (userId: number | null | undefined, courseId: number): boolean => {
  if (!userId) return false
  return !!get(
    `SELECT 1 FROM entitlements
     WHERE user_id = ? AND scope = 'course' AND ref_id = ? AND ${ACTIVE} LIMIT 1`,
    userId,
    courseId,
  )
}

const hasScoped = (userId: number | null | undefined, scope: Scope, refId: number): boolean => {
  if (!userId) return false
  return !!get(
    `SELECT 1 FROM entitlements
     WHERE user_id = ? AND scope = ? AND ref_id = ? AND ${ACTIVE} LIMIT 1`,
    userId,
    scope,
    refId,
  )
}

export const isAdmin = (userId?: number | null): boolean => {
  if (!userId) return false
  return !!get(
    `SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_id = ? AND r.slug = 'admin' LIMIT 1`,
    userId,
  )
}

/**
 * Resolve access to a content item.
 *
 * `scope` distinguishes content from programs, since both use access_type but
 * live in different tables.
 */
export const checkAccess = (
  item: Accessible,
  userId?: number | null,
  scope: Extract<Scope, 'content' | 'program'> = 'content',
): AccessResult => {
  const price = item.price ?? 0
  const base = { accessType: item.access_type, price }

  // Admins see everything. Deliberately first: an admin previewing locked
  // content is a normal editorial workflow.
  if (isAdmin(userId)) return { ...base, allowed: true, reason: 'entitled' }

  switch (item.access_type) {
    case 'free':
      return { ...base, allowed: true, reason: 'free' }

    case 'premium':
      if (!userId) return { ...base, allowed: false, reason: 'need_login' }
      return hasPremium(userId)
        ? { ...base, allowed: true, reason: 'entitled' }
        : { ...base, allowed: false, reason: 'need_premium' }

    case 'individual':
      if (!userId) return { ...base, allowed: false, reason: 'need_login' }
      // NOTE: an individual item is NOT unlocked by premium. If a given item
      // should be, mark it access_type='premium' instead. Keeping these
      // distinct is what makes the pricing model predictable.
      return hasScoped(userId, scope, item.id)
        ? { ...base, allowed: true, reason: 'entitled' }
        : { ...base, allowed: false, reason: 'need_purchase' }

    case 'course': {
      const cid = item.course_id ?? 0
      if (!userId) return { ...base, allowed: false, reason: 'need_login', requiredCourseId: cid }
      return ownsCourse(userId, cid)
        ? { ...base, allowed: true, reason: 'entitled' }
        : { ...base, allowed: false, reason: 'need_course', requiredCourseId: cid }
    }

    case 'specific':
      // Access only by explicit admin grant — no purchase path exists.
      if (!userId) return { ...base, allowed: false, reason: 'need_login' }
      return hasScoped(userId, scope, item.id)
        ? { ...base, allowed: true, reason: 'entitled' }
        : { ...base, allowed: false, reason: 'not_granted' }

    default:
      // Unknown access_type: fail closed.
      return { ...base, allowed: false, reason: 'not_granted' }
  }
}

/**
 * Strip protected fields from a content row for a user who lacks access.
 *
 * Locked items still need to be *listed* (title, cover, price, badge) — the
 * brief asks for a preview plus an unlock button. What must never leave the
 * server is the body and any media reference.
 */
export const redact = <T extends Record<string, any>>(row: T, access: AccessResult) => {
  if (access.allowed) return { ...row, access }
  const { body, payload, ...safe } = row
  return {
    ...safe,
    // A short teaser is allowed and is what makes the lock feel fair.
    summary: row.summary ?? null,
    body: null,
    locked: true,
    access,
  }
}

/**
 * Is a lesson open yet? Separate from purchase: owning a course does not mean
 * every lesson is available (brief §3 — sequential / date-gated unlocks).
 */
export const lessonUnlocked = (
  lesson: {
    id: number
    module_id: number
    unlock_rule: string
    unlock_at?: string | null
    sort_order: number
    is_preview: number
  },
  userId: number | null | undefined,
  courseId: number,
): { unlocked: boolean; reason: string } => {
  if (lesson.is_preview) return { unlocked: true, reason: 'preview' }
  if (isAdmin(userId)) return { unlocked: true, reason: 'admin' }
  if (!ownsCourse(userId, courseId)) return { unlocked: false, reason: 'need_course' }

  switch (lesson.unlock_rule) {
    case 'immediate':
      return { unlocked: true, reason: 'immediate' }

    case 'date': {
      if (!lesson.unlock_at) return { unlocked: true, reason: 'no_date_set' }
      const open = new Date(lesson.unlock_at).getTime() <= Date.now()
      return { unlocked: open, reason: open ? 'date_passed' : 'date_pending' }
    }

    case 'sequential':
    case 'after_previous': {
      // Find the lesson immediately before this one in the course's flat order
      // and require it to be completed.
      const prev = get<{ id: number }>(
        `SELECT l.id
           FROM course_lessons l
           JOIN course_modules m ON m.id = l.module_id
          WHERE m.course_id = ?
            AND (m.sort_order, l.sort_order) < (
              SELECT m2.sort_order, l2.sort_order
                FROM course_lessons l2 JOIN course_modules m2 ON m2.id = l2.module_id
               WHERE l2.id = ?
            )
          ORDER BY m.sort_order DESC, l.sort_order DESC
          LIMIT 1`,
        courseId,
        lesson.id,
      )
      // First lesson of the course: nothing to gate on.
      if (!prev) return { unlocked: true, reason: 'first_lesson' }

      const done = get(
        `SELECT 1 FROM progress
          WHERE user_id = ? AND subject_kind = 'lesson' AND subject_id = ?
            AND completed_at IS NOT NULL`,
        userId,
        prev.id,
      )
      return done
        ? { unlocked: true, reason: 'previous_done' }
        : { unlocked: false, reason: 'previous_pending' }
    }

    default:
      return { unlocked: false, reason: 'unknown_rule' }
  }
}

/** Roles the user currently holds, including the derived ones. */
export const userRoles = (userId?: number | null): string[] => {
  if (!userId) return ['guest']
  const stored = all<{ slug: string }>(
    `SELECT r.slug FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ?`,
    userId,
  ).map((r) => r.slug)

  const roles = new Set(['user', ...stored])
  // Derived, so they expire on their own without a background job.
  if (hasPremium(userId)) roles.add('premium')
  const owns = get(
    `SELECT 1 FROM entitlements WHERE user_id = ? AND scope = 'course' AND ${ACTIVE} LIMIT 1`,
    userId,
  )
  if (owns) roles.add('student')
  return [...roles]
}

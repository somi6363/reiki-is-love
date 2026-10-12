/**
 * Authentication: password hashing, sessions, and the current-user helper.
 *
 * scrypt from node:crypto rather than bcrypt/argon2 — both are native modules
 * with no musl aarch64 prebuilds. scrypt is memory-hard and in the standard
 * library, which is the right trade here.
 *
 * Session tokens are random 32-byte values. The DB stores only SHA-256 of the
 * token, so a database leak yields nothing replayable.
 */
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto'
import type { H3Event } from 'h3'
import { get, run } from './db'
import { userRoles, isAdmin } from './access'

const SCRYPT_N = 16384 // ~16MB per hash: slow enough to matter, fast enough for a phone-hosted server
const KEYLEN = 64
const COOKIE = 'ril_session'
const SESSION_DAYS = 60

export const hashPassword = (password: string): string => {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, KEYLEN, { N: SCRYPT_N })
  return `${salt.toString('hex')}:${hash.toString('hex')}`
}

export const verifyPassword = (password: string, stored: string): boolean => {
  const [saltHex, hashHex] = stored.split(':')
  if (!saltHex || !hashHex) return false
  const salt = Buffer.from(saltHex, 'hex')
  const expected = Buffer.from(hashHex, 'hex')
  const actual = scryptSync(password, salt, expected.length, { N: SCRYPT_N })
  // Constant-time: never leak how much of the hash matched.
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

export const createSession = (event: H3Event, userId: number): string => {
  const token = randomBytes(32).toString('hex')
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000)

  run(
    `INSERT INTO sessions (token_hash, user_id, expires_at, user_agent) VALUES (?,?,?,?)`,
    hashToken(token),
    userId,
    expires.toISOString(),
    getHeader(event, 'user-agent') ?? null,
  )

  setCookie(event, COOKIE, token, {
    httpOnly: true, // JS must never be able to read it
    sameSite: 'lax', // survives normal navigation, blocks cross-site POSTs
    secure: process.env.LOCAL_PREVIEW !== '1' && !import.meta.dev, // disable only for loopback preview
    path: '/',
    expires,
  })

  return token
}

export const destroySession = (event: H3Event) => {
  const token = getCookie(event, COOKIE)
  if (token) run(`DELETE FROM sessions WHERE token_hash = ?`, hashToken(token))
  deleteCookie(event, COOKIE, { path: '/' })
}

export interface CurrentUser {
  id: number
  name: string
  email: string | null
  phone: string | null
  avatar: string | null
  roles: string[]
  isAdmin: boolean
}

/**
 * Resolve the session cookie to a user. Returns null for guests rather than
 * throwing, because most endpoints serve guests too (free content).
 *
 * Cached on the event context so several helpers in one request do not each
 * hit the DB.
 */
export const currentUser = (event: H3Event): CurrentUser | null => {
  if (event.context.user !== undefined) return event.context.user

  const resolve = (): CurrentUser | null => {
    const token = getCookie(event, COOKIE)
    if (!token) return null

    const row = get<{ id: number; name: string; email: string | null; phone: string | null; avatar: string | null }>(
      `SELECT u.id, u.name, u.email, u.phone, u.avatar
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ?
          AND datetime(s.expires_at) > datetime('now')
          AND u.disabled_at IS NULL`,
      hashToken(token),
    )
    if (!row) return null

    return { ...row, roles: userRoles(row.id), isAdmin: isAdmin(row.id) }
  }

  const user = resolve()
  event.context.user = user
  if (user) {
    // Cheap enough to do per request and useful for the admin user list.
    run(`UPDATE users SET last_seen_at = datetime('now') WHERE id = ?`, user.id)
  }
  return user
}

/** For endpoints that require a logged-in user. */
export const requireUser = (event: H3Event): CurrentUser => {
  const user = currentUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'برای این کار باید وارد شوید' })
  return user
}

/** For admin endpoints. Distinct 403 so the client can tell them apart. */
export const requireAdmin = (event: H3Event): CurrentUser => {
  const user = requireUser(event)
  if (!user.isAdmin) throw createError({ statusCode: 403, statusMessage: 'دسترسی مدیر لازم است' })
  return user
}

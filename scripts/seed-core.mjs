/**
 * Seed script — realistic Persian sample content (brief §33).
 *
 * Idempotent: re-running upserts by slug rather than duplicating. Run with
 *   npm run db:seed      (keeps existing data)
 *   npm run db:reset     (drops the file first)
 *
 * Everything created here is editable and deletable from the admin panel;
 * nothing is special-cased as "system content" except the content_types rows,
 * which the app's routes depend on.
 */
import { DatabaseSync } from 'node:sqlite'
import { randomBytes, scryptSync } from 'node:crypto'
import { readFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
mkdirSync(join(root, 'data'), { recursive: true })

const db = new DatabaseSync(process.env.DATABASE_PATH || join(root, 'data', 'app.db'))
db.exec('PRAGMA journal_mode = WAL')
db.exec('PRAGMA foreign_keys = ON')
db.exec(readFileSync(join(root, 'server', 'db', 'schema.sql'), 'utf8'))

const run = (sql, ...p) => db.prepare(sql).run(...p)
const get = (sql, ...p) => db.prepare(sql).get(...p)
const all = (sql, ...p) => db.prepare(sql).all(...p)

const hashPassword = (password) => {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, 64, { N: 16384 })
  return `${salt.toString('hex')}:${hash.toString('hex')}`
}

console.log('→ seeding…')

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------
// Only guest/user/admin are stored. premium and student are DERIVED from
// entitlements (see server/utils/access.ts) so they expire without a write.
for (const [slug, title] of [
  ['guest', 'مهمان'],
  ['user', 'کاربر'],
  ['admin', 'مدیر'],
]) {
  run(`INSERT INTO roles (slug, title) VALUES (?,?) ON CONFLICT(slug) DO UPDATE SET title=excluded.title`, slug, title)
}

// ---------------------------------------------------------------------------
// Content types — the extensibility registry
// ---------------------------------------------------------------------------
// field_schema drives the admin form, so a new type becomes editable without
// writing a form. Adding "Tarot" later is one INSERT here.
const TYPES = [
  {
    slug: 'mantra',
    title_fa: 'مانترا',
    route: '/library/mantras',
    icon: 'mantra',
    is_system: 1,
    fields: [
      { key: 'script', label: 'متن اصلی مانترا', type: 'text', dir: 'ltr' },
      { key: 'translit', label: 'تلفظ فارسی', type: 'text' },
      { key: 'meaning', label: 'معنی', type: 'textarea' },
      { key: 'usage', label: 'روش استفاده', type: 'textarea' },
      { key: 'default_count', label: 'تعداد پیشنهادی تکرار', type: 'number' },
    ],
  },
  {
    slug: 'meditation',
    title_fa: 'مراقبه',
    route: '/library/meditations',
    icon: 'meditation',
    is_system: 1,
    fields: [
      { key: 'duration_sec', label: 'مدت (ثانیه)', type: 'number' },
      { key: 'voice', label: 'گوینده', type: 'text' },
    ],
  },
  {
    slug: 'article',
    title_fa: 'مقاله',
    route: '/library/articles',
    icon: 'article',
    is_system: 1,
    fields: [{ key: 'read_min', label: 'زمان مطالعه (دقیقه)', type: 'number' }],
  },
  {
    slug: 'reiki_page',
    title_fa: 'صفحه ریکی',
    route: '/reiki',
    icon: 'reiki',
    is_system: 1,
    fields: [],
  },
  {
    slug: 'chakra',
    title_fa: 'چاکرا',
    route: '/library/chakras',
    icon: 'chakra',
    is_system: 1,
    fields: [
      { key: 'sanskrit', label: 'نام سانسکریت', type: 'text', dir: 'ltr' },
      { key: 'location', label: 'محل قرارگیری', type: 'text' },
      { key: 'element', label: 'عنصر', type: 'text' },
      { key: 'themes', label: 'مضامین (با کاما جدا کنید)', type: 'text' },
      { key: 'affirmations', label: 'تأییدها (هر خط یکی)', type: 'textarea' },
      { key: 'questions', label: 'پرسش‌های تأملی (هر خط یکی)', type: 'textarea' },
    ],
  },
  {
    slug: 'aura',
    title_fa: 'هاله و انرژی',
    route: '/library/aura',
    icon: 'aura',
    is_system: 1,
    fields: [],
  },
  {
    slug: 'practice',
    title_fa: 'تمرین ریکی',
    route: '/reiki/practices',
    icon: 'practice',
    is_system: 1,
    fields: [
      { key: 'duration_min', label: 'مدت (دقیقه)', type: 'number' },
      { key: 'positions', label: 'وضعیت دست‌ها (هر خط یکی)', type: 'textarea' },
    ],
  },
  {
    slug: 'moon_reading',
    title_fa: 'خوانش ماه',
    route: '/calendar',
    icon: 'moon',
    is_system: 1,
    // Interpretation only. Astronomical facts live in calendar_events.astro.
    fields: [
      { key: 'reflection', label: 'تأمل پیشنهادی', type: 'textarea' },
      { key: 'journal_prompts', label: 'پرسش‌های ژورنال (هر خط یکی)', type: 'textarea' },
    ],
  },
  {
    slug: 'journal_prompt',
    title_fa: 'تمرین ژورنال',
    route: '/journal/prompts',
    icon: 'journal',
    is_system: 0,
    fields: [{ key: 'prompts', label: 'پرسش‌ها (هر خط یکی)', type: 'textarea' }],
  },
  {
    slug: 'breathwork',
    title_fa: 'تنفس',
    route: '/library/breathwork',
    icon: 'breath',
    // Not a system type: included to prove a non-core type works end to end
    // through the same machinery.
    is_system: 0,
    fields: [
      { key: 'pattern', label: 'الگوی تنفس', type: 'text' },
      { key: 'rounds', label: 'تعداد دور', type: 'number' },
    ],
  },
]

for (const [i, t] of TYPES.entries()) {
  run(
    `INSERT INTO content_types (slug, title_fa, route, icon, field_schema, sort_order, is_system)
     VALUES (?,?,?,?,?,?,?)
     ON CONFLICT(slug) DO UPDATE SET
       title_fa=excluded.title_fa, route=excluded.route, icon=excluded.icon,
       field_schema=excluded.field_schema, sort_order=excluded.sort_order`,
    t.slug, t.title_fa, t.route, t.icon, JSON.stringify(t.fields), i, t.is_system,
  )
}
const typeId = (slug) => get(`SELECT id FROM content_types WHERE slug=?`, slug).id

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------
const CATEGORIES = {
  mantra: ['آرامش', 'عشق', 'فراوانی', 'محافظت', 'تمرکز', 'گشایش', 'رهایی', 'اعتمادبه‌نفس', 'خواب', 'قدرت درونی', 'شروع تازه', 'قدردانی', 'خوددوستی'],
  meditation: ['آرامش', 'خواب', 'رهایی', 'گراندینگ', 'تمرکز', 'عشق به خود', 'کودک درون', 'بخشش', 'صبحگاهی', 'شبانه', 'چاکراها', 'ریکی', 'کاهش شلوغی ذهن', 'تنفس', 'حضور در لحظه'],
  article: ['ریکی', 'مراقبه', 'مانترا', 'ماه و تقویم', 'خودشناسی', 'سبک زندگی معنوی', 'چاکراها', 'هاله و انرژی'],
  journal: ['ژورنال روزانه', 'قدردانی', 'نیت‌ها', 'رؤیاها', 'تجربه‌های ریکی', 'تجربه‌های مراقبه', 'ژورنال ماه نو', 'ژورنال ماه کامل', 'تأمل احساسی', 'نوشتن آزاد'],
  discover: ['ریکی', 'مانترا', 'مراقبه', 'تقویم معنوی', 'ماه', 'چاکراها', 'هاله', 'کریستال‌ها', 'خودشناسی', 'ژورنال', 'مقالات', 'چالش‌ها', 'فایل‌های صوتی'],
}

const slugify = (fa) => fa.replace(/\s+/g, '-').replace(/[^\u0600-\u06FF\w-]/g, '')

for (const [taxonomy, titles] of Object.entries(CATEGORIES)) {
  for (const [i, title] of titles.entries()) {
    run(
      `INSERT INTO categories (taxonomy, slug, title_fa, sort_order) VALUES (?,?,?,?)
       ON CONFLICT(taxonomy, slug) DO UPDATE SET title_fa=excluded.title_fa`,
      taxonomy, slugify(title), title, i,
    )
  }
}
const catId = (taxonomy, title) =>
  get(`SELECT id FROM categories WHERE taxonomy=? AND slug=?`, taxonomy, slugify(title))?.id

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------
for (const t of ['آرامش', 'رهایی', 'قدردانی', 'خواب', 'تمرکز', 'ماه کامل', 'ماه نو', 'گراندینگ', 'چاکرای قلب', 'خوددوستی', 'تنفس', 'ریکی', 'مبتدی']) {
  run(`INSERT INTO tags (slug, title_fa) VALUES (?,?) ON CONFLICT(slug) DO NOTHING`, slugify(t), t)
}
const tagId = (t) => get(`SELECT id FROM tags WHERE slug=?`, slugify(t))?.id

// ---------------------------------------------------------------------------
// Moods -> recommendations (brief: "امروز چه حالی داری؟")
// ---------------------------------------------------------------------------
const MOODS = [
  ['aramam', 'آرامم', '🌿'],
  ['moztaram', 'مضطربم', '🍃'],
  ['khastam', 'خسته‌ام', '🌙'],
  ['zehn-sholoogh', 'ذهنم شلوغه', '💭'],
  ['narahatam', 'ناراحتم', '🤍'],
  ['tamarkoz', 'نیاز به تمرکز دارم', '🎯'],
  ['aramesh', 'نیاز به آرامش دارم', '💧'],
  ['rahaei', 'نیاز به رهایی دارم', '🕊'],
]
for (const [i, [slug, title, icon]] of MOODS.entries()) {
  run(
    `INSERT INTO moods (slug, title_fa, icon, sort_order) VALUES (?,?,?,?)
     ON CONFLICT(slug) DO UPDATE SET title_fa=excluded.title_fa, icon=excluded.icon`,
    slug, title, icon, i,
  )
}
const moodId = (slug) => get(`SELECT id FROM moods WHERE slug=?`, slug).id

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------
const upsertUser = (email, name, password, roles = []) => {
  const existing = get(`SELECT id FROM users WHERE email=?`, email)
  let id
  if (existing) {
    id = existing.id
  } else {
    id = run(`INSERT INTO users (email, name, password_hash) VALUES (?,?,?)`, email, name, hashPassword(password)).lastInsertRowid
  }
  for (const r of roles) {
    const role = get(`SELECT id FROM roles WHERE slug=?`, r)
    if (role) run(`INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?,?)`, id, role.id)
  }
  return Number(id)
}

// No default credentials and no automatic first-user admin promotion.
// Register normally, then explicitly promote an account using scripts/admin.mjs.
const adminId = null
const demoId = null

// ---------------------------------------------------------------------------
// Membership plans
// ---------------------------------------------------------------------------
for (const p of [
  { slug: 'monthly', title: 'اشتراک ماهانه', period: 'monthly', price: 890000, benefits: ['دسترسی کامل به کتابخانه مانتراها', 'دسترسی کامل به مراقبه‌ها', 'محتوای ویژه تقویم معنوی', 'چالش‌های ویژه', 'ابزارهای پیشرفته'] },
  { slug: 'yearly', title: 'اشتراک سالانه', period: 'yearly', price: 7900000, benefits: ['همه مزایای اشتراک ماهانه', 'دو ماه هدیه', 'دسترسی زودتر به محتوای تازه'] },
]) {
  run(
    `INSERT INTO membership_plans (slug, title, period, price, benefits, sort_order)
     VALUES (?,?,?,?,?,?)
     ON CONFLICT(slug) DO UPDATE SET title=excluded.title, price=excluded.price, benefits=excluded.benefits`,
    p.slug, p.title, p.period, p.price, JSON.stringify(p.benefits), p.period === 'monthly' ? 0 : 1,
  )
}

// ---------------------------------------------------------------------------
// Content helper
// ---------------------------------------------------------------------------
const upsertContent = (c) => {
  const tid = typeId(c.type)
  const existing = get(`SELECT id FROM content WHERE type_id=? AND slug=?`, tid, c.slug)
  const fields = [
    c.title, c.subtitle ?? null, c.summary ?? null, c.body ?? null, c.cover ?? null,
    JSON.stringify(c.payload ?? {}), c.access ?? 'free', c.price ?? 0, c.course_id ?? null,
    c.status ?? 'published', c.published_at ?? new Date().toISOString(),
    c.featured ? 1 : 0, c.sort_order ?? 0,
  ]
  let id
  if (existing) {
    run(
      `UPDATE content SET title=?, subtitle=?, summary=?, body=?, cover=?, payload=?,
        access_type=?, price=?, course_id=?, status=?, published_at=?, featured=?, sort_order=?,
        updated_at=datetime('now') WHERE id=?`,
      ...fields, existing.id,
    )
    id = existing.id
  } else {
    id = Number(run(
      `INSERT INTO content (type_id, slug, title, subtitle, summary, body, cover, payload,
        access_type, price, course_id, status, published_at, featured, sort_order)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      tid, c.slug, ...fields,
    ).lastInsertRowid)
  }

  run(`DELETE FROM content_categories WHERE content_id=?`, id)
  for (const [taxonomy, title] of c.categories ?? []) {
    const cid = catId(taxonomy, title)
    if (cid) run(`INSERT OR IGNORE INTO content_categories (content_id, category_id) VALUES (?,?)`, id, cid)
  }

  run(`DELETE FROM content_tags WHERE content_id=?`, id)
  for (const t of c.tags ?? []) {
    const tg = tagId(t)
    if (tg) run(`INSERT OR IGNORE INTO content_tags (content_id, tag_id) VALUES (?,?)`, id, tg)
  }

  return id
}

const contentId = (type, slug) =>
  get(`SELECT id FROM content WHERE type_id=? AND slug=?`, typeId(type), slug)?.id

export { db, run, get, all, upsertContent, contentId, typeId, catId, tagId, moodId, adminId, demoId }

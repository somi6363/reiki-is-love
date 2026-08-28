-- ============================================================================
-- Reiki is Love — schema
--
-- Design rules that follow directly from the brief:
--
-- 1. "Do NOT hard-code the app so only the current sections can exist."
--    Content is ONE polymorphic table (`content`) plus a `content_types`
--    registry row per kind (mantra, meditation, article, chakra, ...). Adding
--    Tarot or Breathwork later is an INSERT into content_types, not a
--    migration. Kind-specific fields live in `content.payload` (JSON), so a
--    new type needs no new columns.
--
-- 2. "Avoid unnecessary duplication."
--    The 21-day Reiki practice and the challenges are structurally identical
--    (an ordered set of days, each with content + a completion mark). They
--    share `programs` / `program_days`, distinguished by programs.kind. This
--    is also why the brief's "do NOT hard-code only 21 days" is satisfied for
--    free: day count is just however many program_days rows exist.
--
-- 3. Access is resolved from ONE table, `entitlements`.
--    Whatever the reason a user may open something -- premium subscription,
--    one-off purchase, course enrolment, or a manual admin grant -- it lands
--    as an entitlement row. Access checks therefore never need to know about
--    payment providers, and "Premium must NOT unlock Reiki courses" is not a
--    special case in code: a membership simply never emits a course-scoped
--    entitlement.
--
-- 4. Astronomy is kept apart from interpretation (brief §32).
--    `calendar_events` holds only computed, falsifiable facts. The spiritual
--    reading is a separate `content` row linked via content_id, and the UI
--    labels it as a traditional perspective.
-- ============================================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Users, roles, sessions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT    UNIQUE,
  phone         TEXT    UNIQUE,
  name          TEXT    NOT NULL DEFAULT '',
  avatar        TEXT,
  -- scrypt: "<saltHex>:<hashHex>". Never store anything reversible.
  password_hash TEXT    NOT NULL,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  last_seen_at  TEXT,
  -- Soft delete so purchases/certificates keep referential integrity.
  disabled_at   TEXT
);

-- Roles are rows, not an enum column, because a user is frequently several at
-- once (the brief: "A user can simultaneously be a Premium Member and own one
-- or more courses"). Note that `premium` and `student` are NOT stored here --
-- they are derived from entitlements, so they can expire without a write.
CREATE TABLE IF NOT EXISTS roles (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  slug  TEXT UNIQUE NOT NULL,           -- guest | user | admin
  title TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  -- Opaque random token; we store only its SHA-256 so a DB leak cannot be
  -- replayed as a login.
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- ---------------------------------------------------------------------------
-- Content type registry  (the extensibility hinge)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS content_types (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT UNIQUE NOT NULL,     -- mantra | meditation | article | ...
  title_fa    TEXT NOT NULL,
  -- Which UI route renders it. Unknown types fall back to a generic renderer,
  -- so a type added by an admin is viewable before any code is written.
  route       TEXT NOT NULL DEFAULT '/content',
  icon        TEXT,
  -- JSON array describing payload fields, used to build the admin form
  -- dynamically. This is what lets an admin add a content type without a dev.
  field_schema TEXT NOT NULL DEFAULT '[]',
  -- Does this type appear in Discover / global search?
  discoverable INTEGER NOT NULL DEFAULT 1,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_system   INTEGER NOT NULL DEFAULT 0   -- system types cannot be deleted
);

-- ---------------------------------------------------------------------------
-- Taxonomy: categories + tags, both dynamic
-- ---------------------------------------------------------------------------

-- `taxonomy` namespaces categories so "آرامش" as a meditation category and
-- "آرامش" as a journal category can coexist without colliding, while still
-- letting one item sit in several (brief §26: one meditation may relate to
-- آرامش + چاکرای قلب + ماه کامل + رهایی).
CREATE TABLE IF NOT EXISTS categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  taxonomy   TEXT NOT NULL DEFAULT 'general',
  slug       TEXT NOT NULL,
  title_fa   TEXT NOT NULL,
  description TEXT,
  cover      TEXT,
  parent_id  INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  hidden     INTEGER NOT NULL DEFAULT 0,
  UNIQUE (taxonomy, slug)
);

CREATE TABLE IF NOT EXISTS tags (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  slug     TEXT UNIQUE NOT NULL,
  title_fa TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- Content
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS content (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  type_id     INTEGER NOT NULL REFERENCES content_types(id),
  slug        TEXT NOT NULL,
  title       TEXT NOT NULL,
  subtitle    TEXT,
  summary     TEXT,
  body        TEXT,                     -- markdown-ish, rendered safely
  cover       TEXT,

  -- Type-specific fields. A mantra keeps {script, translit, meaning, ...};
  -- a meditation keeps {duration_sec, ...}. Kept as JSON so new types need no
  -- schema change. Queried via json_extract where an index is not needed.
  payload     TEXT NOT NULL DEFAULT '{}',

  -- Access (brief §19). Enforced in server/utils/access.ts, never in the UI
  -- alone.
  access_type TEXT NOT NULL DEFAULT 'free'
              CHECK (access_type IN ('free','premium','individual','course','specific')),
  price       INTEGER NOT NULL DEFAULT 0,      -- minor units (Rial/Toman)
  -- For access_type='course': which course unlocks this.
  course_id   INTEGER,

  -- Publishing
  status       TEXT NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft','scheduled','published','hidden')),
  published_at TEXT,
  featured     INTEGER NOT NULL DEFAULT 0,
  sort_order   INTEGER NOT NULL DEFAULT 0,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (type_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_content_type_status ON content(type_id, status, published_at);
CREATE INDEX IF NOT EXISTS idx_content_featured ON content(featured, status);

CREATE TABLE IF NOT EXISTS content_categories (
  content_id  INTEGER NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (content_id, category_id)
);

CREATE TABLE IF NOT EXISTS content_tags (
  content_id INTEGER NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  tag_id     INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (content_id, tag_id)
);

-- Explicit "محتوای مرتبط" (brief §27). Directed, with a relation kind, so a
-- Full Moon event can point at a meditation/mantra/journal prompt and the UI
-- can group them under headings.
CREATE TABLE IF NOT EXISTS content_relations (
  from_id  INTEGER NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  to_id    INTEGER NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  relation TEXT NOT NULL DEFAULT 'related',
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (from_id, to_id, relation)
);

-- ---------------------------------------------------------------------------
-- Media
-- ---------------------------------------------------------------------------

-- Files are never served from a public URL. `storage_key` is an internal path;
-- delivery goes through /api/media/[id] which re-checks entitlement on every
-- request (brief §29: "Do NOT expose protected audio/video/file URLs").
CREATE TABLE IF NOT EXISTS media (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT NOT NULL CHECK (kind IN ('audio','video','image','file')),
  title       TEXT NOT NULL DEFAULT '',
  storage_key TEXT NOT NULL,
  mime        TEXT NOT NULL DEFAULT 'application/octet-stream',
  bytes       INTEGER NOT NULL DEFAULT 0,
  duration_sec INTEGER,
  -- Access is normally inherited from the owning content; set only to make a
  -- file stricter than its parent.
  access_type TEXT CHECK (access_type IN ('free','premium','individual','course','specific')),
  downloadable INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS content_media (
  content_id INTEGER NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  media_id   INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'primary',   -- primary | attachment | preview
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (content_id, media_id, role)
);

-- ---------------------------------------------------------------------------
-- Courses  (separate from `content` on purpose)
-- ---------------------------------------------------------------------------

-- Courses get their own tables rather than being a content type, because they
-- carry structure content does not: module nesting, per-lesson unlock rules,
-- prerequisites, certificates. Lessons still reference `content` for their
-- body, so a lesson can reuse an existing meditation or article.
CREATE TABLE IF NOT EXISTS courses (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT UNIQUE NOT NULL,
  title       TEXT NOT NULL,
  subtitle    TEXT,
  summary     TEXT,
  description TEXT,
  cover       TEXT,
  level       TEXT,                      -- ریکی سطح ۱ / ۲ / ۳ / استاد
  price       INTEGER NOT NULL DEFAULT 0,
  -- Deliberately NOT nullable-to-premium: a course is always bought on its
  -- own. Premium never grants it. See utils/access.ts.
  instructor  TEXT,
  -- Another course that must be owned+completed first (ریکی ۲ needs ریکی ۱).
  prerequisite_course_id INTEGER REFERENCES courses(id) ON DELETE SET NULL,
  certificate_enabled INTEGER NOT NULL DEFAULT 1,
  status      TEXT NOT NULL DEFAULT 'draft'
              CHECK (status IN ('draft','scheduled','published','hidden')),
  published_at TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS course_modules (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id  INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  summary    TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS course_lessons (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  module_id  INTEGER NOT NULL REFERENCES course_modules(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  summary    TEXT,
  body       TEXT,
  -- Optional reuse of a content row (a meditation used as a lesson).
  content_id INTEGER REFERENCES content(id) ON DELETE SET NULL,
  duration_sec INTEGER,

  -- Brief §3: admin controls when a lesson opens.
  unlock_rule TEXT NOT NULL DEFAULT 'immediate'
              CHECK (unlock_rule IN ('immediate','sequential','date','after_previous')),
  unlock_at   TEXT,                      -- for unlock_rule='date'
  -- Free preview lesson even for non-owners.
  is_preview  INTEGER NOT NULL DEFAULT 0,
  homework    TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_lessons_module ON course_lessons(module_id, sort_order);

CREATE TABLE IF NOT EXISTS lesson_media (
  lesson_id INTEGER NOT NULL REFERENCES course_lessons(id) ON DELETE CASCADE,
  media_id  INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (lesson_id, media_id)
);

CREATE TABLE IF NOT EXISTS course_announcements (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title     TEXT NOT NULL,
  body      TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS certificates (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id  INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  serial     TEXT UNIQUE NOT NULL,
  issued_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, course_id)
);

-- ---------------------------------------------------------------------------
-- Programs: the 21-day Reiki practice AND challenges
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS programs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT UNIQUE NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'challenge'
              CHECK (kind IN ('reiki_practice','challenge')),
  title       TEXT NOT NULL,
  summary     TEXT,
  description TEXT,
  cover       TEXT,
  -- Derived from program_days, kept for cheap listing. Never authoritative.
  day_count   INTEGER NOT NULL DEFAULT 0,
  access_type TEXT NOT NULL DEFAULT 'free'
              CHECK (access_type IN ('free','premium','individual','course','specific')),
  price       INTEGER NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'draft'
              CHECK (status IN ('draft','scheduled','published','hidden')),
  published_at TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS program_days (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  program_id  INTEGER NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  day_number  INTEGER NOT NULL,
  title       TEXT NOT NULL,
  instructions TEXT,
  reflection  TEXT,
  journal_prompt TEXT,
  -- Reiki hand positions etc. live here as JSON so other program kinds can
  -- put their own structure in the same column.
  payload     TEXT NOT NULL DEFAULT '{}',
  content_id  INTEGER REFERENCES content(id) ON DELETE SET NULL,
  media_id    INTEGER REFERENCES media(id) ON DELETE SET NULL,
  UNIQUE (program_id, day_number)
);

-- One row per user per program: their run of it.
CREATE TABLE IF NOT EXISTS program_enrollments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  program_id  INTEGER NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  started_at  TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  UNIQUE (user_id, program_id)
);

CREATE TABLE IF NOT EXISTS program_day_logs (
  enrollment_id INTEGER NOT NULL REFERENCES program_enrollments(id) ON DELETE CASCADE,
  day_number    INTEGER NOT NULL,
  done_at       TEXT NOT NULL DEFAULT (datetime('now')),
  note          TEXT,
  PRIMARY KEY (enrollment_id, day_number)
);

-- ---------------------------------------------------------------------------
-- Money: plans, products, purchases -> entitlements
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS membership_plans (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  slug      TEXT UNIQUE NOT NULL,
  title     TEXT NOT NULL,
  period    TEXT NOT NULL CHECK (period IN ('monthly','yearly')),
  price     INTEGER NOT NULL,
  benefits  TEXT NOT NULL DEFAULT '[]',   -- JSON array of Persian bullets
  active    INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- A purchase is provider-agnostic (brief §28). `provider` is free text and
-- `provider_ref` holds whatever the gateway returns, so swapping Zarinpal for
-- IDPay/Stripe touches only server/utils/payments/*.
CREATE TABLE IF NOT EXISTS purchases (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- What was bought. Deliberately loose so future products need no migration.
  item_kind     TEXT NOT NULL CHECK (item_kind IN ('membership','course','content','program','service')),
  item_id       INTEGER NOT NULL,
  amount        INTEGER NOT NULL DEFAULT 0,
  currency      TEXT NOT NULL DEFAULT 'IRT',
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','paid','failed','refunded','granted')),
  provider      TEXT,                    -- null for admin 'granted'
  provider_ref  TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  paid_at       TEXT
);
CREATE INDEX IF NOT EXISTS idx_purchases_user ON purchases(user_id, status);

-- THE access table. Everything readable-but-not-free is one row here.
--
-- scope tells you what it unlocks:
--   premium  -> the whole premium tier            (ref_id NULL)
--   course   -> one course                        (ref_id = courses.id)
--   content  -> one content item                  (ref_id = content.id)
--   program  -> one program                       (ref_id = programs.id)
--
-- Note there is no way for a 'premium' row to imply a 'course' row. That is
-- the brief's hard requirement, expressed as data rather than as an if.
CREATE TABLE IF NOT EXISTS entitlements (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope      TEXT NOT NULL CHECK (scope IN ('premium','course','content','program')),
  ref_id     INTEGER,
  source     TEXT NOT NULL CHECK (source IN ('purchase','admin_grant','gift','trial')),
  purchase_id INTEGER REFERENCES purchases(id) ON DELETE SET NULL,
  starts_at  TEXT NOT NULL DEFAULT (datetime('now')),
  -- NULL = perpetual. Courses are perpetual; memberships expire.
  expires_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_entitlements_lookup
  ON entitlements(user_id, scope, ref_id, revoked_at);

-- ---------------------------------------------------------------------------
-- User state: progress, favorites, journal, intentions
-- ---------------------------------------------------------------------------

-- Generic so "continue listening", "continue course" and counters all share
-- it. position_sec doubles as a mantra counter value for subject_kind='mantra'.
CREATE TABLE IF NOT EXISTS progress (
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_kind TEXT NOT NULL,           -- content | lesson | course | program | mantra
  subject_id   INTEGER NOT NULL,
  position_sec INTEGER NOT NULL DEFAULT 0,
  percent      INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, subject_kind, subject_id)
);
CREATE INDEX IF NOT EXISTS idx_progress_recent ON progress(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS favorites (
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_kind TEXT NOT NULL,           -- content | course | program | media
  subject_id   INTEGER NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, subject_kind, subject_id)
);

-- Private by construction: every read path filters on user_id, and the admin
-- API has no journal endpoints at all (brief §10).
CREATE TABLE IF NOT EXISTS journal_entries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  title       TEXT NOT NULL DEFAULT '',
  body        TEXT NOT NULL DEFAULT '',
  mood        TEXT,
  entry_date  TEXT NOT NULL DEFAULT (date('now')),
  favorite    INTEGER NOT NULL DEFAULT 0,
  -- Optional link back to what prompted it (a Full Moon event, a program day).
  source_kind TEXT,
  source_id   INTEGER,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_journal_user_date ON journal_entries(user_id, entry_date DESC);

CREATE TABLE IF NOT EXISTS journal_tags (
  entry_id INTEGER NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  tag_id   INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (entry_id, tag_id)
);

CREATE TABLE IF NOT EXISTS intentions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  notes       TEXT,
  start_date  TEXT NOT NULL DEFAULT (date('now')),
  status      TEXT NOT NULL DEFAULT 'active'
              CHECK (status IN ('active','completed','archived')),
  mantra_id     INTEGER REFERENCES content(id) ON DELETE SET NULL,
  meditation_id INTEGER REFERENCES content(id) ON DELETE SET NULL,
  practice_id   INTEGER REFERENCES content(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Spiritual calendar: facts only
-- ---------------------------------------------------------------------------

-- Computed rows (is_custom=0) come from lib/astro. They are regenerated, so
-- never edit them by hand. Admin-created events (is_custom=1) coexist here --
-- brief §2 explicitly wants retreats/live sessions on the same calendar.
CREATE TABLE IF NOT EXISTS calendar_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kind       TEXT NOT NULL,             -- new_moon | full_moon | first_quarter |
                                        -- last_quarter | lunar_eclipse |
                                        -- solar_eclipse | equinox_spring | ...
                                        -- | custom:<anything>
  title      TEXT NOT NULL,
  starts_at  TEXT NOT NULL,             -- ISO UTC
  ends_at    TEXT,
  all_day    INTEGER NOT NULL DEFAULT 0,
  -- Verifiable astronomy only: illumination, magnitude, source algorithm.
  astro      TEXT NOT NULL DEFAULT '{}',
  is_custom  INTEGER NOT NULL DEFAULT 0,
  -- The spiritual reading, journal prompts, audio: a normal content row, so it
  -- gets access control and relations for free.
  content_id INTEGER REFERENCES content(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (kind, starts_at)
);
CREATE INDEX IF NOT EXISTS idx_calendar_when ON calendar_events(starts_at);

-- ---------------------------------------------------------------------------
-- Healing services + bookings
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS services (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT UNIQUE NOT NULL,
  title       TEXT NOT NULL,
  summary     TEXT,
  description TEXT,
  duration_min INTEGER NOT NULL DEFAULT 60,
  price       INTEGER NOT NULL DEFAULT 0,
  prep_notes  TEXT,                      -- آماده‌سازی قبل از جلسه
  after_notes TEXT,                      -- مراقبت بعد از جلسه
  faq         TEXT NOT NULL DEFAULT '[]',-- JSON [{q,a}]
  cover       TEXT,
  is_package  INTEGER NOT NULL DEFAULT 0,
  sessions_count INTEGER NOT NULL DEFAULT 1,
  status      TEXT NOT NULL DEFAULT 'published'
              CHECK (status IN ('draft','published','hidden')),
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS bookings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service_id  INTEGER NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  requested_at TEXT NOT NULL DEFAULT (datetime('now')),
  preferred_at TEXT,
  confirmed_at TEXT,
  status      TEXT NOT NULL DEFAULT 'requested'
              CHECK (status IN ('requested','confirmed','completed','cancelled')),
  user_note   TEXT,
  admin_note  TEXT,
  contact     TEXT,
  purchase_id INTEGER REFERENCES purchases(id) ON DELETE SET NULL
);

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS notifications (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  -- NULL user_id = broadcast.
  user_id   INTEGER REFERENCES users(id) ON DELETE CASCADE,
  category  TEXT NOT NULL DEFAULT 'general',
  title     TEXT NOT NULL,
  body      TEXT,
  link      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  read_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS notification_prefs (
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  enabled  INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, category)
);

-- ---------------------------------------------------------------------------
-- Mood -> recommendation mapping  (home "امروز چه حالی داری؟")
-- ---------------------------------------------------------------------------

-- Data, not a switch statement, so an admin can retune what a mood suggests
-- and add new moods without a deploy.
CREATE TABLE IF NOT EXISTS moods (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  slug     TEXT UNIQUE NOT NULL,
  title_fa TEXT NOT NULL,
  icon     TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS mood_recommendations (
  mood_id  INTEGER NOT NULL REFERENCES moods(id) ON DELETE CASCADE,
  -- Either a direct content pick or a whole category to sample from.
  content_id  INTEGER REFERENCES content(id) ON DELETE CASCADE,
  category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS mood_logs (
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mood_id  INTEGER NOT NULL REFERENCES moods(id) ON DELETE CASCADE,
  logged_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Settings + daily messages
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_messages (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  body     TEXT NOT NULL,
  author   TEXT,
  active   INTEGER NOT NULL DEFAULT 1
);

-- ---------------------------------------------------------------------------
-- Search (FTS5)
-- ---------------------------------------------------------------------------

-- One index over every searchable thing, so global search is a single query.
-- Persian works without a custom tokenizer: unicode61 splits on non-letters
-- and Persian is alphabetic. Verified with a match on 'آرامش'.
-- `subject_kind`+`subject_id` let results link back to whatever they are.
CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
  title,
  summary,
  body,
  keywords,
  subject_kind UNINDEXED,
  subject_id   UNINDEXED,
  access_type  UNINDEXED,
  tokenize = 'unicode61 remove_diacritics 2'
);

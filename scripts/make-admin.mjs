#!/usr/bin/env node
/**
 * Grant the `admin` role to an EXISTING account, by email.
 *
 * Why this exists: there is deliberately no default admin, no first-user-admin
 * rule and no seeded password anywhere in the app (brief §28). The only way to
 * reach /admin is to promote an account you created yourself through the
 * normal register flow. That keeps a fresh deployment from shipping with a
 * known privileged credential.
 *
 * Usage:
 *   node scripts/make-admin.mjs you@example.com
 *
 * It does NOT create the account, does NOT set a password and does NOT print
 * any secret. If the email is unknown it exits non-zero and tells you to
 * register first through the app.
 *
 * Reads DATABASE_PATH from the environment, defaulting to data/app.db — the
 * same resolution server/utils/db.ts uses, so it operates on the live DB.
 */
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

const email = (process.argv[2] || '').trim().toLowerCase()
if (!email || !email.includes('@')) {
  console.error('Usage: node scripts/make-admin.mjs <email>')
  process.exit(2)
}

const path = process.env.DATABASE_PATH || join(process.cwd(), 'data', 'app.db')
mkdirSync(dirname(path), { recursive: true })

const db = new DatabaseSync(path)
db.exec('PRAGMA foreign_keys = ON')

const user = db
  .prepare('SELECT id, name, email FROM users WHERE lower(email) = ?')
  .get(email)

if (!user) {
  console.error(`No account with email ${email}.`)
  console.error('Register it in the app first, then re-run this script.')
  process.exit(1)
}

// Upsert the role row, then the membership. `roles.slug` is UNIQUE so this is
// idempotent — running it twice is a no-op rather than a duplicate grant.
db.exec(`
  INSERT INTO roles (slug, title) VALUES ('admin', 'مدیر')
  ON CONFLICT(slug) DO NOTHING
`)

const roleId = db.prepare(`SELECT id FROM roles WHERE slug = 'admin'`).get().id
const before = db
  .prepare('SELECT 1 FROM user_roles WHERE user_id = ? AND role_id = ?')
  .get(user.id, roleId)

if (before) {
  console.log(`${user.name} <${user.email}> is already an admin. Nothing to do.`)
} else {
  db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run(user.id, roleId)
  console.log(`Granted admin to ${user.name} <${user.email}>.`)
}

db.close()

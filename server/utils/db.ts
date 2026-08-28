/**
 * SQLite connection + tiny query helpers.
 *
 * Uses node:sqlite (Node 22 built-in) rather than better-sqlite3: native
 * modules have no musllinux aarch64 prebuilds and would have to compile from
 * source in this sandbox. Verified working, including FTS5 with Persian text.
 *
 * The DatabaseSync API is synchronous. That is fine for Nitro here: SQLite
 * reads are microseconds and WAL mode allows concurrent readers. If this ever
 * moves to Postgres, only this file and the query call sites change.
 */
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

let db: DatabaseSync | null = null

const dbPath = () => process.env.DATABASE_PATH || join(process.cwd(), 'data', 'app.db')

export const getDb = (): DatabaseSync => {
  if (db) return db

  const path = dbPath()
  mkdirSync(dirname(path), { recursive: true })
  db = new DatabaseSync(path)

  // WAL: readers never block the writer. Matters because Nitro handles
  // requests concurrently while a write is in flight.
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  // Wait rather than throw SQLITE_BUSY under concurrent writes.
  db.exec('PRAGMA busy_timeout = 5000')

  return db
}

/** Apply schema.sql. Idempotent — every statement is CREATE ... IF NOT EXISTS. */
export const migrate = () => {
  const d = getDb()
  const schemaPath = join(process.cwd(), 'server', 'db', 'schema.sql')
  if (!existsSync(schemaPath)) throw new Error(`schema.sql not found at ${schemaPath}`)
  d.exec(readFileSync(schemaPath, 'utf8'))
}

/** Rows as plain objects. */
export const all = <T = any>(sql: string, ...params: any[]): T[] =>
  getDb().prepare(sql).all(...params) as T[]

/** First row or undefined. */
export const get = <T = any>(sql: string, ...params: any[]): T | undefined =>
  getDb().prepare(sql).get(...params) as T | undefined

/** INSERT/UPDATE/DELETE. Returns lastInsertRowid + changes. */
export const run = (sql: string, ...params: any[]) => getDb().prepare(sql).run(...params)

/** Scalar helper for counts and single values. */
export const scalar = <T = any>(sql: string, ...params: any[]): T | undefined => {
  const row = get<Record<string, any>>(sql, ...params)
  return row ? (Object.values(row)[0] as T) : undefined
}

/**
 * Run fn inside a transaction. node:sqlite has no wrapper API, so this drives
 * BEGIN/COMMIT directly. Nested calls reuse the outer transaction rather than
 * failing on "cannot start a transaction within a transaction".
 */
let txDepth = 0
export const tx = <T>(fn: () => T): T => {
  const d = getDb()
  if (txDepth++ === 0) d.exec('BEGIN')
  try {
    const out = fn()
    if (--txDepth === 0) d.exec('COMMIT')
    return out
  } catch (e) {
    if (--txDepth === 0) d.exec('ROLLBACK')
    throw e
  }
}

/** JSON columns: parse defensively so one bad row cannot 500 a whole list. */
export const parseJson = <T>(raw: unknown, fallback: T): T => {
  if (typeof raw !== 'string' || !raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

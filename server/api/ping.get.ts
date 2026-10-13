/**
 * Liveness/readiness probe. Referenced by the service worker's reachability
 * check and used as the deployment platform's healthcheck path.
 *
 * Deliberately does not touch the database: a probe that fails when SQLite is
 * briefly busy would cause pointless restarts. Anything deeper than "the
 * process is answering HTTP" belongs in a real monitoring check.
 */
export default defineEventHandler(() => ({ ok: true, ts: new Date().toISOString() }))

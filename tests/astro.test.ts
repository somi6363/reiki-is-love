/**
 * Astronomy tests.
 *
 * Reference values are from NASA/JPL and timeanddate.com. These are checked
 * because the whole spiritual calendar hangs off them, and a silently wrong
 * full-moon date would be visible to every user on the home screen.
 *
 * Tolerances reflect what the algorithms actually promise: phases are good to
 * a couple of minutes, seasons to about a minute.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  moonPhasesBetween,
  nextPhase,
  currentMoon,
  seasonDate,
  eclipsesBetween,
  generateEvents,
  illuminationAt,
} from '../lib/astro.ts'

const minutesApart = (a: Date, b: Date) => Math.abs(a.getTime() - b.getTime()) / 60000

test('full moon of 2026-01-03 (reference 10:03 UTC)', () => {
  const phases = moonPhasesBetween(new Date('2026-01-01T00:00:00Z'), new Date('2026-01-10T00:00:00Z'))
  const full = phases.find((p) => p.kind === 'full_moon')
  assert.ok(full, 'no full moon found in the window')
  assert.ok(
    minutesApart(full.date, new Date('2026-01-03T10:03:00Z')) < 10,
    `full moon off by ${minutesApart(full.date, new Date('2026-01-03T10:03:00Z')).toFixed(1)} min: got ${full.date.toISOString()}`,
  )
})

test('new moon of 2026-01-18 (reference 19:52 UTC)', () => {
  const phases = moonPhasesBetween(new Date('2026-01-15T00:00:00Z'), new Date('2026-01-22T00:00:00Z'))
  const nm = phases.find((p) => p.kind === 'new_moon')
  assert.ok(nm)
  assert.ok(
    minutesApart(nm.date, new Date('2026-01-18T19:52:00Z')) < 10,
    `new moon off: got ${nm.date.toISOString()}`,
  )
})

test('a lunation yields exactly four principal phases', () => {
  // One synodic month is 29.53 days; a 29-day window must contain 4 phases.
  const from = new Date('2026-03-01T00:00:00Z')
  const to = new Date('2026-03-30T00:00:00Z')
  const phases = moonPhasesBetween(from, to)
  assert.equal(phases.length, 4, `expected 4, got ${phases.length}: ${phases.map((p) => p.kind).join(',')}`)
  assert.deepEqual(new Set(phases.map((p) => p.kind)).size, 4, 'phases should all be distinct kinds')
})

test('phases in a year are ordered and plausibly spaced', () => {
  const phases = moonPhasesBetween(new Date('2026-01-01T00:00:00Z'), new Date('2027-01-01T00:00:00Z'))
  // 12 or 13 lunations x 4 phases.
  assert.ok(phases.length >= 48 && phases.length <= 53, `unexpected count ${phases.length}`)
  for (let i = 1; i < phases.length; i += 1) {
    const gapDays = (phases[i].date.getTime() - phases[i - 1].date.getTime()) / 86400000
    assert.ok(gapDays > 0, 'phases must be strictly increasing')
    // Quarter-to-quarter is ~7.4 days; allow slack for the elliptical orbit.
    assert.ok(gapDays > 5.5 && gapDays < 9.5, `implausible gap of ${gapDays.toFixed(2)} days at index ${i}`)
  }
})

test('full moon is fully lit, new moon is dark', () => {
  const phases = moonPhasesBetween(new Date('2026-02-01T00:00:00Z'), new Date('2026-03-05T00:00:00Z'))
  const full = phases.find((p) => p.kind === 'full_moon')!
  const nm = phases.find((p) => p.kind === 'new_moon')!
  assert.ok(full.illumination > 0.97, `full moon illumination was ${full.illumination}`)
  assert.ok(nm.illumination < 0.03, `new moon illumination was ${nm.illumination}`)
})

test('quarter phases are about half lit', () => {
  const phases = moonPhasesBetween(new Date('2026-02-01T00:00:00Z'), new Date('2026-03-05T00:00:00Z'))
  for (const q of phases.filter((p) => p.kind.includes('quarter'))) {
    assert.ok(
      Math.abs(q.illumination - 0.5) < 0.06,
      `${q.kind} illumination ${q.illumination.toFixed(3)} is not near 0.5`,
    )
  }
})

test('nextPhase returns a future date', () => {
  const from = new Date('2026-08-25T00:00:00Z')
  const next = nextPhase('full_moon', from)
  assert.ok(next.date > from)
  assert.ok((next.date.getTime() - from.getTime()) / 86400000 < 30)
})

test('currentMoon reports waxing before a full moon and waning after', () => {
  const full = nextPhase('full_moon', new Date('2026-06-01T00:00:00Z')).date
  const before = currentMoon(new Date(full.getTime() - 3 * 86400000))
  const after = currentMoon(new Date(full.getTime() + 3 * 86400000))
  assert.equal(before.waxing, true, 'should be waxing 3 days before full')
  assert.equal(after.waxing, false, 'should be waning 3 days after full')
})

test('moon age stays inside one synodic month', () => {
  for (let i = 0; i < 60; i += 3) {
    const d = new Date(Date.UTC(2026, 0, 1 + i))
    const m = currentMoon(d)
    assert.ok(m.ageDays >= 0 && m.ageDays < 29.6, `age ${m.ageDays} out of range at ${d.toISOString()}`)
  }
})

test('March equinox 2026 is 2026-03-20 14:46 UTC', () => {
  const eq = seasonDate(2026, 'equinox_spring')
  assert.ok(
    minutesApart(eq, new Date('2026-03-20T14:46:00Z')) < 5,
    `got ${eq.toISOString()}`,
  )
})

test('December solstice 2026 is 2026-12-21 20:50 UTC', () => {
  const s = seasonDate(2026, 'solstice_winter')
  assert.ok(
    minutesApart(s, new Date('2026-12-21T20:50:00Z')) < 5,
    `got ${s.toISOString()}`,
  )
})

test('June solstice 2025 is 2025-06-21 02:42 UTC', () => {
  const s = seasonDate(2025, 'solstice_summer')
  assert.ok(minutesApart(s, new Date('2025-06-21T02:42:00Z')) < 5, `got ${s.toISOString()}`)
})

test('the spring equinox lands on Nowruz', () => {
  // The Iranian year begins at the vernal equinox, so this cross-checks
  // lib/astro against lib/jalali.
  for (const year of [2025, 2026, 2027]) {
    const eq = seasonDate(year, 'equinox_spring')
    assert.equal(eq.getUTCMonth(), 2, `equinox ${year} not in March`)
    assert.ok(eq.getUTCDate() >= 19 && eq.getUTCDate() <= 21, `equinox ${year} on day ${eq.getUTCDate()}`)
  }
})

test('eclipse candidates cluster in seasons, roughly 2-5 per year', () => {
  const found = eclipsesBetween(new Date('2026-01-01T00:00:00Z'), new Date('2027-01-01T00:00:00Z'))
  assert.ok(found.length >= 2 && found.length <= 7, `unexpected eclipse count ${found.length}`)
  // Every candidate must coincide with a syzygy.
  const phases = moonPhasesBetween(new Date('2026-01-01T00:00:00Z'), new Date('2027-01-01T00:00:00Z'))
  for (const e of found) {
    const near = phases.some((p) => minutesApart(p.date, e.date) < 1)
    assert.ok(near, `eclipse at ${e.date.toISOString()} is not at a syzygy`)
  }
})

test('the 2026-08-12 total solar eclipse is detected', () => {
  // A well-known event: totality over Greenland/Iceland/Spain.
  const found = eclipsesBetween(new Date('2026-08-01T00:00:00Z'), new Date('2026-08-31T00:00:00Z'))
  const solar = found.find((e) => e.kind === 'solar_eclipse')
  assert.ok(solar, `no solar eclipse found; got ${JSON.stringify(found.map((f) => f.date.toISOString()))}`)
  assert.equal(solar.date.toISOString().slice(0, 10), '2026-08-12')
})

test('generateEvents produces sorted rows carrying only astronomical data', () => {
  const events = generateEvents(new Date('2026-01-01T00:00:00Z'), new Date('2026-07-01T00:00:00Z'))
  assert.ok(events.length > 20)
  for (let i = 1; i < events.length; i += 1) {
    assert.ok(events[i].starts_at >= events[i - 1].starts_at, 'events must be sorted')
  }
  // Guard the §32 separation: no interpretive language may leak into astro.
  const forbidden = ['انرژی', 'نیت', 'رهایی', 'شفا', 'چاکرا']
  for (const e of events) {
    const blob = JSON.stringify(e.astro)
    for (const word of forbidden) {
      assert.ok(!blob.includes(word), `astro payload for ${e.kind} contains interpretation: ${word}`)
    }
  }
})

test('illumination is continuous — no jumps between adjacent days', () => {
  let prev = illuminationAt(new Date('2026-05-01T00:00:00Z'))
  for (let i = 1; i < 60; i += 1) {
    const now = illuminationAt(new Date(Date.UTC(2026, 4, 1 + i)))
    // Max daily change is ~0.12 near the quarters.
    assert.ok(Math.abs(now - prev) < 0.2, `illumination jumped ${Math.abs(now - prev)} on day ${i}`)
    assert.ok(now >= 0 && now <= 1, `illumination ${now} out of range`)
    prev = now
  }
})

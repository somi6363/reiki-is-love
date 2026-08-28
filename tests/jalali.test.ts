/**
 * Jalali conversion tests.
 *
 * Reference dates verified against known Nowruz boundaries and the Iranian
 * civil calendar. If any of these drift, the whole calendar UI is wrong, so
 * they run in CI.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toJalali, toGregorian, formatJalali, faNum, jalaliMonthLength, isJalaliLeap } from '../lib/jalali.ts'

test('Nowruz 1404 = 2025-03-21', () => {
  const j = toJalali(new Date(2025, 2, 21))
  assert.deepEqual(j, { jy: 1404, jm: 1, jd: 1 })
})

test('Nowruz 1405 = 2026-03-21', () => {
  const j = toJalali(new Date(2026, 2, 21))
  assert.deepEqual(j, { jy: 1405, jm: 1, jd: 1 })
})

test('day before Nowruz 1404 is the last day of esfand 1403', () => {
  // 1403 is a leap year, so esfand has 30 days.
  assert.deepEqual(toJalali(new Date(2025, 2, 20)), { jy: 1403, jm: 12, jd: 30 })
})

test('day before Nowruz 1405 is the last day of esfand 1404', () => {
  // 1404 is not a leap year, so esfand has 29 days.
  assert.deepEqual(toJalali(new Date(2026, 2, 20)), { jy: 1404, jm: 12, jd: 29 })
})

test('the brief was written on 1405-06-03 (2026-08-25)', () => {
  const j = toJalali(new Date(2026, 7, 25))
  assert.deepEqual(j, { jy: 1405, jm: 6, jd: 3 })
})

test('round-trips across a full year', () => {
  for (let i = 0; i < 400; i += 7) {
    const d = new Date(2026, 0, 1 + i)
    const back = toGregorian(toJalali(d))
    assert.equal(
      back.toISOString().slice(0, 10),
      new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().slice(0, 10),
      `round-trip failed for ${d.toDateString()}`,
    )
  }
})

test('month lengths: first six are 31, next five are 30', () => {
  for (let m = 1; m <= 6; m += 1) assert.equal(jalaliMonthLength(1405, m), 31)
  for (let m = 7; m <= 11; m += 1) assert.equal(jalaliMonthLength(1405, m), 30)
})

test('esfand is 30 days in a leap year, 29 otherwise', () => {
  // 1403 is a leap year in the Solar Hijri calendar.
  assert.equal(isJalaliLeap(1403), true)
  assert.equal(jalaliMonthLength(1403, 12), 30)
  assert.equal(jalaliMonthLength(1404, 12), 29)
})

test('digits are converted to Persian', () => {
  assert.equal(faNum(1405), '۱۴۰۵')
  assert.equal(faNum('21 روز'), '۲۱ روز')
})

/**
 * The strongest check available: cross-validate every day for four years
 * against ICU's own Persian calendar, which ships with Node (full-icu here).
 *
 * This is what caught the original bug — an off-by-one for every date between
 * Dey and Esfand, produced by re-reading the leap flag AFTER decrementing the
 * year. Individual spot-checks had passed.
 */
test('matches ICU persian calendar for 4 years of daily dates', () => {
  const fmt = new Intl.DateTimeFormat('en-u-ca-persian-nu-latn', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    timeZone: 'UTC',
  })

  let checked = 0
  for (let i = 0; i < 365 * 4; i += 1) {
    // Midday UTC keeps the local-time Date fields and the UTC formatter on the
    // same calendar day regardless of timezone.
    const d = new Date(Date.UTC(2024, 0, 1 + i, 12))
    const local = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())

    const [m, day, y] = fmt.format(d).replace(' AP', '').split('/').map(Number)
    const mine = toJalali(local)

    assert.deepEqual(
      mine,
      { jy: y, jm: m, jd: day },
      `mismatch at ${d.toISOString().slice(0, 10)}: got ${mine.jy}/${mine.jm}/${mine.jd}, ICU says ${y}/${m}/${day}`,
    )
    checked += 1
  }
  assert.equal(checked, 1460)
})

test('formatted date is Persian with weekday', () => {
  // 2026-08-25 is a Tuesday.
  assert.equal(formatJalali(new Date(2026, 7, 25)), 'سه‌شنبه ۳ شهریور ۱۴۰۵')
})

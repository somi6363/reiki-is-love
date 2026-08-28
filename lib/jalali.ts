/**
 * Jalali (Solar Hijri) calendar conversion — no dependencies.
 *
 * Uses the standard arithmetic algorithm (Borkowski / jalaali-js approach),
 * accurate for Jalali years 1178–1633 (≈1800–2254 CE), which covers anything
 * this app will display.
 *
 * Kept dependency-free deliberately: adding a date library for one conversion
 * is not worth the supply-chain surface, and the algorithm is stable.
 */

const breaks = [
  -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192,
  2262, 2324, 2394, 2456, 3178,
]

interface JalaliCal {
  leap: number
  gy: number
  march: number
}

/** Which Jalali year contains Gregorian year gy, plus leap info. */
const jalCal = (jy: number): JalaliCal => {
  const bl = breaks.length
  const gy = jy + 621
  let leapJ = -14
  let jp = breaks[0]

  if (jy < jp || jy >= breaks[bl - 1]) throw new Error(`سال خارج از محدوده: ${jy}`)

  let jump = 0
  for (let i = 1; i < bl; i += 1) {
    const jm = breaks[i]
    jump = jm - jp
    if (jy < jm) break
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4)
    jp = jm
  }
  let n = jy - jp

  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4)
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1

  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150
  const march = 20 + leapJ - leapG

  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33
  let leap = mod(mod(n + 1, 33) - 1, 4)
  if (leap === -1) leap = 4

  return { leap, gy, march }
}

const div = (a: number, b: number) => Math.trunc(a / b)
const mod = (a: number, b: number) => a - Math.trunc(a / b) * b

/** Gregorian y/m/d -> Julian Day Number. */
const g2d = (gy: number, gm: number, gd: number): number => {
  let d =
    div((gy + div(gm - 8, 6) + 100100) * 1461, 4) +
    div(153 * mod(gm + 9, 12) + 2, 5) +
    gd -
    34840408
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752
  return d
}

/** Julian Day Number -> Gregorian. */
const d2g = (jdn: number) => {
  let j = 4 * jdn + 139361631
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908
  const i = div(mod(j, 1461), 4) * 5 + 308
  const gd = div(mod(i, 153), 5) + 1
  const gm = mod(div(i, 153), 12) + 1
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6)
  return { gy, gm, gd }
}

export interface JalaliDate {
  jy: number
  jm: number
  jd: number
}

export const toJalali = (date: Date): JalaliDate => {
  const gy = date.getFullYear()
  const gm = date.getMonth() + 1
  const gd = date.getDate()

  let jy = gy - 621
  // Capture the leap flag for THIS Jalali year before any adjustment below.
  // Reading it after `jy -= 1` is a classic off-by-one: it makes every date in
  // the Dey–Esfand window (i.e. January to March) one day late.
  const r = jalCal(jy)
  const gd2 = g2d(gy, gm, gd)
  let jd: number
  let jm: number

  const march1 = g2d(gy, 3, r.march)
  let k = gd2 - march1

  if (k >= 0) {
    if (k <= 185) {
      // First 6 months: 31 days each.
      jm = 1 + div(k, 31)
      jd = mod(k, 31) + 1
      return { jy, jm, jd }
    }
    k -= 186
  } else {
    // Before Nowruz: the date belongs to the previous Jalali year.
    jy -= 1
    k += 179
    if (r.leap === 1) k += 1
  }
  jm = 7 + div(k, 30)
  jd = mod(k, 30) + 1
  return { jy, jm, jd }
}

export const toGregorian = ({ jy, jm, jd }: JalaliDate): Date => {
  const r = jalCal(jy)
  const jdn =
    g2d(r.gy, 3, r.march) +
    (jm - 1) * 31 -
    div(jm, 7) * (jm - 7) +
    jd -
    1
  const { gy, gm, gd } = d2g(jdn)
  return new Date(Date.UTC(gy, gm - 1, gd))
}

export const isJalaliLeap = (jy: number) => jalCal(jy).leap === 0

export const jalaliMonthLength = (jy: number, jm: number): number => {
  if (jm <= 6) return 31
  if (jm <= 11) return 30
  return isJalaliLeap(jy) ? 30 : 29
}

export const MONTHS_FA = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
]

// Sunday = 0 in JS; Persian week starts Saturday.
export const WEEKDAYS_FA = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه']

const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹']

/** Latin digits -> Persian. Used everywhere numbers are shown to the user. */
export const faNum = (input: string | number): string =>
  String(input).replace(/\d/g, (d) => FA_DIGITS[Number(d)])

/** e.g. "پنجشنبه ۳ مهر ۱۴۰۵" */
export const formatJalali = (date: Date, withWeekday = true): string => {
  const { jy, jm, jd } = toJalali(date)
  const body = `${faNum(jd)} ${MONTHS_FA[jm - 1]} ${faNum(jy)}`
  if (!withWeekday) return body
  return `${WEEKDAYS_FA[date.getDay()]} ${body}`
}

/** e.g. "۱۴۰۵/۰۷/۰۳" */
export const formatJalaliShort = (date: Date): string => {
  const { jy, jm, jd } = toJalali(date)
  return faNum(`${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`)
}

/** "۲ روز پیش" / "فردا" — relative labels for feeds and streaks. */
export const relativeFa = (date: Date, now = new Date()): string => {
  const days = Math.round((startOfDay(date).getTime() - startOfDay(now).getTime()) / 86400_000)
  if (days === 0) return 'امروز'
  if (days === 1) return 'فردا'
  if (days === -1) return 'دیروز'
  if (days > 0) return `${faNum(days)} روز دیگر`
  return `${faNum(-days)} روز پیش`
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

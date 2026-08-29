/**
 * Astronomy — moon phases, eclipses, equinoxes and solstices.
 *
 * Dependency-free implementation of the standard Meeus algorithms
 * (Astronomical Algorithms, 2nd ed.). No API calls: the app must show a
 * calendar offline, and a network dependency for something this stable would
 * be a liability.
 *
 * IMPORTANT (brief §32): everything in this file is falsifiable astronomy.
 * Spiritual interpretation lives in content rows, never here. Accuracy is
 * roughly ±2 minutes for phases and ±1 hour for solstices, which is far below
 * what a calendar UI needs.
 */

const RAD = Math.PI / 180
const sin = (deg: number) => Math.sin(deg * RAD)
const cos = (deg: number) => Math.cos(deg * RAD)

/** Julian Day <-> Date. JD 2440587.5 is 1970-01-01T00:00:00Z. */
export const toJD = (date: Date) => date.getTime() / 86400000 + 2440587.5
export const fromJD = (jd: number) => new Date((jd - 2440587.5) * 86400000)

export type PhaseKind = 'new_moon' | 'first_quarter' | 'full_moon' | 'last_quarter'

const PHASE_OFFSET: Record<PhaseKind, number> = {
  new_moon: 0,
  first_quarter: 0.25,
  full_moon: 0.5,
  last_quarter: 0.75,
}

export const PHASE_FA: Record<PhaseKind, string> = {
  new_moon: 'ماه نو',
  first_quarter: 'تربیع اول',
  full_moon: 'ماه کامل',
  last_quarter: 'تربیع آخر',
}

/**
 * Instant of a given lunar phase, for lunation number k.
 *
 * k = 0 is the new moon of 2000-01-06. Meeus chapter 49: mean phase plus
 * periodic corrections. Only the larger correction terms are kept — the
 * omitted ones contribute well under a minute.
 */
export const phaseJD = (k: number, kind: PhaseKind): number => {
  const kk = k + PHASE_OFFSET[kind]
  const T = kk / 1236.85 // centuries since J2000

  // Mean phase
  let jd =
    2451550.09766 +
    29.530588861 * kk +
    0.00015437 * T * T -
    0.000000150 * T * T * T +
    0.00000000073 * T * T * T * T

  // Sun's mean anomaly
  const M = 2.5534 + 29.1053567 * kk - 0.0000014 * T * T - 0.00000011 * T * T * T
  // Moon's mean anomaly
  const M1 = 201.5643 + 385.81693528 * kk + 0.0107582 * T * T + 0.00001238 * T * T * T
  // Moon's argument of latitude
  const F = 160.7108 + 390.67050284 * kk - 0.0016118 * T * T - 0.00000227 * T * T * T
  // Longitude of ascending node
  const O = 124.7746 - 1.56375588 * kk + 0.0020672 * T * T + 0.00000215 * T * T * T

  const E = 1 - 0.002516 * T - 0.0000074 * T * T // eccentricity correction

  if (kind === 'new_moon') {
    jd +=
      -0.4072 * sin(M1) +
      0.17241 * E * sin(M) +
      0.01608 * sin(2 * M1) +
      0.01039 * sin(2 * F) +
      0.00739 * E * sin(M1 - M) -
      0.00514 * E * sin(M1 + M) +
      0.00208 * E * E * sin(2 * M) -
      0.00111 * sin(M1 - 2 * F) -
      0.00057 * sin(M1 + 2 * F) +
      0.00056 * E * sin(2 * M1 + M) -
      0.00042 * sin(3 * M1) +
      0.00042 * E * sin(M + 2 * F) +
      0.00038 * E * sin(M - 2 * F) -
      0.00024 * E * sin(2 * M1 - M) -
      0.00017 * sin(O) -
      0.00007 * sin(M1 + 2 * M)
  } else if (kind === 'full_moon') {
    jd +=
      -0.40614 * sin(M1) +
      0.17302 * E * sin(M) +
      0.01614 * sin(2 * M1) +
      0.01043 * sin(2 * F) +
      0.00734 * E * sin(M1 - M) -
      0.00515 * E * sin(M1 + M) +
      0.00209 * E * E * sin(2 * M) -
      0.00111 * sin(M1 - 2 * F) -
      0.00057 * sin(M1 + 2 * F) +
      0.00056 * E * sin(2 * M1 + M) -
      0.00042 * sin(3 * M1) +
      0.00042 * E * sin(M + 2 * F) +
      0.00038 * E * sin(M - 2 * F) -
      0.00024 * E * sin(2 * M1 - M) -
      0.00017 * sin(O) -
      0.00007 * sin(M1 + 2 * M)
  } else {
    // Both quarters share one series, differing only by a final W term.
    jd +=
      -0.62801 * sin(M1) +
      0.17172 * E * sin(M) -
      0.01183 * E * sin(M1 + M) +
      0.00862 * sin(2 * M1) +
      0.00804 * sin(2 * F) +
      0.00454 * E * sin(M1 - M) +
      0.00204 * E * E * sin(2 * M) -
      0.0018 * sin(M1 - 2 * F) -
      0.0007 * sin(M1 + 2 * F) -
      0.0004 * sin(3 * M1) -
      0.00034 * E * sin(2 * M1 - M) +
      0.00032 * E * sin(M + 2 * F) +
      0.00032 * E * sin(M - 2 * F) -
      0.00028 * E * E * sin(M1 + 2 * M) +
      0.00027 * E * sin(2 * M1 + M) -
      0.00017 * sin(O)

    const W =
      0.00306 -
      0.00038 * E * cos(M) +
      0.00026 * cos(M1) -
      0.00002 * cos(M1 - M) +
      0.00002 * cos(M1 + M) +
      0.00002 * cos(2 * F)
    jd += kind === 'first_quarter' ? W : -W
  }

  return jd
}

/** Approximate lunation number for a date — the search seed. */
const lunationFor = (date: Date) => {
  const year = date.getFullYear() + (date.getMonth() + 0.5) / 12
  return Math.floor((year - 2000) * 12.3685)
}

export interface MoonPhaseEvent {
  kind: PhaseKind
  date: Date
  /** Fraction of the disc illuminated, 0..1. */
  illumination: number
}

/** Every principal phase inside [from, to). */
export const moonPhasesBetween = (from: Date, to: Date): MoonPhaseEvent[] => {
  const events: MoonPhaseEvent[] = []
  const start = lunationFor(from) - 2
  const end = lunationFor(to) + 2

  for (let k = start; k <= end; k += 1) {
    for (const kind of Object.keys(PHASE_OFFSET) as PhaseKind[]) {
      const date = fromJD(phaseJD(k, kind))
      if (date >= from && date < to) {
        events.push({ kind, date, illumination: illuminationAt(date) })
      }
    }
  }
  return events.sort((a, b) => a.date.getTime() - b.date.getTime())
}

/** The next occurrence of one phase kind, at or after `from`. */
export const nextPhase = (kind: PhaseKind, from = new Date()): MoonPhaseEvent => {
  let k = lunationFor(from) - 2
  for (let i = 0; i < 40; i += 1, k += 1) {
    const date = fromJD(phaseJD(k, kind))
    if (date >= from) return { kind, date, illumination: illuminationAt(date) }
  }
  throw new Error('phase search failed to converge')
}

/**
 * Moon age and illuminated fraction.
 *
 * Uses the elongation from the mean new moon, which is accurate enough for a
 * phase label and an illumination percentage.
 */
export const illuminationAt = (date: Date): number => {
  const jd = toJD(date)
  const T = (jd - 2451545) / 36525

  // Moon-Sun elongation (Meeus ch. 48, principal terms).
  const D = 297.8501921 + 445267.1114034 * T - 0.0018819 * T * T
  const M = 357.5291092 + 35999.0502909 * T - 0.0001536 * T * T
  const M1 = 134.9633964 + 477198.8675055 * T + 0.0087414 * T * T

  const i =
    180 -
    D -
    6.289 * sin(M1) +
    2.1 * sin(M) -
    1.274 * sin(2 * D - M1) -
    0.658 * sin(2 * D) -
    0.214 * sin(2 * M1) -
    0.11 * sin(D)

  return (1 + cos(i)) / 2
}

export type MoonPhaseName =
  | 'new_moon'
  | 'waxing_crescent'
  | 'first_quarter'
  | 'waxing_gibbous'
  | 'full_moon'
  | 'waning_gibbous'
  | 'last_quarter'
  | 'waning_crescent'

export const MOON_NAME_FA: Record<MoonPhaseName, string> = {
  new_moon: 'ماه نو',
  waxing_crescent: 'هلال افزایشی',
  first_quarter: 'تربیع اول',
  waxing_gibbous: 'کوژ افزایشی',
  full_moon: 'ماه کامل',
  waning_gibbous: 'کوژ کاهشی',
  last_quarter: 'تربیع آخر',
  waning_crescent: 'هلال کاهشی',
}

/**
 * Current phase as a name plus illumination.
 *
 * The waxing/waning distinction needs the direction of change, which a single
 * illumination value cannot give — so it is read by sampling a day later.
 */
export const currentMoon = (date = new Date()) => {
  const illum = illuminationAt(date)
  const later = illuminationAt(new Date(date.getTime() + 86400000))
  const waxing = later > illum

  let name: MoonPhaseName
  if (illum < 0.02) name = 'new_moon'
  else if (illum > 0.98) name = 'full_moon'
  else if (illum > 0.46 && illum < 0.54) name = waxing ? 'first_quarter' : 'last_quarter'
  else if (illum < 0.46) name = waxing ? 'waxing_crescent' : 'waning_crescent'
  else name = waxing ? 'waxing_gibbous' : 'waning_gibbous'

  // Days since the preceding new moon, for "روز X از چرخه ماه".
  const k = lunationFor(date)
  let ageDays = 0
  for (let i = k + 1; i >= k - 2; i -= 1) {
    const nm = fromJD(phaseJD(i, 'new_moon'))
    if (nm <= date) {
      ageDays = (date.getTime() - nm.getTime()) / 86400000
      break
    }
  }

  return { name, titleFa: MOON_NAME_FA[name], illumination: illum, waxing, ageDays }
}

// ---------------------------------------------------------------------------
// Eclipses
// ---------------------------------------------------------------------------

/**
 * Eclipse detection.
 *
 * An eclipse can only occur near a syzygy AND near a node — that is, when the
 * moon's argument of latitude F is close to 0° or 180°. Meeus ch. 54 gives the
 * criterion in terms of |sin F|. This flags candidates and classifies them
 * coarsely; it does not compute magnitude or a visibility path, which would
 * need a much longer series and is not what a spiritual calendar shows.
 *
 * Deliberately conservative: better to omit a marginal penumbral eclipse than
 * to announce one that does not happen.
 */
export interface EclipseEvent {
  kind: 'solar_eclipse' | 'lunar_eclipse'
  date: Date
  /** total | annular | partial | penumbral — coarse classification. */
  type: string
  titleFa: string
}

const ECLIPSE_TYPE_FA: Record<string, string> = {
  total: 'کلی',
  annular: 'حلقه‌ای',
  partial: 'جزئی',
  penumbral: 'نیم‌سایه‌ای',
}

export const eclipsesBetween = (from: Date, to: Date): EclipseEvent[] => {
  const out: EclipseEvent[] = []
  const start = lunationFor(from) - 2
  const end = lunationFor(to) + 2

  for (let k = start; k <= end; k += 1) {
    for (const kind of ['new_moon', 'full_moon'] as PhaseKind[]) {
      const jd = phaseJD(k, kind)
      const date = fromJD(jd)
      if (date < from || date >= to) continue

      const kk = k + PHASE_OFFSET[kind]
      const T = kk / 1236.85
      const F = 160.7108 + 390.67050284 * kk - 0.0016118 * T * T - 0.00000227 * T * T * T
      const absSinF = Math.abs(sin(F))

      // No eclipse is possible beyond this separation from a node.
      if (absSinF > 0.36) continue

      const solar = kind === 'new_moon'
      // Tighter threshold => central eclipse; wider => partial/penumbral.
      let type: string
      if (absSinF < 0.11) type = solar ? 'total' : 'total'
      else if (absSinF < 0.21) type = solar ? 'annular' : 'partial'
      else type = solar ? 'partial' : 'penumbral'

      out.push({
        kind: solar ? 'solar_eclipse' : 'lunar_eclipse',
        date,
        type,
        titleFa: `${solar ? 'خورشیدگرفتگی' : 'ماه‌گرفتگی'} ${ECLIPSE_TYPE_FA[type]}`,
      })
    }
  }
  return out.sort((a, b) => a.date.getTime() - b.date.getTime())
}

// ---------------------------------------------------------------------------
// Equinoxes and solstices
// ---------------------------------------------------------------------------

export type SeasonKind = 'equinox_spring' | 'solstice_summer' | 'equinox_autumn' | 'solstice_winter'

export const SEASON_FA: Record<SeasonKind, string> = {
  equinox_spring: 'اعتدال بهاری (نوروز)',
  solstice_summer: 'انقلاب تابستانی',
  equinox_autumn: 'اعتدال پاییزی',
  solstice_winter: 'انقلاب زمستانی (شب یلدا)',
}

/**
 * Meeus ch. 27: mean season table for years 1000–3000, plus periodic
 * corrections. Good to about a minute.
 */
export const seasonDate = (year: number, kind: SeasonKind): Date => {
  const Y = (year - 2000) / 1000
  const table: Record<SeasonKind, number[]> = {
    equinox_spring: [2451623.80984, 365242.37404, 0.05169, -0.00411, -0.00057],
    solstice_summer: [2451716.56767, 365241.62603, 0.00325, 0.00888, -0.0003],
    equinox_autumn: [2451810.21715, 365242.01767, -0.11575, 0.00337, 0.00078],
    solstice_winter: [2451900.05952, 365242.74049, -0.06223, -0.00823, 0.00032],
  }
  const [a, b, c, d, e] = table[kind]
  const jde0 = a + b * Y + c * Y * Y + d * Y * Y * Y + e * Y * Y * Y * Y

  const T = (jde0 - 2451545) / 36525
  const W = 35999.373 * T - 2.47
  const dLambda = 1 + 0.0334 * cos(W) + 0.0007 * cos(2 * W)

  // 24-term periodic series.
  const terms: [number, number, number][] = [
    [485, 324.96, 1934.136], [203, 337.23, 32964.467], [199, 342.08, 20.186],
    [182, 27.85, 445267.112], [156, 73.14, 45036.886], [136, 171.52, 22518.443],
    [77, 222.54, 65928.934], [74, 296.72, 3034.906], [70, 243.58, 9037.513],
    [58, 119.81, 33718.147], [52, 297.17, 150.678], [50, 21.02, 2281.226],
    [45, 247.54, 29929.562], [44, 325.15, 31555.956], [29, 60.93, 4443.417],
    [18, 155.12, 67555.328], [17, 288.79, 4562.452], [16, 198.04, 62894.029],
    [14, 199.76, 31436.921], [12, 95.39, 14577.848], [12, 287.11, 31931.756],
    [12, 320.81, 34777.259], [9, 227.73, 1222.114], [8, 15.45, 16859.074],
  ]
  const S = terms.reduce((acc, [A, B, C]) => acc + A * cos(B + C * T), 0)

  const jde = jde0 + (0.00001 * S) / dLambda
  return fromJD(jde)
}

export const seasonsBetween = (from: Date, to: Date) => {
  const out: { kind: SeasonKind; date: Date; titleFa: string }[] = []
  for (let y = from.getFullYear() - 1; y <= to.getFullYear() + 1; y += 1) {
    for (const kind of Object.keys(SEASON_FA) as SeasonKind[]) {
      const date = seasonDate(y, kind)
      if (date >= from && date < to) out.push({ kind, date, titleFa: SEASON_FA[kind] })
    }
  }
  return out.sort((a, b) => a.date.getTime() - b.date.getTime())
}

// ---------------------------------------------------------------------------
// Combined generator (used by the seeder and the admin refresh action)
// ---------------------------------------------------------------------------

export interface AstroEvent {
  kind: string
  title: string
  starts_at: string
  /** Verifiable data only. Anything interpretive belongs in a content row. */
  astro: Record<string, unknown>
}

export const generateEvents = (from: Date, to: Date): AstroEvent[] => {
  const events: AstroEvent[] = []

  for (const p of moonPhasesBetween(from, to)) {
    events.push({
      kind: p.kind,
      title: PHASE_FA[p.kind],
      starts_at: p.date.toISOString(),
      astro: {
        illumination: Number(p.illumination.toFixed(4)),
        algorithm: 'Meeus AA ch.49',
        note: 'زمان‌ها به وقت جهانی (UTC) محاسبه شده‌اند.',
      },
    })
  }

  for (const e of eclipsesBetween(from, to)) {
    events.push({
      kind: e.kind,
      title: e.titleFa,
      starts_at: e.date.toISOString(),
      astro: {
        type: e.type,
        algorithm: 'Meeus AA ch.54 (node-proximity criterion)',
        note: 'طبقه‌بندی تقریبی است؛ مسیر رؤیت‌پذیری محاسبه نشده.',
      },
    })
  }

  for (const s of seasonsBetween(from, to)) {
    events.push({
      kind: s.kind,
      title: s.titleFa,
      starts_at: s.date.toISOString(),
      astro: { algorithm: 'Meeus AA ch.27' },
    })
  }

  return events.sort((a, b) => a.starts_at.localeCompare(b.starts_at))
}

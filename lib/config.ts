export const TESLA_TARGET = 250

export const CRUISE_TARGET = 70
export const CRUISE_PERSONAL_TARGET = 50

export const TESLA_START = process.env.TESLA_START_DATE ?? '2025-11-01'
export const TESLA_END   = process.env.TESLA_END_DATE   ?? '2026-04-30'
export const CRUISE_START = process.env.CRUISE_START_DATE ?? '2025-11-01'
export const CRUISE_END   = process.env.CRUISE_END_DATE   ?? '2026-12-31'

// Pipeline field values from dwh.dim_profiles (lowercase)
// Tesla: only solar + roofing count
export const TESLA_PIPELINES = ['residential solar', 'commercial solar', 'roofing']

// Cruise points by pipeline value
// "pps" = Anchor/Power Protection System product (confirmed)
export const CRUISE_POINTS: Record<string, number> = {
  'residential solar': 1,
  'commercial solar':  1,
  'roofing':           1,
  'water products':    0.5,
  'pps':               0.5,
}

// Points per assisted trainee sale (1st–4th sale, tracked via dim_staff.trainee_sales)
export const ASISTIDA_POINTS = 0.5

// Points to the mentor when a team member graduates (Cruise)
export const GRADUATION_POINTS: Record<'consultor' | 'lider' | 'gerente', number> = {
  consultor: 1,
  lider:     5,
  gerente:   10,
}

// Monthly sales targets: April(4)–September(9) = 5; October(10)–March(3) = 3
export function monthlyTarget(yyyymm: string): number {
  const mm = Number(yyyymm.slice(5, 7))
  return mm >= 4 && mm <= 9 ? 5 : 3
}

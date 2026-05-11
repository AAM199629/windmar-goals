export const TESLA_TARGET = 250

export const CRUISE_TARGET = 70
export const CRUISE_PERSONAL_TARGET = 50

function currentTeslaPeriod() {
  const now   = new Date()
  const year  = now.getFullYear()
  const month = now.getMonth() + 1 // 1–12
  return month <= 6
    ? { start: `${year}-01-01`, end: `${year}-06-30` }
    : { start: `${year}-07-01`, end: `${year}-12-31` }
}

const _tesla = currentTeslaPeriod()
export const TESLA_START = process.env.TESLA_START_DATE ?? _tesla.start
export const TESLA_END   = process.env.TESLA_END_DATE   ?? _tesla.end
export const CRUISE_START = process.env.CRUISE_START_DATE ?? '2025-11-01'
export const CRUISE_END   = process.env.CRUISE_END_DATE   ?? '2026-12-31'

// Pipeline field values from dwh.dim_profiles (lowercase)
// Tesla: only solar + roofing count
export const TESLA_PIPELINES = ['residential solar', 'commercial solar', 'roofing']

// Cruise points by pipeline value
export const CRUISE_POINTS: Record<string, number> = {
  'residential solar': 1,
  'commercial solar':  1,
  'roofing':           1,
  'water products':    0.5,
  'pps':               0.5,
}

export const ASISTIDA_POINTS = 0.5

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

// ── Premios: Plinko, Ruleta, Graduación ───────────────────────────────────────

export function normalizeRole(role: string | null | undefined): 'trainee' | 'consultor' | 'lider' | 'gerente' {
  const r = (role ?? '').toLowerCase().replace('empleado-', '').replace('empleado - ', '').trim()
  if (r.includes('gerente'))               return 'gerente'
  if (r.includes('líder') || r.includes('lider')) return 'lider'
  if (r.includes('consultor'))             return 'consultor'
  return 'trainee'
}

// Pipelines that qualify for Plinko and Ruleta prizes
export const PREMIO_PIPELINES = ['residential solar', 'commercial solar', 'roofing']

// Plinko: weekly qualifying sales target by role (Solar + Roofing, year-round)
export function plinkoTarget(role: string | null | undefined): number {
  const r = normalizeRole(role)
  if (r === 'lider' || r === 'gerente') return 3
  return 2  // trainee / consultor
}

// Ruleta: monthly qualifying sales target (null = trainee, not eligible)
export function ruletaTarget(role: string | null | undefined, month: number): number | null {
  const r  = normalizeRole(role)
  if (r === 'trainee') return null
  const hi = month >= 4 && month <= 9
  if (r === 'consultor') return hi ? 6 : 4
  if (r === 'lider')     return hi ? 8 : 6
  return hi ? 10 : 8  // gerente
}

// Graduation points per pipeline per normalized role
export const GRAD_POINTS: Record<string, Record<string, number>> = {
  trainee:   { 'residential solar': 1, 'commercial solar': 1, 'roofing': 1, 'pps': 0.5, 'water products': 0.5 },
  consultor: { 'residential solar': 1, 'commercial solar': 1, 'roofing': 1, 'pps': 0.5, 'water products': 0.5 },
  lider:     { 'residential solar': 1, 'commercial solar': 1, 'roofing': 0.5, 'pps': 0.5, 'water products': 0.5 },
  gerente:   { 'residential solar': 1, 'commercial solar': 1, 'roofing': 0.5, 'pps': 0.5, 'water products': 0.5 },
}

export const GRAD_TARGET: Record<string, number> = {
  trainee: 20, consultor: 20, lider: 20, gerente: 40,
}

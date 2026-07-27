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
// Fechas fijas de la competencia del crucero (01 ene – 31 dic 2026).
// Hardcodeadas a propósito: un env var rezagado (CRUISE_START_DATE=2025-11-01)
// sobrescribía este valor y desincronizaba el dashboard (en vivo) de las
// tarjetas (KV del sync), inflando los puntos de crucero. No usar env override.
export const CRUISE_START = '2026-01-01'
export const CRUISE_END   = '2026-12-31'

// Deals excluidos de TODA métrica de competencia: cancelados + en hold.
// on_hold_status vive en dwh.dim_status_reason (alias `dsr` en todas las queries);
// es NULL para deals activos y cualquier valor no-nulo es un estado "On Hold - ...".
// Constante estática (no input de usuario) → interpolarla en SQL es seguro.
export const ACTIVE_DEAL_SQL =
  `dsr.stage <> 'Cancelled' ` +
  `AND (dsr.on_hold_status IS NULL OR TRIM(dsr.on_hold_status) = '')`

// Únicos sales_role que se muestran en el dashboard (los 7 roles de venta válidos).
// Excluye Trainee, Otro/Empleado, Canvassing Coordinator, Supervisor Regional,
// Promotor y null. Aplica a las 3 queries de selección de miembros de
// dw_zoho.dim_sales_team_member (leaderboard, leaderboard-tesla, sync).
export const ALLOWED_SALES_ROLES = [
  'Consultor',
  'Empleado - Consultor',
  'Empleado - Gerente',
  'Empleado - Lider',
  'Gerente',
  'Gerente Accionista',
  'Lider',
]

// Fragmento SQL para filtrar por rol permitido. La columna sales_role va sin alias
// (las queries de miembros seleccionan de dim_sales_team_member sin alias).
// Valores estáticos → interpolación segura.
export const ALLOWED_ROLES_SQL =
  `sales_role IN (${ALLOWED_SALES_ROLES.map(r => `'${r}'`).join(', ')})`

// ── Promotores ─────────────────────────────────────────────────────────────────
// Los promotores NO venden: generan leads para que un vendedor cierre. Están
// EXCLUIDOS de ALLOWED_SALES_ROLES (leaderboards/premios) y tienen su propia vista.
// En el warehouse, el promotor se conserva en dwh.dim_employee.sales_rep_email
// durante todo el ciclo del lead (incluso citas y casos vendidos), así que sus
// leads/citas se rastrean por ese campo. Valores estáticos → interpolación segura.
export const PROMOTOR_ROLES = ['Promotor']
export const PROMOTOR_ROLES_SQL =
  `sales_role IN (${PROMOTOR_ROLES.map(r => `'${r}'`).join(', ')})`

export function isPromotor(role: string | null | undefined): boolean {
  return PROMOTOR_ROLES.some(r => r.toLowerCase() === (role ?? '').toLowerCase())
}

// Un promotor "activo" = Status 'Activo' Y el check "Inactive" sin marcar
// (inactive = 'False'/vacío/null). Pásale el alias de dim_sales_team_member
// usado en la query (p. ej. 'stm'); sin alias para queries sin alias.
export function promotorActiveSql(alias = ''): string {
  const p = alias ? `${alias}.` : ''
  return `LOWER(${p}status) = 'activo' ` +
    `AND (${p}inactive IS NULL OR ${p}inactive = '' OR LOWER(${p}inactive) = 'false')`
}

// lead_status (dwh.dim_lead_status_extended) que representan una cita generada.
export const CITA_LEAD_STATUSES = [
  'Cita Coordinada', 'Cita Confirmada', 'Cita Realizada', 'Cita en Espera', 'Caso Vendido',
]
export const SOLD_LEAD_STATUS = 'Caso Vendido'

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

// Next level in the career path (used for graduation goal targeting)
export function nextGradRole(role: 'trainee' | 'consultor' | 'lider' | 'gerente'): 'consultor' | 'lider' | 'gerente' {
  if (role === 'trainee')   return 'consultor'
  if (role === 'consultor') return 'lider'
  return 'gerente' // lider → gerente; gerente stays at gerente (won't show graduation card)
}

// Pipelines that qualify for Ruleta prizes (Solar + Roofing, 1 venta c/u)
export const PREMIO_PIPELINES = ['residential solar', 'commercial solar', 'roofing']

// Plinko: puntos de venta por pipeline. Solar + Roofing = 1 pto;
// Anker (pps) + Water = ½ pto. (Ruleta sigue contando solo Solar + Roofing.)
export const PLINKO_POINTS: Record<string, number> = {
  'residential solar': 1,
  'commercial solar':  1,
  'roofing':           1,
  'water products':    0.5,
  'pps':               0.5,
}

// Pipelines elegibles para Plinko (incluye Anker + Water a ½ pto)
export const PLINKO_PIPELINES = Object.keys(PLINKO_POINTS)

// Plinko: weekly qualifying sales target by role (year-round)
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

// ── Competencia Tesla (01 jul – 15 oct 2026; corte final +6 días) ──────────────
export const COMPTESLA_START = process.env.COMPTESLA_START_DATE ?? '2026-07-01'
export const COMPTESLA_END   = process.env.COMPTESLA_END_DATE   ?? '2026-10-15'

export const COMPTESLA_POINTS = {
  bateriaConSolar: 1,
  bateriaSola:     0.5,
  asistida:        0.5,   // primeras 4 ventas de un trainee, solo productos con Tesla
}
export const COMPTESLA_MIN_VENTAS = 10  // requisito mínimo para clasificar

// ── Gerente Accionista (año 2026; promociones ≤ 31 dic 2026) ───────────────────
// Tarjeta solo para gerentes (Gerente, Empleado - Gerente, Gerente Accionista).
export const GERENTEA_START = process.env.GERENTEA_START_DATE ?? '2026-01-01'
export const GERENTEA_END   = process.env.GERENTEA_END_DATE   ?? '2026-12-31'

// Formato Primario 2·4·6 (graduaciones de primera línea durante el periodo)
export const GERENTEA_PRIMARY = { gerentes: 2, lideres: 4, consultores: 6 }

// Formato Secundario: puntos de desarrollo ≥ 11 Y ventas personales ponderadas ≥ 40
export const GERENTEA_DEV_POINTS = { gerente: 5, lider: 2, consultor: 0.5 } // por promoción de 1ª línea
export const GERENTEA_DEV_TARGET = 11
export const GERENTEA_SALES_POINTS: Record<string, number> = {
  'residential solar': 1, 'commercial solar': 1, 'roofing': 1,
  'water products': 0.5, 'pps': 0.5,
}
export const GERENTEA_ASISTIDA_POINTS = 1  // venta asistida (1ª–4ª venta del trainee → mentor)
export const GERENTEA_SALES_TARGET    = 40

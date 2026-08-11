import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { query } from '@/lib/redshift'
import {
  PREMIO_PIPELINES, PLINKO_PIPELINES, PLINKO_POINTS,
  plinkoTarget, ruletaTarget, normalizeRole,
  ACTIVE_DEAL_SQL, ALLOWED_ROLES_SQL,
} from '@/lib/config'

export type PrizeRole = 'consultor' | 'lider' | 'gerente'

export interface PrizeRow {
  zohoId:      string
  name:        string
  role:        PrizeRole
  isEmpleado:  boolean
  ventas:      number
  meta:        number
  clasificado: boolean
}

export interface PlinkoWeek {
  weekStart: string   // YYYY-MM-DD (lunes)
  weekEnd:   string   // YYYY-MM-DD (domingo)
  rows:      PrizeRow[]
}

export interface PlinkoRuletaResponse {
  month:      string        // YYYY-MM
  ruleta:     PrizeRow[]
  plinko:     PlinkoWeek[]
  computedAt: string
}

interface MemberRow {
  member_id:  string
  full_name:  string
  sales_role: string | null
}
interface MonthlyRow { member_id: string; cnt: string | number }
interface WeeklyRow  { member_id: string; week_start: string; cnt: string | number }

// PREMIO_PIPELINES / PLINKO_* son constantes estáticas → interpolación segura en SQL.
const PREMIO_IN = PREMIO_PIPELINES.map(p => `'${p}'`).join(', ')   // Ruleta: Solar + Roofing
const PLINKO_IN = PLINKO_PIPELINES.map(p => `'${p}'`).join(', ')   // Plinko: + Anker + Water
// Suma ponderada de ventas para Plinko: Solar + Roofing = 1 pto, Anker + Water = ½ pto.
const PLINKO_WEIGHT_SQL =
  'SUM(CASE ' +
  Object.entries(PLINKO_POINTS)
    .map(([p, w]) => `WHEN LOWER(dp.pipeline) = '${p}' THEN ${w}`)
    .join(' ') +
  ' ELSE 0 END)'

// ── Date helpers (UTC-safe, sobre strings YYYY-MM-DD) ──────────────────────────
function currentYYYYMM(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function monthRange(yyyymm: string): { first: string; last: string } {
  const [year, mm] = yyyymm.split('-')
  const lastDay = new Date(Number(year), Number(mm), 0).getDate()
  return { first: `${year}-${mm}-01`, last: `${year}-${mm}-${String(lastDay).padStart(2, '0')}` }
}
function fmtUTC(d: Date): string { return d.toISOString().slice(0, 10) }
function addDaysUTC(d: Date, n: number): Date {
  const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x
}
function mondayOf(dateStr: string): Date {
  const d = new Date(dateStr + 'T00:00:00Z')
  const day = d.getUTCDay()            // 0=Dom … 6=Sáb
  const diff = day === 0 ? -6 : 1 - day
  return addDaysUTC(d, diff)
}
// Semanas (lunes–domingo) que solapan el mes seleccionado
function weeksOfMonth(first: string, last: string): { weekStart: string; weekEnd: string }[] {
  const weeks: { weekStart: string; weekEnd: string }[] = []
  const lastDate = new Date(last + 'T00:00:00Z')
  let mon = mondayOf(first)
  while (mon <= lastDate) {
    const sun = addDaysUTC(mon, 6)
    weeks.push({ weekStart: fmtUTC(mon), weekEnd: fmtUTC(sun) })
    mon = addDaysUTC(mon, 7)
  }
  return weeks
}

function buildFetcher(month: string) {
  return unstable_cache(
    async (): Promise<PlinkoRuletaResponse> => {
      const { first, last } = monthRange(month)
      const mm = Number(month.slice(5, 7))
      const weeks = weeksOfMonth(first, last)
      const rangeStart = weeks[0].weekStart
      const rangeEnd   = weeks[weeks.length - 1].weekEnd

      const [members, ruletaRows, plinkoRows] = await Promise.all([

        // ── 1. Miembros activos (con rol) ──────────────────────────────────────
        query<MemberRow>(`
          SELECT member_id, full_name, sales_role
          FROM dw_zoho.dim_sales_team_member
          WHERE (inactive IS NULL OR inactive = '' OR LOWER(inactive) = 'false')
            AND member_id IS NOT NULL
            AND email    IS NOT NULL
            AND ${ALLOWED_ROLES_SQL}
        `),

        // ── 2. Ruleta: ventas elegibles del mes por miembro ────────────────────
        query<MonthlyRow>(`
          SELECT stm.member_id, COUNT(*) AS cnt
          FROM dwh.fact_deals fd
          JOIN dwh.dim_profiles dp
            ON dp.id_profile = fd.id_profile
          JOIN dwh.dim_status_reason dsr
            ON dsr.id_status_reason = fd.id_status_reason AND dsr.is_current = true
          JOIN dwh.dim_staff ds
            ON ds.id_staff = fd.id_staff AND ds.is_current = true
          LEFT JOIN dw_zoho.dim_sales_team_member stm
            ON stm.member_id = ds.sales_rep
          WHERE fd.closing_date >= $1
            AND fd.closing_date <= $2
            AND fd.closing_date IS NOT NULL
            AND ${ACTIVE_DEAL_SQL}
            AND stm.member_id IS NOT NULL
            AND LOWER(dp.pipeline) IN (${PREMIO_IN})
          GROUP BY stm.member_id
        `, [first, last]),

        // ── 3. Plinko: ventas elegibles por miembro y por semana (lunes) ────────
        query<WeeklyRow>(`
          SELECT
            stm.member_id,
            TO_CHAR(DATE_TRUNC('week', fd.closing_date), 'YYYY-MM-DD') AS week_start,
            ${PLINKO_WEIGHT_SQL} AS cnt
          FROM dwh.fact_deals fd
          JOIN dwh.dim_profiles dp
            ON dp.id_profile = fd.id_profile
          JOIN dwh.dim_status_reason dsr
            ON dsr.id_status_reason = fd.id_status_reason AND dsr.is_current = true
          JOIN dwh.dim_staff ds
            ON ds.id_staff = fd.id_staff AND ds.is_current = true
          LEFT JOIN dw_zoho.dim_sales_team_member stm
            ON stm.member_id = ds.sales_rep
          WHERE fd.closing_date >= $1
            AND fd.closing_date <= $2
            AND fd.closing_date IS NOT NULL
            AND ${ACTIVE_DEAL_SQL}
            AND stm.member_id IS NOT NULL
            AND LOWER(dp.pipeline) IN (${PLINKO_IN})
          GROUP BY stm.member_id, TO_CHAR(DATE_TRUNC('week', fd.closing_date), 'YYYY-MM-DD')
        `, [rangeStart, rangeEnd]),

      ])

      // ── Metadata por miembro ────────────────────────────────────────────────
      interface Meta { name: string; role: PrizeRole; isEmpleado: boolean; sales_role: string }
      const meta: Record<string, Meta> = {}
      for (const m of members) {
        const role = normalizeRole(m.sales_role)
        if (role === 'trainee') continue
        meta[m.member_id] = {
          name:       m.full_name,
          role,
          isEmpleado: /^\s*empleado/i.test(m.sales_role ?? ''),
          sales_role: m.sales_role ?? '',
        }
      }

      // ── Ruleta rows (solo quienes tienen ≥1 venta elegible) ──────────────────
      const ruleta: PrizeRow[] = []
      for (const r of ruletaRows) {
        const m = meta[r.member_id]
        if (!m) continue
        const ventas = Number(r.cnt) || 0
        if (ventas <= 0) continue
        const metaVal = ruletaTarget(m.sales_role, mm)
        if (metaVal === null) continue
        ruleta.push({
          zohoId: r.member_id, name: m.name, role: m.role, isEmpleado: m.isEmpleado,
          ventas, meta: metaVal, clasificado: ventas >= metaVal,
        })
      }
      ruleta.sort((a, b) => b.ventas - a.ventas)

      // ── Plinko rows por semana ───────────────────────────────────────────────
      const perWeek: Record<string, Record<string, number>> = {}
      for (const r of plinkoRows) {
        if (!perWeek[r.week_start]) perWeek[r.week_start] = {}
        perWeek[r.week_start][r.member_id] = Number(r.cnt) || 0
      }
      const plinko: PlinkoWeek[] = weeks.map(w => {
        const counts = perWeek[w.weekStart] ?? {}
        const rows: PrizeRow[] = []
        for (const [id, ventas] of Object.entries(counts)) {
          const m = meta[id]
          if (!m || ventas <= 0) continue
          const metaVal = plinkoTarget(m.sales_role)
          rows.push({
            zohoId: id, name: m.name, role: m.role, isEmpleado: m.isEmpleado,
            ventas, meta: metaVal, clasificado: ventas >= metaVal,
          })
        }
        rows.sort((a, b) => b.ventas - a.ventas)
        return { weekStart: w.weekStart, weekEnd: w.weekEnd, rows }
      })

      return { month, ruleta, plinko, computedAt: new Date().toISOString() }
    },
    ['plinko-ruleta', month],
    { revalidate: 3600 },
  )()
}

export async function GET(req: Request) {
  try {
    const url   = new URL(req.url)
    const raw   = (url.searchParams.get('month') ?? '').trim()
    const month = /^\d{4}-\d{2}$/.test(raw) ? raw : currentYYYYMM()
    const data  = await buildFetcher(month)
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json(
      { error: String(e), stack: e instanceof Error ? e.stack : undefined },
      { status: 500 },
    )
  }
}

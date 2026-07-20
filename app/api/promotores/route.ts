import { NextResponse } from 'next/server'
import { query } from '@/lib/redshift'
import { PROMOTOR_ROLES_SQL, SOLD_LEAD_STATUS } from '@/lib/config'

// Meta semanal de leads registrados (semana en curso, lun–dom). Igual que en la
// ruta individual /api/promotor/[zohoId].
export const WEEKLY_LEADS_TARGET = 25

// Resumen de TODOS los promotores para la página del supervisor: por promotor,
// leads creados / citas creadas / casos vendidos en el mes seleccionado, y los
// leads registrados en la semana en curso (meta semanal).
export interface PromotorSummaryRow {
  zohoId:        string
  name:          string
  leadsCreados:  number
  citasCreadas:  number
  casosVendidos: number
  leadsSemana:   number
}

export interface PromotoresResponse {
  rows:         PromotorSummaryRow[]
  month:        string
  weeklyTarget: number
  week:         { start: string; end: string }
  computedAt:   string
}

function monthBounds(month: string): { first: string; next: string } {
  const [y, m] = month.split('-').map(Number)
  const first = `${y}-${String(m).padStart(2, '0')}-01`
  const ny = m === 12 ? y + 1 : y
  const nm = m === 12 ? 1 : m + 1
  const next = `${ny}-${String(nm).padStart(2, '0')}-01`
  return { first, next }
}

// Semana en curso (lunes–domingo). Devuelve start/end visibles y nextDay exclusivo.
function currentWeek(): { start: string; end: string; nextDay: string } {
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const now  = new Date()
  const day  = now.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const mon  = new Date(now); mon.setDate(now.getDate() + diff)
  const sun  = new Date(mon); sun.setDate(mon.getDate() + 6)
  const next = new Date(sun); next.setDate(sun.getDate() + 1)
  return { start: fmt(mon), end: fmt(sun), nextDay: fmt(next) }
}

export async function GET(req: Request) {
  try {
    const url   = new URL(req.url)
    const month = (url.searchParams.get('month') ?? '').trim()
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: 'Parámetro inválido (month=YYYY-MM)' }, { status: 400 })
    }
    const { first, next } = monthBounds(month)
    const wk = currentWeek()

    // Un solo query agregado. El INNER JOIN a dim_sales_team_member por email y rol
    // Promotor restringe a leads cuyo dueño (sales_rep_email) es un promotor.
    // $1/$2 = rango del mes · $3/$4 = rango de la semana en curso.
    const rows = await query<{
      member_id: string
      full_name: string
      leads_creados: string | number
      citas_creadas: string | number
      casos_vendidos: string | number
      leads_semana: string | number
    }>(`
      SELECT
        stm.member_id,
        stm.full_name,
        SUM(CASE WHEN a.created_time >= $1 AND a.created_time < $2 THEN 1 ELSE 0 END) AS leads_creados,
        SUM(CASE WHEN emp.presenter_appointment >= $1 AND emp.presenter_appointment < $2 THEN 1 ELSE 0 END) AS citas_creadas,
        SUM(CASE WHEN emp.presenter_appointment >= $1 AND emp.presenter_appointment < $2
                  AND lse.lead_status = '${SOLD_LEAD_STATUS}' THEN 1 ELSE 0 END) AS casos_vendidos,
        SUM(CASE WHEN a.created_time >= $3 AND a.created_time < $4 THEN 1 ELSE 0 END) AS leads_semana
      FROM dwh.fact_leads fl
      JOIN dwh.dim_employee emp
        ON emp.id_employee = fl.id_employee AND emp.is_current = true
      JOIN dw_zoho.dim_sales_team_member stm
        ON LOWER(stm.email) = LOWER(emp.sales_rep_email) AND stm.${PROMOTOR_ROLES_SQL}
      LEFT JOIN dwh.dim_lead_status_extended lse
        ON lse.id_lead_status_extended = fl.id_lead_status_extended AND lse.is_current = true
      LEFT JOIN dwh.dim_audit_system_leads a
        ON a.id_audit_system = fl.id_audit_system
      GROUP BY stm.member_id, stm.full_name
      ORDER BY citas_creadas DESC, leads_creados DESC
    `, [first, next, wk.start, wk.nextDay])

    const out: PromotorSummaryRow[] = rows.map(r => ({
      zohoId:        r.member_id,
      name:          r.full_name,
      leadsCreados:  Number(r.leads_creados),
      citasCreadas:  Number(r.citas_creadas),
      casosVendidos: Number(r.casos_vendidos),
      leadsSemana:   Number(r.leads_semana),
    }))

    return NextResponse.json({
      rows: out,
      month,
      weeklyTarget: WEEKLY_LEADS_TARGET,
      week: { start: wk.start, end: wk.end },
      computedAt: new Date().toISOString(),
    } satisfies PromotoresResponse)
  } catch (e) {
    return NextResponse.json(
      { error: String(e), stack: e instanceof Error ? e.stack : undefined },
      { status: 500 },
    )
  }
}

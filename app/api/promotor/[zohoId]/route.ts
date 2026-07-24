import { NextResponse } from 'next/server'
import { query } from '@/lib/redshift'
import { SOLD_LEAD_STATUS } from '@/lib/config'

// Datos de UN promotor para su dashboard: leads creados, citas creadas y el
// desglose por status del lead, en un mes dado. El promotor se identifica por su
// email en dwh.dim_employee.sales_rep_email (se conserva durante todo el ciclo).
export interface PromotorCita {
  leadName:   string | null
  citaDate:   string | null   // ISO
  citaType:   string | null
  citaStatus: string | null   // post_cita_status
  leadStatus: string | null
  vendedor:   string | null   // "Sales Rep" en sistema: asignado (gerente_asignado) o el dueño actual
}

// Meta semanal de leads registrados (semana en curso, lun–dom)
export const WEEKLY_LEADS_TARGET = 25

export interface PromotorResponse {
  promoter: { zohoId: string; name: string; email: string }
  summary: {
    leadsCreados:  number
    citasCreadas:  number
    casosVendidos: number
    byLeadStatus:  { status: string; n: number }[]
  }
  week: {
    leads:  number
    target: number
    start:  string   // YYYY-MM-DD (lunes)
    end:    string   // YYYY-MM-DD (domingo)
  }
  citas:      PromotorCita[]
  month:      string
  computedAt: string
}

// [first, next) — intervalo half-open del mes (next = primer día del mes siguiente)
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
  const day  = now.getDay()              // 0=dom … 6=sáb
  const diff = day === 0 ? -6 : 1 - day  // retroceder al lunes
  const mon  = new Date(now); mon.setDate(now.getDate() + diff)
  const sun  = new Date(mon); sun.setDate(mon.getDate() + 6)
  const next = new Date(sun); next.setDate(sun.getDate() + 1)
  return { start: fmt(mon), end: fmt(sun), nextDay: fmt(next) }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ zohoId: string }> },
) {
  try {
    const { zohoId } = await params
    const url   = new URL(req.url)
    const month = (url.searchParams.get('month') ?? '').trim()

    if (!/^\d+$/.test(zohoId) || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: 'Parámetros inválidos (zohoId, month=YYYY-MM)' }, { status: 400 })
    }
    const { first, next } = monthBounds(month)

    // 1. Promotor: email + nombre
    const memberRows = await query<{ full_name: string; email: string }>(
      `SELECT full_name, email FROM dw_zoho.dim_sales_team_member WHERE member_id = $1`,
      [zohoId],
    )
    if (memberRows.length === 0 || !memberRows[0].email) {
      return NextResponse.json({ error: `No se encontró promotor para zohoId=${zohoId}` }, { status: 404 })
    }
    const email = memberRows[0].email.toLowerCase()

    // 2. Leads creados en el mes + desglose por status de lead
    const statusRows = await query<{ lead_status: string | null; n: string | number }>(`
      SELECT COALESCE(lse.lead_status, 'Sin status') AS lead_status, COUNT(*) AS n
      FROM dwh.fact_leads fl
      JOIN dwh.dim_employee emp
        ON emp.id_employee = fl.id_employee AND emp.is_current = true
      LEFT JOIN dwh.dim_lead_status_extended lse
        ON lse.id_lead_status_extended = fl.id_lead_status_extended AND lse.is_current = true
      JOIN dwh.dim_audit_system_leads a
        ON a.id_audit_system = fl.id_audit_system
      WHERE LOWER(emp.sales_rep_email) = $1
        AND a.created_time >= $2 AND a.created_time < $3
      GROUP BY COALESCE(lse.lead_status, 'Sin status')
      ORDER BY n DESC
    `, [email, first, next])

    const byLeadStatus = statusRows.map(r => ({ status: r.lead_status ?? 'Sin status', n: Number(r.n) }))
    const leadsCreados = byLeadStatus.reduce((s, r) => s + r.n, 0)

    // 3. Citas del mes (por fecha de cita = presenter_appointment)
    const citaRows = await query<{
      lead_name: string | null
      cita_date: string | null
      cita_type: string | null
      cita_status: string | null
      lead_status: string | null
      gerente_asignado: string | null
      rep_name: string | null
      rep_email: string | null
    }>(`
      SELECT
        dl.full_name              AS lead_name,
        emp.presenter_appointment AS cita_date,
        aps.appointment_type      AS cita_type,
        aps.post_cita_status      AS cita_status,
        lse.lead_status           AS lead_status,
        emp.gerente_asignado      AS gerente_asignado,
        rep.full_name             AS rep_name,
        emp.sales_rep_email       AS rep_email
      FROM dwh.fact_leads fl
      JOIN dwh.dim_employee emp
        ON emp.id_employee = fl.id_employee AND emp.is_current = true
      LEFT JOIN dwh.dim_lead dl
        ON dl.id_lead = fl.id_lead AND dl.is_current = true
      LEFT JOIN dwh.dim_lead_status_extended lse
        ON lse.id_lead_status_extended = fl.id_lead_status_extended AND lse.is_current = true
      LEFT JOIN dwh.dim_appointment_status aps
        ON aps.id_appointment_status = fl.id_appointment_status AND aps.is_current = true
      LEFT JOIN dw_zoho.dim_sales_team_member rep
        ON LOWER(rep.email) = LOWER(emp.sales_rep_email)
      WHERE LOWER(emp.sales_rep_email) = $1
        AND emp.presenter_appointment >= $2 AND emp.presenter_appointment < $3
      ORDER BY emp.presenter_appointment
    `, [email, first, next])

    // Vendedor = lo que haya en sistema: el asignado (gerente_asignado) si existe,
    // si no el "Sales Rep" actual del lead (nombre resuelto o su email). En estos
    // leads el Sales Rep suele seguir siendo el propio promotor (no reasignado).
    const citas: PromotorCita[] = citaRows.map(r => {
      const asignado = (r.gerente_asignado ?? '').trim()
      const vendedor = asignado !== ''
        ? asignado
        : (r.rep_name?.trim() || r.rep_email?.trim() || null)
      return {
        leadName:   r.lead_name,
        citaDate:   r.cita_date ? new Date(r.cita_date).toISOString() : null,
        citaType:   r.cita_type,
        citaStatus: r.cita_status,
        leadStatus: r.lead_status,
        vendedor,
      }
    })
    const casosVendidos = citas.filter(
      c => c.leadStatus === SOLD_LEAD_STATUS || (c.citaStatus ?? '').toLowerCase() === 'vendido',
    ).length

    // 4. Meta semanal: leads registrados en la semana en curso (lun–dom)
    const wk = currentWeek()
    const weekRows = await query<{ n: string | number }>(`
      SELECT COUNT(*) AS n
      FROM dwh.fact_leads fl
      JOIN dwh.dim_employee emp
        ON emp.id_employee = fl.id_employee AND emp.is_current = true
      JOIN dwh.dim_audit_system_leads a
        ON a.id_audit_system = fl.id_audit_system
      WHERE LOWER(emp.sales_rep_email) = $1
        AND a.created_time >= $2 AND a.created_time < $3
    `, [email, wk.start, wk.nextDay])
    const weekLeads = Number(weekRows[0]?.n ?? 0)

    return NextResponse.json({
      promoter: { zohoId, name: memberRows[0].full_name, email },
      summary: { leadsCreados, citasCreadas: citas.length, casosVendidos, byLeadStatus },
      week: { leads: weekLeads, target: WEEKLY_LEADS_TARGET, start: wk.start, end: wk.end },
      citas,
      month,
      computedAt: new Date().toISOString(),
    } satisfies PromotorResponse)
  } catch (e) {
    return NextResponse.json(
      { error: String(e), stack: e instanceof Error ? e.stack : undefined },
      { status: 500 },
    )
  }
}

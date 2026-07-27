import { NextResponse } from 'next/server'
import { query } from '@/lib/redshift'
import { SOLD_LEAD_STATUS } from '@/lib/config'

// Desglose de los leads detrás de un número de la tabla del supervisor.
// type = creados | citas | vendidos | semana
export type PromotorLeadsType = 'creados' | 'citas' | 'vendidos' | 'semana'

export interface PromotorLeadDetail {
  leadName:    string | null
  createdDate: string | null   // ISO
  citaDate:    string | null   // ISO
  leadStatus:  string | null
  vendedor:    string | null
}

export interface PromotorLeadsResponse {
  rows:       PromotorLeadDetail[]
  type:       PromotorLeadsType
  computedAt: string
}

function monthBounds(month: string): { first: string; next: string } {
  const [y, m] = month.split('-').map(Number)
  const first = `${y}-${String(m).padStart(2, '0')}-01`
  const ny = m === 12 ? y + 1 : y
  const nm = m === 12 ? 1 : m + 1
  const next = `${ny}-${String(nm).padStart(2, '0')}-01`
  return { first, next }
}

function currentWeek(): { start: string; nextDay: string } {
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const now  = new Date()
  const day  = now.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const mon  = new Date(now); mon.setDate(now.getDate() + diff)
  const sun  = new Date(mon); sun.setDate(mon.getDate() + 6)
  const next = new Date(sun); next.setDate(sun.getDate() + 1)
  return { start: fmt(mon), nextDay: fmt(next) }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ zohoId: string }> },
) {
  try {
    const { zohoId } = await params
    const url   = new URL(req.url)
    const type  = (url.searchParams.get('type') ?? '') as PromotorLeadsType
    const month = (url.searchParams.get('month') ?? '').trim()

    if (!/^\d+$/.test(zohoId) || !['creados', 'citas', 'vendidos', 'semana'].includes(type)) {
      return NextResponse.json({ error: 'Parámetros inválidos (zohoId, type)' }, { status: 400 })
    }
    if (type !== 'semana' && !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: 'month=YYYY-MM requerido' }, { status: 400 })
    }

    const memberRows = await query<{ full_name: string; email: string }>(
      `SELECT full_name, email FROM dw_zoho.dim_sales_team_member WHERE member_id = $1`, [zohoId],
    )
    if (memberRows.length === 0 || !memberRows[0].email) {
      return NextResponse.json({ error: `No se encontró promotor para zohoId=${zohoId}` }, { status: 404 })
    }
    const email = memberRows[0].email.toLowerCase()
    const name  = memberRows[0].full_name

    // El promotor puede estar como "Sales Rep" (sales_rep_email) o, tras el handoff,
    // como "Sales Assist" (gerente_asignado). $1 email · $2 nombre · $3/$4 rango.
    const MATCH = `(LOWER(emp.sales_rep_email) = $1 OR emp.gerente_asignado = $2)`

    // Filtro + rango + orden según el tipo de métrica
    let filter: string
    let start: string, end: string, orderBy: string
    if (type === 'semana') {
      const wk = currentWeek(); start = wk.start; end = wk.nextDay
      filter = `a.created_time >= $3 AND a.created_time < $4`
      orderBy = 'a.created_time DESC'
    } else if (type === 'creados') {
      const b = monthBounds(month); start = b.first; end = b.next
      filter = `a.created_time >= $3 AND a.created_time < $4`
      orderBy = 'a.created_time DESC'
    } else { // citas | vendidos
      const b = monthBounds(month); start = b.first; end = b.next
      filter = `emp.presenter_appointment >= $3 AND emp.presenter_appointment < $4`
      if (type === 'vendidos') filter += ` AND lse.lead_status = '${SOLD_LEAD_STATUS}'`
      orderBy = 'emp.presenter_appointment DESC'
    }

    const rows = await query<{
      lead_name: string | null
      created_date: string | null
      cita_date: string | null
      lead_status: string | null
      gerente_asignado: string | null
      rep_name: string | null
      rep_email: string | null
    }>(`
      SELECT
        dl.full_name              AS lead_name,
        a.created_time            AS created_date,
        emp.presenter_appointment AS cita_date,
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
      LEFT JOIN dw_zoho.dim_sales_team_member rep
        ON LOWER(rep.email) = LOWER(emp.sales_rep_email)
      LEFT JOIN dwh.dim_audit_system_leads a
        ON a.id_audit_system = fl.id_audit_system
      WHERE ${MATCH}
        AND ${filter}
      ORDER BY ${orderBy}
    `, [email, name, start, end])

    const out: PromotorLeadDetail[] = rows.map(r => {
      // Vendedor asignado = el "Sales Rep" actual (sales_rep_email resuelto).
      const vendedor = r.rep_name?.trim() || r.rep_email?.trim() || null
      return {
        leadName:    r.lead_name,
        createdDate: r.created_date ? new Date(r.created_date).toISOString() : null,
        citaDate:    r.cita_date ? new Date(r.cita_date).toISOString() : null,
        leadStatus:  r.lead_status,
        vendedor,
      }
    })

    return NextResponse.json({ rows: out, type, computedAt: new Date().toISOString() } satisfies PromotorLeadsResponse)
  } catch (e) {
    return NextResponse.json(
      { error: String(e), stack: e instanceof Error ? e.stack : undefined },
      { status: 500 },
    )
  }
}

import { NextResponse } from 'next/server'
import { query } from '@/lib/redshift'
import { PREMIO_PIPELINES, ACTIVE_DEAL_SQL } from '@/lib/config'

// Desglose de las ventas elegibles (Solar + Roofing, activas) que componen el
// conteo de un vendedor en un periodo dado (mes para Ruleta, semana para Plinko).
export interface DealDetail {
  closingDate:      string | null
  pipeline:         string | null
  amount:           number | null
  salesRep:         string | null
  allSalesDocs:     string | null   // pendiente: no está en el warehouse aún
  onHoldStatus:     string | null
}

export interface DealsResponse {
  deals:      DealDetail[]
  computedAt: string
}

interface DealRow {
  closing_date:   string | null
  pipeline:       string | null
  amount:         string | number | null
  sales_rep:      string | null
  on_hold_status: string | null
}

const PREMIO_IN = PREMIO_PIPELINES.map(p => `'${p}'`).join(', ')

export async function GET(req: Request) {
  try {
    const url    = new URL(req.url)
    const zohoId = (url.searchParams.get('zohoId') ?? '').trim()
    const start  = (url.searchParams.get('start') ?? '').trim()
    const end    = (url.searchParams.get('end') ?? '').trim()

    if (!/^\d+$/.test(zohoId) || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
      return NextResponse.json({ error: 'Parámetros inválidos (zohoId, start, end)' }, { status: 400 })
    }

    const rows = await query<DealRow>(`
      SELECT
        TO_CHAR(fd.closing_date, 'YYYY-MM-DD') AS closing_date,
        dp.pipeline            AS pipeline,
        fd.amount              AS amount,
        stm.full_name          AS sales_rep,
        dsr.on_hold_status     AS on_hold_status
      FROM dwh.fact_deals fd
      JOIN dwh.dim_profiles dp
        ON dp.id_profile = fd.id_profile
      JOIN dwh.dim_status_reason dsr
        ON dsr.id_status_reason = fd.id_status_reason AND dsr.is_current = true
      JOIN dwh.dim_staff ds
        ON ds.id_staff = fd.id_staff AND ds.is_current = true
      LEFT JOIN dw_zoho.dim_sales_team_member stm
        ON LOWER(stm.email) = LOWER(ds.sale_rep_email)
      WHERE fd.closing_date >= $2
        AND fd.closing_date <= $3
        AND fd.closing_date IS NOT NULL
        AND ${ACTIVE_DEAL_SQL}
        AND stm.member_id = $1
        AND LOWER(dp.pipeline) IN (${PREMIO_IN})
      ORDER BY fd.closing_date, dp.pipeline
    `, [zohoId, start, end])

    const deals: DealDetail[] = rows.map(r => ({
      closingDate:  r.closing_date ? String(r.closing_date).slice(0, 10) : null,
      pipeline:     r.pipeline,
      amount:       r.amount != null ? Number(r.amount) : null,
      salesRep:     r.sales_rep,
      allSalesDocs: null,   // no disponible en Redshift todavía
      onHoldStatus: r.on_hold_status && r.on_hold_status.trim() !== '' ? r.on_hold_status : null,
    }))

    return NextResponse.json({ deals, computedAt: new Date().toISOString() } satisfies DealsResponse)
  } catch (e) {
    return NextResponse.json(
      { error: String(e), stack: e instanceof Error ? e.stack : undefined },
      { status: 500 },
    )
  }
}

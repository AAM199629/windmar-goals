import { NextResponse } from 'next/server'
import { query } from '@/lib/redshift'
import {
  PREMIO_PIPELINES, PLINKO_PIPELINES, ALL_PRODUCT_PIPELINES,
  PRODUCT_PIPELINES, isProductKey, ACTIVE_DEAL_SQL,
} from '@/lib/config'

// Desglose de las ventas elegibles y activas que componen el conteo de un
// vendedor en un periodo dado. Ruleta (mes) = Solar + Roofing; Plinko (semana)
// = Solar + Roofing + Anker + Water (estos últimos a ½ pto).
export interface DealDetail {
  caseNumber:       string | null   // número de caso (dim_profiles.case_number)
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
  case_number:    string | null
  closing_date:   string | null
  pipeline:       string | null
  amount:         string | number | null
  sales_rep:      string | null
  on_hold_status: string | null
}

const quoteIn = (ps: string[]) => ps.map(p => `'${p}'`).join(', ')

const PREMIO_IN  = quoteIn(PREMIO_PIPELINES)
const PLINKO_IN  = quoteIn(PLINKO_PIPELINES)
const PRODUCT_IN = quoteIn(ALL_PRODUCT_PIPELINES)

// `mode` decide que pipelines componen el conteo que se esta desglosando:
// ruleta = Solar + Roofing · plinko = + Anker + Water · top = los 4 productos ·
// solar/roofing/pps/water = solo ese producto (Product Champions).
function pipelineFilter(mode: string): string {
  if (mode === 'plinko')     return PLINKO_IN
  if (mode === 'top')        return PRODUCT_IN
  if (isProductKey(mode))    return quoteIn(PRODUCT_PIPELINES[mode])
  return PREMIO_IN
}

export async function GET(req: Request) {
  try {
    const url    = new URL(req.url)
    const zohoId = (url.searchParams.get('zohoId') ?? '').trim()
    const start  = (url.searchParams.get('start') ?? '').trim()
    const end    = (url.searchParams.get('end') ?? '').trim()
    const mode   = (url.searchParams.get('mode') ?? '').trim()

    if (!/^\d+$/.test(zohoId) || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
      return NextResponse.json({ error: 'Parámetros inválidos (zohoId, start, end)' }, { status: 400 })
    }

    const PIPELINE_IN = pipelineFilter(mode)

    const rows = await query<DealRow>(`
      SELECT
        COALESCE(dp.case_number, dp.case_number_2) AS case_number,
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
        ON stm.member_id = ds.sales_rep
      WHERE fd.closing_date >= $2
        AND fd.closing_date <= $3
        AND fd.closing_date IS NOT NULL
        AND ${ACTIVE_DEAL_SQL}
        AND stm.member_id = $1
        AND LOWER(dp.pipeline) IN (${PIPELINE_IN})
      ORDER BY fd.closing_date, dp.pipeline
    `, [zohoId, start, end])

    const deals: DealDetail[] = rows.map(r => ({
      caseNumber:   r.case_number && String(r.case_number).trim() !== '' ? String(r.case_number).trim() : null,
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

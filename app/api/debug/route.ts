import { NextResponse } from 'next/server'
import { query } from '@/lib/redshift'
import { TESLA_START, TESLA_END, CRUISE_START, CRUISE_END } from '@/lib/config'

export async function GET(req: Request) {
  const url    = new URL(req.url)
  const zohoId = url.searchParams.get('zohoId') ?? ''
  const token  = (url.searchParams.get('token') ?? '').trim()
  const secret = (process.env.ADMIN_TOKEN ?? '').trim()
  if (secret && token !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 1. Find the member's email from dim_sales_team_member
  const memberRows = await query<{ member_id: string; full_name: string; email: string }>(
    `SELECT member_id, full_name, email FROM dw_zoho.dim_sales_team_member WHERE member_id = $1`,
    [zohoId],
  )

  if (memberRows.length === 0) {
    return NextResponse.json({ error: `No member found for zohoId=${zohoId}` }, { status: 404 })
  }

  const member = memberRows[0]

  // 2. What distinct pipeline values does this rep have? (Tesla period)
  const pipelinesTesl = await query<{ pipeline: string; cnt: number }>(
    `SELECT LOWER(dp.pipeline) AS pipeline, COUNT(*) AS cnt
     FROM dwh.fact_deals fd
     JOIN dwh.dim_profiles dp ON dp.id_profile = fd.id_profile
     JOIN dwh.dim_status_reason dsr ON dsr.id_status_reason = fd.id_status_reason AND dsr.is_current = true
     JOIN dwh.dim_staff ds ON ds.id_staff = fd.id_staff AND ds.is_current = true
     WHERE fd.closing_date >= $1 AND fd.closing_date <= $2
       AND fd.closing_date IS NOT NULL
       AND dsr.stage = 'Closed Won'
       AND LOWER(ds.sale_rep_email) = LOWER($3)
     GROUP BY LOWER(dp.pipeline)`,
    [TESLA_START, TESLA_END, member.email],
  )

  // 3. Same but ALL stages (to see if any deals exist at all)
  const allStages = await query<{ stage: string; pipeline: string; cnt: number }>(
    `SELECT dsr.stage, LOWER(dp.pipeline) AS pipeline, COUNT(*) AS cnt
     FROM dwh.fact_deals fd
     JOIN dwh.dim_profiles dp ON dp.id_profile = fd.id_profile
     JOIN dwh.dim_status_reason dsr ON dsr.id_status_reason = fd.id_status_reason AND dsr.is_current = true
     JOIN dwh.dim_staff ds ON ds.id_staff = fd.id_staff AND ds.is_current = true
     WHERE fd.closing_date >= $1 AND fd.closing_date <= $2
       AND fd.closing_date IS NOT NULL
       AND LOWER(ds.sale_rep_email) = LOWER($3)
     GROUP BY dsr.stage, LOWER(dp.pipeline)
     ORDER BY cnt DESC`,
    [TESLA_START, TESLA_END, member.email],
  )

  // 4. Check if email match works via member_id join
  const viaJoin = await query<{ pipeline: string; cnt: number }>(
    `SELECT LOWER(dp.pipeline) AS pipeline, COUNT(*) AS cnt
     FROM dwh.fact_deals fd
     JOIN dwh.dim_profiles dp ON dp.id_profile = fd.id_profile
     JOIN dwh.dim_status_reason dsr ON dsr.id_status_reason = fd.id_status_reason AND dsr.is_current = true
     JOIN dwh.dim_staff ds ON ds.id_staff = fd.id_staff AND ds.is_current = true
     LEFT JOIN dw_zoho.dim_sales_team_member stm ON LOWER(stm.email) = LOWER(ds.sale_rep_email)
     WHERE fd.closing_date >= $1 AND fd.closing_date <= $2
       AND fd.closing_date IS NOT NULL
       AND dsr.stage = 'Closed Won'
       AND stm.member_id = $3
     GROUP BY LOWER(dp.pipeline)`,
    [TESLA_START, TESLA_END, zohoId],
  )

  // 5. Monthly count (current month)
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm   = String(now.getMonth() + 1).padStart(2, '0')
  const first = `${yyyy}-${mm}-01`
  const last  = `${yyyy}-${mm}-${new Date(yyyy, now.getMonth() + 1, 0).getDate()}`

  const monthlyDirect = await query<{ stage: string; cnt: number }>(
    `SELECT dsr.stage, COUNT(*) AS cnt
     FROM dwh.fact_deals fd
     JOIN dwh.dim_status_reason dsr ON dsr.id_status_reason = fd.id_status_reason AND dsr.is_current = true
     JOIN dwh.dim_staff ds ON ds.id_staff = fd.id_staff AND ds.is_current = true
     WHERE fd.closing_date >= $1 AND fd.closing_date <= $2
       AND fd.closing_date IS NOT NULL
       AND LOWER(ds.sale_rep_email) = LOWER($3)
     GROUP BY dsr.stage`,
    [first, last, member.email],
  )

  // 6. Tables that reference id_product_sale (find bridge tables)
  const tablesWithProductSale = await query<{ table_schema: string; table_name: string; column_name: string }>(
    `SELECT table_schema, table_name, column_name
     FROM information_schema.columns
     WHERE LOWER(column_name) = 'id_product_sale'
     ORDER BY table_schema, table_name`,
    [],
  )

  // 7. Sample rows from dim_product_sale
  const productSaleSample = await query<Record<string, unknown>>(
    `SELECT * FROM dwh.dim_product_sale LIMIT 20`,
    [],
  )

  // 8. All dwh tables (to spot bridge tables)
  const dwhTables = await query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'dwh' ORDER BY table_name`,
    [],
  )

  // 9. dim_profiles columns
  const dimProfilesCols = await query<{ column_name: string; data_type: string }>(
    `SELECT column_name, data_type
     FROM information_schema.columns
     WHERE table_schema = 'dwh' AND table_name = 'dim_profiles'
     ORDER BY ordinal_position`,
    [],
  )

  return NextResponse.json({
    member,
    tablesWithProductSale,
    productSaleSample,
    dwhTables,
    dimProfilesCols,
  })
}

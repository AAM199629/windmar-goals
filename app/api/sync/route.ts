import { NextResponse } from 'next/server'
import { query } from '@/lib/redshift'
import { setMetrics } from '@/lib/kv'
import { buildMetrics, type RepMember, type PipelineCounts } from '@/lib/metrics'
import { TESLA_START, TESLA_END, CRUISE_START, CRUISE_END } from '@/lib/config'

function currentYYYYMM() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthRange(yyyymm: string): { first: string; last: string } {
  const [year, mm] = yyyymm.split('-')
  const lastDay = new Date(Number(year), Number(mm), 0).getDate()
  return { first: `${year}-${mm}-01`, last: `${year}-${mm}-${lastDay}` }
}

// Rows returned by the pipeline-count queries
interface PipelineRow {
  member_id: string
  pipeline:  string | null
  cnt:       string | number
}

interface MonthlyRow {
  member_id:   string
  monthly_cnt: string | number
}

interface AsistidaRow {
  mentor_id: string
  cnt:       string | number
}

// Build a map: member_id → PipelineCounts from raw rows
function toPipelineMap(rows: PipelineRow[]): Record<string, PipelineCounts> {
  const map: Record<string, PipelineCounts> = {}
  for (const row of rows) {
    if (!row.member_id) continue
    const pipeline = (row.pipeline ?? 'unknown').toLowerCase()
    if (!map[row.member_id]) map[row.member_id] = {}
    map[row.member_id][pipeline] = (map[row.member_id][pipeline] ?? 0) + Number(row.cnt)
  }
  return map
}

export async function POST(req: Request) {
  try {
    const url    = new URL(req.url)
    const token  = (url.searchParams.get('token') ?? '').trim()
    const secret = (process.env.ADMIN_TOKEN ?? '').trim()
    if (secret && token !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const month        = url.searchParams.get('month') ?? currentYYYYMM()
    const { first, last } = monthRange(month)

    // ── 1. All active team members with hierarchy + graduation dates ───────────
    const members = await query<RepMember>(`
      SELECT
        member_id, full_name, email, status,
        upline_level_1, upline_level_2, upline_level_3, upline_level_4,
        consultor_start_date, lider_start_date, gerente_start_date
      FROM dw_zoho.dim_sales_team_member
      WHERE (inactive IS NULL OR inactive = '' OR LOWER(inactive) = 'false')
        AND member_id IS NOT NULL
        AND email IS NOT NULL
    `)

    if (members.length === 0) {
      return NextResponse.json({ error: 'No team members found in dw_zoho.dim_sales_team_member' }, { status: 502 })
    }

    // ── 2. Personal deal counts by pipeline for Tesla period ──────────────────
    const personalTeslaRows = await query<PipelineRow>(`
      SELECT stm.member_id, LOWER(dp.pipeline) AS pipeline, COUNT(*) AS cnt
      FROM dwh.fact_deals fd
      JOIN dwh.dim_profiles dp
        ON dp.id_profile = fd.id_profile
      JOIN dwh.dim_status_reason dsr
        ON dsr.id_status_reason = fd.id_status_reason AND dsr.is_current = true
      JOIN dwh.dim_staff ds
        ON ds.id_staff = fd.id_staff AND ds.is_current = true
      LEFT JOIN dw_zoho.dim_sales_team_member stm
        ON LOWER(stm.email) = LOWER(ds.sale_rep_email)
      WHERE fd.closing_date >= $1
        AND fd.closing_date <= $2
        AND fd.closing_date IS NOT NULL
        AND dsr.stage <> 'Cancelled'
        AND stm.member_id IS NOT NULL
      GROUP BY stm.member_id, LOWER(dp.pipeline)
    `, [TESLA_START, TESLA_END])

    // ── 3. Team deal counts by pipeline for Tesla period (all uplines at once) ─
    // Finds every deal where the owner's upline chain includes a given member
    const teamTeslaRows = await query<PipelineRow & { upline_id: string }>(`
      SELECT team_map.upline_id AS member_id, LOWER(dp.pipeline) AS pipeline, COUNT(*) AS cnt
      FROM dwh.fact_deals fd
      JOIN dwh.dim_profiles dp
        ON dp.id_profile = fd.id_profile
      JOIN dwh.dim_status_reason dsr
        ON dsr.id_status_reason = fd.id_status_reason AND dsr.is_current = true
      JOIN dwh.dim_staff ds
        ON ds.id_staff = fd.id_staff AND ds.is_current = true
      LEFT JOIN dw_zoho.dim_sales_team_member stm
        ON LOWER(stm.email) = LOWER(ds.sale_rep_email)
      JOIN (
        SELECT member_id, upline_level_1 AS upline_id FROM dw_zoho.dim_sales_team_member WHERE upline_level_1 IS NOT NULL
        UNION ALL
        SELECT member_id, upline_level_2 FROM dw_zoho.dim_sales_team_member WHERE upline_level_2 IS NOT NULL
        UNION ALL
        SELECT member_id, upline_level_3 FROM dw_zoho.dim_sales_team_member WHERE upline_level_3 IS NOT NULL
        UNION ALL
        SELECT member_id, upline_level_4 FROM dw_zoho.dim_sales_team_member WHERE upline_level_4 IS NOT NULL
      ) team_map ON team_map.member_id = stm.member_id
      WHERE fd.closing_date >= $1
        AND fd.closing_date <= $2
        AND fd.closing_date IS NOT NULL
        AND dsr.stage <> 'Cancelled'
        AND stm.member_id IS NOT NULL
      GROUP BY team_map.upline_id, LOWER(dp.pipeline)
    `, [TESLA_START, TESLA_END])

    // ── 4. Personal deal counts by pipeline for Cruise period ─────────────────
    const personalCruiseRows = await query<PipelineRow>(`
      SELECT stm.member_id, LOWER(dp.pipeline) AS pipeline, COUNT(*) AS cnt
      FROM dwh.fact_deals fd
      JOIN dwh.dim_profiles dp
        ON dp.id_profile = fd.id_profile
      JOIN dwh.dim_status_reason dsr
        ON dsr.id_status_reason = fd.id_status_reason AND dsr.is_current = true
      JOIN dwh.dim_staff ds
        ON ds.id_staff = fd.id_staff AND ds.is_current = true
      LEFT JOIN dw_zoho.dim_sales_team_member stm
        ON LOWER(stm.email) = LOWER(ds.sale_rep_email)
      WHERE fd.closing_date >= $1
        AND fd.closing_date <= $2
        AND fd.closing_date IS NOT NULL
        AND dsr.stage <> 'Cancelled'
        AND stm.member_id IS NOT NULL
      GROUP BY stm.member_id, LOWER(dp.pipeline)
    `, [CRUISE_START, CRUISE_END])

    // ── 5. Asistida: count trainee (1st–4th) sales per mentor within Cruise period ─
    // The mentor is the trainee's upline_level_1
    const asistidaRows = await query<AsistidaRow>(`
      SELECT stm_mentor.member_id AS mentor_id, COUNT(*) AS cnt
      FROM dwh.fact_deals fd
      JOIN dwh.dim_status_reason dsr
        ON dsr.id_status_reason = fd.id_status_reason AND dsr.is_current = true
      JOIN dwh.dim_staff ds
        ON ds.id_staff = fd.id_staff AND ds.is_current = true
      LEFT JOIN dw_zoho.dim_sales_team_member stm_trainee
        ON LOWER(stm_trainee.email) = LOWER(ds.sale_rep_email)
      LEFT JOIN dw_zoho.dim_sales_team_member stm_mentor
        ON stm_mentor.member_id = stm_trainee.upline_level_1
      WHERE fd.closing_date >= $1
        AND fd.closing_date <= $2
        AND fd.closing_date IS NOT NULL
        AND dsr.stage <> 'Cancelled'
        AND ds.trainee_sales IN ('1st Sale', '2nd Sale', '3rd Sale', '4th Sale')
        AND stm_mentor.member_id IS NOT NULL
      GROUP BY stm_mentor.member_id
    `, [CRUISE_START, CRUISE_END])

    // ── 6. Monthly count per rep (current month, any pipeline, not cancelled) ─
    const monthlyRows = await query<MonthlyRow>(`
      SELECT stm.member_id, COUNT(*) AS monthly_cnt
      FROM dwh.fact_deals fd
      JOIN dwh.dim_status_reason dsr
        ON dsr.id_status_reason = fd.id_status_reason AND dsr.is_current = true
      JOIN dwh.dim_staff ds
        ON ds.id_staff = fd.id_staff AND ds.is_current = true
      LEFT JOIN dw_zoho.dim_sales_team_member stm
        ON LOWER(stm.email) = LOWER(ds.sale_rep_email)
      WHERE fd.closing_date >= $1
        AND fd.closing_date <= $2
        AND fd.closing_date IS NOT NULL
        AND dsr.stage <> 'Cancelled'
        AND stm.member_id IS NOT NULL
      GROUP BY stm.member_id
    `, [first, last])

    // ── 7. Build lookup maps ───────────────────────────────────────────────────
    const teslaPipelineMap  = toPipelineMap(personalTeslaRows)
    const teamPipelineMap   = toPipelineMap(teamTeslaRows)
    const cruisePipelineMap = toPipelineMap(personalCruiseRows)

    const monthlyMap: Record<string, number> = {}
    for (const r of monthlyRows) {
      if (r.member_id) monthlyMap[r.member_id] = Number(r.monthly_cnt)
    }

    const asistidaMap: Record<string, number> = {}
    for (const r of asistidaRows) {
      if (r.mentor_id) asistidaMap[r.mentor_id] = Number(r.cnt)
    }

    // Pre-build: for each member, find their direct/indirect reports
    const teamMembersOf: Record<string, RepMember[]> = {}
    for (const m of members) {
      for (const uplineId of [m.upline_level_1, m.upline_level_2, m.upline_level_3, m.upline_level_4]) {
        if (!uplineId) continue
        if (!teamMembersOf[uplineId]) teamMembersOf[uplineId] = []
        teamMembersOf[uplineId].push(m)
      }
    }

    // ── 8. Build and persist metrics for each member ──────────────────────────
    const results: Array<{ zohoId: string; name: string; ok: boolean; error?: string }> = []

    await Promise.all(
      members.map(async (member) => {
        try {
          const metrics = buildMetrics({
            member,
            teslaCounts:   teslaPipelineMap[member.member_id]  ?? {},
            teamCounts:    teamPipelineMap[member.member_id]   ?? {},
            cruiseCounts:  cruisePipelineMap[member.member_id] ?? {},
            teamMembers:   teamMembersOf[member.member_id]     ?? [],
            asistidaCount: asistidaMap[member.member_id]       ?? 0,
            monthlyCount:  monthlyMap[member.member_id]        ?? 0,
            currentMonth:  month,
            cruiseStart:   CRUISE_START,
            cruiseEnd:     CRUISE_END,
          })

          await setMetrics(member.member_id, metrics)
          results.push({ zohoId: member.member_id, name: member.full_name, ok: true })
        } catch (e) {
          results.push({ zohoId: member.member_id, name: member.full_name, ok: false, error: String(e) })
        }
      }),
    )

    const succeeded = results.filter(r => r.ok).length
    const failed    = results.filter(r => !r.ok).length

    return NextResponse.json({
      ok: true,
      month,
      total: members.length,
      succeeded,
      failed,
      errors:    results.filter(r => !r.ok),
      updatedAt: new Date().toISOString(),
    })
  } catch (e) {
    return NextResponse.json(
      { error: String(e), stack: e instanceof Error ? e.stack : undefined },
      { status: 500 },
    )
  }
}

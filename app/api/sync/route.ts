import { NextResponse } from 'next/server'
import { query } from '@/lib/redshift'
import { setMetrics, setMembersList, setComptesaRankings, setGerenteAccionistaRankings, type ComptesaRankings, type GerenteAccionistaRankEntry } from '@/lib/kv'
import { buildMetrics, type RepMember, type PipelineCounts } from '@/lib/metrics'
import { TESLA_START, TESLA_END, CRUISE_START, CRUISE_END, COMPTESLA_START, COMPTESLA_END, ACTIVE_DEAL_SQL, ALLOWED_ROLES_SQL } from '@/lib/config'

function currentYYYYMM() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthRange(yyyymm: string): { first: string; last: string } {
  const [year, mm] = yyyymm.split('-')
  const lastDay = new Date(Number(year), Number(mm), 0).getDate()
  return { first: `${year}-${mm}-01`, last: `${year}-${mm}-${lastDay}` }
}

function currentWeekRange(): { monday: string; sunday: string } {
  const now  = new Date()
  const day  = now.getDay() // 0=Sun … 6=Sat
  const diff = day === 0 ? -6 : 1 - day
  const mon  = new Date(now)
  mon.setDate(now.getDate() + diff)
  const sun = new Date(mon)
  sun.setDate(mon.getDate() + 6)
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { monday: fmt(mon), sunday: fmt(sun) }
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

async function runSync(month: string) {
    const { first, last } = monthRange(month)
    const { monday, sunday } = currentWeekRange()

    // ── 1. All active team members with hierarchy + graduation dates ───────────
    const members = await query<RepMember>(`
      SELECT
        member_id, full_name, email, status, sales_role,
        sponsor_id,
        upline_level_1, upline_level_2, upline_level_3, upline_level_4,
        consultor_start_date, lider_start_date, gerente_start_date
      FROM dw_zoho.dim_sales_team_member
      WHERE (inactive IS NULL OR inactive = '' OR LOWER(inactive) = 'false')
        AND member_id IS NOT NULL
        AND email IS NOT NULL
        AND ${ALLOWED_ROLES_SQL}
    `)

    if (members.length === 0) {
      throw new Error('No team members found in dw_zoho.dim_sales_team_member')
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
        AND ${ACTIVE_DEAL_SQL}
        AND stm.member_id IS NOT NULL
      GROUP BY stm.member_id, LOWER(dp.pipeline)
    `, [TESLA_START, TESLA_END])

    // ── 3. Team deal counts by pipeline for Tesla period (all uplines at once) ─
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
        AND ${ACTIVE_DEAL_SQL}
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
        AND ${ACTIVE_DEAL_SQL}
        AND stm.member_id IS NOT NULL
      GROUP BY stm.member_id, LOWER(dp.pipeline)
    `, [CRUISE_START, CRUISE_END])

    // ── 5. Asistida: count trainee (1st–4th) sales per mentor within Cruise period ─
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
        ON stm_mentor.member_id = stm_trainee.sponsor_id
      WHERE fd.closing_date >= $1
        AND fd.closing_date <= $2
        AND fd.closing_date IS NOT NULL
        AND ${ACTIVE_DEAL_SQL}
        AND ds.trainee_sales IN ('1st Sale', '2nd Sale', '3rd Sale', '4th Sale')
        AND stm_mentor.member_id IS NOT NULL
      GROUP BY stm_mentor.member_id
    `, [CRUISE_START, CRUISE_END])

    // ── 6. Monthly total count per rep (for Monthly Sales card) ───────────────
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
        AND ${ACTIVE_DEAL_SQL}
        AND stm.member_id IS NOT NULL
      GROUP BY stm.member_id
    `, [first, last])

    // ── 7. Weekly pipeline counts (Plinko) ────────────────────────────────────
    const weeklyPipelineRows = await query<PipelineRow>(`
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
        AND ${ACTIVE_DEAL_SQL}
        AND stm.member_id IS NOT NULL
      GROUP BY stm.member_id, LOWER(dp.pipeline)
    `, [monday, sunday])

    // ── 8. Monthly pipeline counts (Ruleta + Graduación) ─────────────────────
    const monthlyPipelineRows = await query<PipelineRow>(`
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
        AND ${ACTIVE_DEAL_SQL}
        AND stm.member_id IS NOT NULL
      GROUP BY stm.member_id, LOWER(dp.pipeline)
    `, [first, last])

    // ── 8b. Competencia Tesla: batería con solar / sola (ventas propias) ───────
    // Batería Tesla = battery_qty > 0 AND battery_type contiene 'tesla'.
    // Con solar (1 pt) = system_size_kw1 > 0 · Sola (0.5 pt) = system_size_kw1 en 0/null.
    const teslaCompRows = await query<{ member_id: string; bateria_con_solar: string | number; bateria_sola: string | number }>(`
      SELECT
        stm.member_id,
        SUM(CASE WHEN COALESCE(fd.system_size_kw1, 0) > 0 THEN 1 ELSE 0 END) AS bateria_con_solar,
        SUM(CASE WHEN COALESCE(fd.system_size_kw1, 0) = 0 THEN 1 ELSE 0 END) AS bateria_sola
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
        AND ${ACTIVE_DEAL_SQL}
        AND stm.member_id IS NOT NULL
        AND COALESCE(fd.battery_qty, 0) > 0
        AND LOWER(fd.battery_type) LIKE '%tesla%'
      GROUP BY stm.member_id
    `, [COMPTESLA_START, COMPTESLA_END])

    // ── 8c. Competencia Tesla: asistidas (1ª–4ª venta Tesla de un trainee → mentor) ─
    const teslaAsistidaRows = await query<AsistidaRow>(`
      SELECT stm_mentor.member_id AS mentor_id, COUNT(*) AS cnt
      FROM dwh.fact_deals fd
      JOIN dwh.dim_status_reason dsr
        ON dsr.id_status_reason = fd.id_status_reason AND dsr.is_current = true
      JOIN dwh.dim_staff ds
        ON ds.id_staff = fd.id_staff AND ds.is_current = true
      LEFT JOIN dw_zoho.dim_sales_team_member stm_trainee
        ON LOWER(stm_trainee.email) = LOWER(ds.sale_rep_email)
      LEFT JOIN dw_zoho.dim_sales_team_member stm_mentor
        ON stm_mentor.member_id = stm_trainee.sponsor_id
      WHERE fd.closing_date >= $1
        AND fd.closing_date <= $2
        AND fd.closing_date IS NOT NULL
        AND ${ACTIVE_DEAL_SQL}
        AND ds.trainee_sales IN ('1st Sale', '2nd Sale', '3rd Sale', '4th Sale')
        AND COALESCE(fd.battery_qty, 0) > 0
        AND LOWER(fd.battery_type) LIKE '%tesla%'
        AND stm_mentor.member_id IS NOT NULL
      GROUP BY stm_mentor.member_id
    `, [COMPTESLA_START, COMPTESLA_END])

    const teslaCompMap: Record<string, { bateriaConSolar: number; bateriaSola: number; asistida: number }> = {}
    for (const r of teslaCompRows) {
      if (!r.member_id) continue
      teslaCompMap[r.member_id] = {
        bateriaConSolar: Number(r.bateria_con_solar) || 0,
        bateriaSola:     Number(r.bateria_sola)      || 0,
        asistida:        0,
      }
    }
    for (const r of teslaAsistidaRows) {
      if (!r.mentor_id) continue
      const e = teslaCompMap[r.mentor_id] ?? { bateriaConSolar: 0, bateriaSola: 0, asistida: 0 }
      e.asistida = Number(r.cnt) || 0
      teslaCompMap[r.mentor_id] = e
    }

    // ── 9. Build lookup maps ──────────────────────────────────────────────────
    const teslaPipelineMap    = toPipelineMap(personalTeslaRows)
    const teamPipelineMap     = toPipelineMap(teamTeslaRows)
    const cruisePipelineMap   = toPipelineMap(personalCruiseRows)
    const weeklyPipelineMap   = toPipelineMap(weeklyPipelineRows)
    const monthlyPipelineMap  = toPipelineMap(monthlyPipelineRows)

    const monthlyMap: Record<string, number> = {}
    for (const r of monthlyRows) {
      if (r.member_id) monthlyMap[r.member_id] = Number(r.monthly_cnt)
    }

    const asistidaMap: Record<string, number> = {}
    for (const r of asistidaRows) {
      if (r.mentor_id) asistidaMap[r.mentor_id] = Number(r.cnt)
    }

    // Pre-build: sponsor_id is the recruiter's member_id (upline_level_1–4 are null in this dataset)
    const directReportsOf: Record<string, RepMember[]> = {}
    for (const m of members) {
      if (m.sponsor_id) {
        if (!directReportsOf[m.sponsor_id]) directReportsOf[m.sponsor_id] = []
        directReportsOf[m.sponsor_id].push(m)
      }
    }

    const directLineMembersOf = directReportsOf

    // ── 10. Build and persist metrics for each member ─────────────────────────
    const results: Array<{ zohoId: string; name: string; ok: boolean; error?: string }> = []
    const comptesla: Array<{ zohoId: string; name: string; role: string; points: number; ventas: number }> = []
    const gerentea: GerenteAccionistaRankEntry[] = []

    await Promise.all(
      members.map(async (member) => {
        try {
          const metrics = buildMetrics({
            member,
            teslaCounts:       teslaPipelineMap[member.member_id]      ?? {},
            teamCounts:        teamPipelineMap[member.member_id]       ?? {},
            cruiseCounts:      cruisePipelineMap[member.member_id]     ?? {},
            teamMembers:       directReportsOf[member.member_id] ?? [],
            directLineMembers: directLineMembersOf[member.member_id]   ?? [],
            asistidaCount:     asistidaMap[member.member_id]           ?? 0,
            monthlyCount:      monthlyMap[member.member_id]            ?? 0,
            weeklyPipelines:   weeklyPipelineMap[member.member_id]     ?? {},
            monthlyPipelines:  monthlyPipelineMap[member.member_id]    ?? {},
            teslaCompCounts:   teslaCompMap[member.member_id]          ?? { bateriaConSolar: 0, bateriaSola: 0, asistida: 0 },
            currentMonth:      month,
            weekStart:         monday,
            cruiseStart:       CRUISE_START,
            cruiseEnd:         CRUISE_END,
          })

          await setMetrics(member.member_id, metrics)
          if (metrics.competenciaTesla) {
            comptesla.push({
              zohoId: member.member_id,
              name:   member.full_name,
              role:   metrics.plinko.role,
              points: metrics.competenciaTesla.points,
              ventas: metrics.competenciaTesla.ventas,
            })
          }
          if (metrics.gerenteAccionista) {
            const ga = metrics.gerenteAccionista
            gerentea.push({
              zohoId:      member.member_id,
              name:        member.full_name,
              gerentes:    ga.primary.gerentes,
              lideres:     ga.primary.lideres,
              consultores: ga.primary.consultores,
              devPoints:   ga.dev.points,
              salesPoints: ga.sales.points,
              primaryDone: ga.primary.done,
            })
          }
          results.push({ zohoId: member.member_id, name: member.full_name, ok: true })
        } catch (e) {
          results.push({ zohoId: member.member_id, name: member.full_name, ok: false, error: String(e) })
        }
      }),
    )

    // ── 10b. Competencia Tesla: top 10 por rol (trainees NO participan) ────────
    const rankings: ComptesaRankings = {}
    for (const role of ['consultor', 'lider', 'gerente']) {
      rankings[role] = comptesla
        .filter(c => c.role === role)
        .sort((a, b) => b.points - a.points)
        .slice(0, 10)
        .map(({ zohoId, name, points, ventas }) => ({ zohoId, name, points, ventas }))
    }
    await setComptesaRankings(rankings)

    // ── 10c. Gerente Accionista: ranking de gerentes (orden por pts de desarrollo) ─
    gerentea.sort((a, b) => b.devPoints - a.devPoints || b.salesPoints - a.salesPoints)
    await setGerenteAccionistaRankings(gerentea)

    const succeeded = results.filter(r => r.ok).length
    const failed    = results.filter(r => !r.ok).length

    // Save compact members index for the directory/search page
    const membersList = results
      .filter(r => r.ok)
      .map(r => ({ zohoId: r.zohoId, name: r.name }))
      .sort((a, b) => a.name.localeCompare(b.name))
    await setMembersList(membersList)

  return {
    ok: true,
    month,
    weekRange: { monday, sunday },
    total: members.length,
    succeeded,
    failed,
    errors:    results.filter(r => !r.ok),
    updatedAt: new Date().toISOString(),
  }
}

export async function GET(req: Request) {
  const cronSecret = (process.env.CRON_SECRET ?? '').trim()
  const authHeader = req.headers.get('authorization') ?? ''
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const result = await runSync(currentYYYYMM())
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json(
      { error: String(e), stack: e instanceof Error ? e.stack : undefined },
      { status: 500 },
    )
  }
}

export async function POST(req: Request) {
  const url    = new URL(req.url)
  const token  = (url.searchParams.get('token') ?? '').trim()
  const secret = (process.env.ADMIN_TOKEN ?? '').trim()
  if (secret && token !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const month  = url.searchParams.get('month') ?? currentYYYYMM()
    const result = await runSync(month)
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json(
      { error: String(e), stack: e instanceof Error ? e.stack : undefined },
      { status: 500 },
    )
  }
}

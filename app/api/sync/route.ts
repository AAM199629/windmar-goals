import { NextResponse } from 'next/server'
import { query } from '@/lib/redshift'
import { setMetrics, setMembersList, setComptesaRankings, setGerenteAccionistaRankings, setCLideresRankings, type ComptesaRankings, type GerenteAccionistaRankEntry, type CLideresRankEntry } from '@/lib/kv'
import { buildMetrics, type RepMember, type PipelineCounts } from '@/lib/metrics'
import { TESLA_START, TESLA_END, CRUISE_START, CRUISE_END, COMPTESLA_START, COMPTESLA_END, CLIDERES_START, CLIDERES_END, CLIDERES_TOP_N, ACTIVE_DEAL_SQL, ALLOWED_ROLES_SQL, PROMOTOR_ROLES_SQL, promotorActiveSql } from '@/lib/config'
import type { MemberEntry } from '@/lib/kv'

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

// Meta Tesla Model Y: las ventas del equipo cuentan hasta 4 líneas de profundidad.
const TEAM_LEVELS = 4

// Reparte los conteos personales de cada vendedor entre sus uplines (hasta
// TEAM_LEVELS niveles), subiendo por la cadena de sponsor_id.
//
// OJO: `upline_level_1–4` de dim_sales_team_member NO sirven para esto — guardan
// el NOMBRE del upline ('Kenneth La Quay'), no su member_id. Agrupar por esas
// columnas y luego buscar por member_id daba 0 matches, así que el equipo salía
// en 0 para TODOS. `sponsor_id` sí es un member_id real.
function buildTeamMap(
  personal:  Record<string, PipelineCounts>,
  sponsorOf: Record<string, string>,
): Record<string, PipelineCounts> {
  const team: Record<string, PipelineCounts> = {}
  for (const [sellerId, counts] of Object.entries(personal)) {
    let current = sellerId
    const seen  = new Set([sellerId])  // corta ciclos en sponsor_id
    for (let level = 0; level < TEAM_LEVELS; level++) {
      const upline = sponsorOf[current]
      if (!upline || seen.has(upline)) break
      seen.add(upline)
      const bucket = (team[upline] ??= {})
      for (const [pipeline, n] of Object.entries(counts)) {
        bucket[pipeline] = (bucket[pipeline] ?? 0) + n
      }
      current = upline
    }
  }
  return team
}

async function runSync(month: string) {
    const { first, last } = monthRange(month)
    const { monday, sunday } = currentWeekRange()

    // ── 1. All active team members with hierarchy + graduation dates ───────────
    const members = await query<RepMember>(`
      SELECT
        member_id, full_name, email, status, sales_role,
        sponsor_id,
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

    // ── 1b. Genealogía completa (member_id → sponsor_id) ───────────────────────
    // SIN filtros de rol ni de estado, a propósito: la cadena de upline tiene que
    // poder atravesar trainees, promotores e inactivos. Si se cortara en ellos se
    // perdería toda su descendencia (p. ej. las líneas 3 y 4 que cuelgan de un
    // trainee). Solo se usa para armar el árbol, no para mostrar a nadie.
    const genealogyRows = await query<{ member_id: string; sponsor_id: string | null }>(`
      SELECT member_id, sponsor_id
      FROM dw_zoho.dim_sales_team_member
      WHERE member_id IS NOT NULL
    `)
    const sponsorOf: Record<string, string> = {}
    for (const g of genealogyRows) {
      if (g.sponsor_id) sponsorOf[g.member_id] = g.sponsor_id
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
        ON stm.member_id = ds.sales_rep
      WHERE fd.closing_date >= $1
        AND fd.closing_date <= $2
        AND fd.closing_date IS NOT NULL
        AND ${ACTIVE_DEAL_SQL}
        AND stm.member_id IS NOT NULL
      GROUP BY stm.member_id, LOWER(dp.pipeline)
    `, [TESLA_START, TESLA_END])

    // ── 3. (eliminada) Las ventas de equipo ya no se piden a Redshift: se derivan
    // en memoria de los conteos personales (bloque 2) subiendo por `sponsorOf`.
    // Ver buildTeamMap(); el bloque 2 incluye a TODOS los que vendieron (sin filtro
    // de rol), que es justo lo que hay que repartir entre los uplines.

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
        ON stm.member_id = ds.sales_rep
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
        ON stm_trainee.member_id = ds.sales_rep
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
        ON stm.member_id = ds.sales_rep
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
        ON stm.member_id = ds.sales_rep
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
        ON stm.member_id = ds.sales_rep
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
    // Los PUNTOS se cuentan por cantidad de baterías (× battery_qty); las VENTAS
    // (hacia el mínimo de 10) se cuentan por deal, sin importar cuántas baterías.
    const teslaCompRows = await query<{ member_id: string; bateria_con_solar: string | number; bateria_sola: string | number; ventas: string | number }>(`
      SELECT
        stm.member_id,
        SUM(CASE WHEN COALESCE(fd.system_size_kw1, 0) > 0 THEN COALESCE(fd.battery_qty, 0) ELSE 0 END) AS bateria_con_solar,
        SUM(CASE WHEN COALESCE(fd.system_size_kw1, 0) = 0 THEN COALESCE(fd.battery_qty, 0) ELSE 0 END) AS bateria_sola,
        COUNT(*) AS ventas
      FROM dwh.fact_deals fd
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
        ON stm_trainee.member_id = ds.sales_rep
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

    // ── 8d. Competencia Líderes: ventas personales por pipeline (01 ago – 31 dic) ─
    const lideresRows = await query<PipelineRow>(`
      SELECT stm.member_id, LOWER(dp.pipeline) AS pipeline, COUNT(*) AS cnt
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
      GROUP BY stm.member_id, LOWER(dp.pipeline)
    `, [CLIDERES_START, CLIDERES_END])

    // ── 8e. Competencia Líderes: ventas de trainee (1ª–4ª) POR PIPELINE ─────────
    // A diferencia de la asistida del crucero (conteo plano × 0.5), aquí la venta
    // del trainee se pondera por producto igual que la personal, así que hace falta
    // el desglose por pipeline. El mentor es el sponsor_id del trainee.
    // Se alias-ea mentor_id AS member_id para poder reusar toPipelineMap().
    const lideresTraineeRows = await query<PipelineRow>(`
      SELECT stm_mentor.member_id AS member_id, LOWER(dp.pipeline) AS pipeline, COUNT(*) AS cnt
      FROM dwh.fact_deals fd
      JOIN dwh.dim_profiles dp
        ON dp.id_profile = fd.id_profile
      JOIN dwh.dim_status_reason dsr
        ON dsr.id_status_reason = fd.id_status_reason AND dsr.is_current = true
      JOIN dwh.dim_staff ds
        ON ds.id_staff = fd.id_staff AND ds.is_current = true
      LEFT JOIN dw_zoho.dim_sales_team_member stm_trainee
        ON stm_trainee.member_id = ds.sales_rep
      LEFT JOIN dw_zoho.dim_sales_team_member stm_mentor
        ON stm_mentor.member_id = stm_trainee.sponsor_id
      WHERE fd.closing_date >= $1
        AND fd.closing_date <= $2
        AND fd.closing_date IS NOT NULL
        AND ${ACTIVE_DEAL_SQL}
        AND ds.trainee_sales IN ('1st Sale', '2nd Sale', '3rd Sale', '4th Sale')
        AND stm_mentor.member_id IS NOT NULL
      GROUP BY stm_mentor.member_id, LOWER(dp.pipeline)
    `, [CLIDERES_START, CLIDERES_END])

    const teslaCompMap: Record<string, { bateriaConSolar: number; bateriaSola: number; asistida: number; ventas: number }> = {}
    for (const r of teslaCompRows) {
      if (!r.member_id) continue
      teslaCompMap[r.member_id] = {
        bateriaConSolar: Number(r.bateria_con_solar) || 0,
        bateriaSola:     Number(r.bateria_sola)      || 0,
        asistida:        0,
        ventas:          Number(r.ventas)            || 0,
      }
    }
    for (const r of teslaAsistidaRows) {
      if (!r.mentor_id) continue
      const e = teslaCompMap[r.mentor_id] ?? { bateriaConSolar: 0, bateriaSola: 0, asistida: 0, ventas: 0 }
      e.asistida = Number(r.cnt) || 0
      teslaCompMap[r.mentor_id] = e
    }

    // ── 9. Build lookup maps ──────────────────────────────────────────────────
    const teslaPipelineMap    = toPipelineMap(personalTeslaRows)
    const teamPipelineMap     = buildTeamMap(teslaPipelineMap, sponsorOf)
    const cruisePipelineMap   = toPipelineMap(personalCruiseRows)
    const weeklyPipelineMap   = toPipelineMap(weeklyPipelineRows)
    const monthlyPipelineMap  = toPipelineMap(monthlyPipelineRows)
    const lideresMap          = toPipelineMap(lideresRows)
    const lideresTraineeMap   = toPipelineMap(lideresTraineeRows)

    const monthlyMap: Record<string, number> = {}
    for (const r of monthlyRows) {
      if (r.member_id) monthlyMap[r.member_id] = Number(r.monthly_cnt)
    }

    const asistidaMap: Record<string, number> = {}
    for (const r of asistidaRows) {
      if (r.mentor_id) asistidaMap[r.mentor_id] = Number(r.cnt)
    }

    // Pre-build: sponsor_id es el member_id del reclutador (1ª línea directa).
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
    const clideres: CLideresRankEntry[] = []

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
            teslaCompCounts:   teslaCompMap[member.member_id]          ?? { bateriaConSolar: 0, bateriaSola: 0, asistida: 0, ventas: 0 },
            lideresCounts:        lideresMap[member.member_id]         ?? {},
            lideresTraineeCounts: lideresTraineeMap[member.member_id]  ?? {},
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
          if (metrics.competenciaLideres) {
            const cl = metrics.competenciaLideres
            clideres.push({
              zohoId:         member.member_id,
              name:           member.full_name,
              points:         cl.points,
              personalPoints: cl.personalPoints,
              traineePoints:  cl.traineePoints,
              qualified:      cl.qualified,
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

    // ── 10c. Gerente Accionista: top 10 gerentes (orden por pts de desarrollo) ─
    gerentea.sort((a, b) => b.devPoints - a.devPoints || b.salesPoints - a.salesPoints)
    await setGerenteAccionistaRankings(gerentea.slice(0, 10))

    // ── 10d. Competencia Líderes: top 15 por puntos (solo líderes) ─────────────
    clideres.sort((a, b) => b.points - a.points)
    await setCLideresRankings(clideres.slice(0, CLIDERES_TOP_N))

    const succeeded = results.filter(r => r.ok).length
    const failed    = results.filter(r => !r.ok).length

    // Promotores: no tienen métricas de vendedor, pero deben ser descubribles en
    // la búsqueda y enrutar a su dashboard de promotor (/p/[zohoId] hace el branch).
    const promotores = await query<{ member_id: string; full_name: string }>(`
      SELECT member_id, full_name
      FROM dw_zoho.dim_sales_team_member
      WHERE member_id IS NOT NULL AND email IS NOT NULL
        AND ${PROMOTOR_ROLES_SQL}
        AND ${promotorActiveSql()}
    `)

    // Save compact members index for the directory/search page
    const membersList: MemberEntry[] = [
      ...results.filter(r => r.ok).map(r => ({ zohoId: r.zohoId, name: r.name })),
      ...promotores.map(p => ({ zohoId: p.member_id, name: p.full_name, role: 'promotor' as const })),
    ].sort((a, b) => a.name.localeCompare(b.name))
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

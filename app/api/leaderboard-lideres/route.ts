import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { query } from '@/lib/redshift'
import {
  CLIDERES_START, CLIDERES_END, CLIDERES_CUTOFF, CLIDERES_POINTS,
  CLIDERES_MIN_POINTS, CLIDERES_TOP_N, CLIDERES_PRIZES,
  normalizeRole, ACTIVE_DEAL_SQL, ALLOWED_ROLES_SQL, isCLideresParticipant,
} from '@/lib/config'

export interface LideresLeaderboardRow {
  zohoId:         string
  name:           string
  points:         number
  personalPoints: number
  traineePoints:  number
  // Conteo de ventas (no puntos) por producto, para la tabla
  solar:          number
  roofing:        number
  water:          number
  pps:            number
  qualified:      boolean
}

export interface LideresLeaderboardResponse {
  rows:       LideresLeaderboardRow[]
  start:      string
  end:        string
  cutoff:     string
  minPoints:  number
  topN:       number
  prizes:     number[]
  computedAt: string
}

interface MemberRow {
  member_id:  string
  full_name:  string
  sales_role: string | null
}

interface PipelineRow {
  member_id: string
  pipeline:  string | null
  cnt:       string | number
}

// member_id → { pipeline → conteo }
function toPipelineMap(rows: PipelineRow[]): Record<string, Record<string, number>> {
  const map: Record<string, Record<string, number>> = {}
  for (const row of rows) {
    if (!row.member_id) continue
    const pipeline = (row.pipeline ?? 'unknown').toLowerCase()
    if (!map[row.member_id]) map[row.member_id] = {}
    map[row.member_id][pipeline] = (map[row.member_id][pipeline] ?? 0) + Number(row.cnt)
  }
  return map
}

function weightedPoints(counts: Record<string, number>): number {
  return Object.entries(CLIDERES_POINTS).reduce(
    (acc, [pipeline, pts]) => acc + (counts[pipeline] ?? 0) * pts,
    0,
  )
}

const fetchLideresLeaderboard = unstable_cache(
  async (): Promise<LideresLeaderboardResponse> => {
    const [members, personalRows, traineeRows] = await Promise.all([

      // ── 1. Miembros activos (con rol) ──────────────────────────────────────
      query<MemberRow>(`
        SELECT member_id, full_name, sales_role
        FROM dw_zoho.dim_sales_team_member
        WHERE (inactive IS NULL OR inactive = '' OR LOWER(inactive) = 'false')
          AND member_id IS NOT NULL
          AND email    IS NOT NULL
          AND ${ALLOWED_ROLES_SQL}
      `),

      // ── 2. Ventas personales por pipeline en la ventana de la competencia ───
      query<PipelineRow>(`
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
      `, [CLIDERES_START, CLIDERES_END]),

      // ── 3. Ventas de trainee (1ª–4ª) por pipeline → al mentor (sponsor_id) ──
      // Aquí la venta del trainee vale lo mismo que la personal y se pondera por
      // producto, por eso el desglose por pipeline (no un conteo plano).
      query<PipelineRow>(`
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
      `, [CLIDERES_START, CLIDERES_END]),

    ])

    const personalMap = toPipelineMap(personalRows)
    const traineeMap  = toPipelineMap(traineeRows)

    const rows: LideresLeaderboardRow[] = []
    for (const m of members) {
      // Solo líderes activos (Lider / Empleado - Lider).
      if (!isCLideresParticipant(normalizeRole(m.sales_role))) continue

      const personal = personalMap[m.member_id] ?? {}
      const trainee  = traineeMap[m.member_id]  ?? {}

      const personalPoints = weightedPoints(personal)
      const traineePoints  = weightedPoints(trainee)
      const points         = personalPoints + traineePoints

      // Conteo de VENTAS por producto (personales + trainee), para la tabla.
      const countOf = (p: string) => (personal[p] ?? 0) + (trainee[p] ?? 0)

      rows.push({
        zohoId:         m.member_id,
        name:           m.full_name,
        points,
        personalPoints,
        traineePoints,
        solar:          countOf('residential solar') + countOf('commercial solar'),
        roofing:        countOf('roofing'),
        water:          countOf('water products'),
        pps:            countOf('pps'),
        qualified:      points >= CLIDERES_MIN_POINTS,
      })
    }

    rows.sort((a, b) => b.points - a.points)

    return {
      rows,
      start:      CLIDERES_START,
      end:        CLIDERES_END,
      cutoff:     CLIDERES_CUTOFF,
      minPoints:  CLIDERES_MIN_POINTS,
      topN:       CLIDERES_TOP_N,
      prizes:     CLIDERES_PRIZES,
      computedAt: new Date().toISOString(),
    }
  },
  ['lideres-leaderboard'],
  { revalidate: 3600 },
)

export async function GET() {
  try {
    const data = await fetchLideresLeaderboard()
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json(
      { error: String(e), stack: e instanceof Error ? e.stack : undefined },
      { status: 500 },
    )
  }
}

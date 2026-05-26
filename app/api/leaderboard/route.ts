import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { query } from '@/lib/redshift'
import {
  CRUISE_START, CRUISE_END, CRUISE_TARGET,
  ASISTIDA_POINTS, GRADUATION_POINTS,
} from '@/lib/config'

export interface LeaderboardRow {
  zohoId:         string
  name:           string
  total:          number
  personal:       number
  paceStartDate:  string  // effective start for monthly-pace calculation
  breakdown: {
    solar:     number
    roofing:   number
    water:     number
    pps:       number
    asistida:  number
    consultor: number
    lider:     number
    gerente:   number
  }
}

export interface LeaderboardResponse {
  rows:         LeaderboardRow[]
  cruiseTarget: number
  cruiseEnd:    string
  computedAt:   string
}

interface MemberRow {
  member_id:            string
  full_name:            string
  sponsor_id:           string | null
  consultor_start_date: string | null
  lider_start_date:     string | null
  gerente_start_date:   string | null
}

interface PipelineRow {
  member_id: string
  pipeline:  string | null
  cnt:       string | number
}

interface AsistidaRow {
  mentor_id: string
  cnt:       string | number
}

function dateInCurrentYear(dateStr: string | null): boolean {
  if (!dateStr) return false
  const year = new Date().getFullYear()
  const d = dateStr.slice(0, 10)
  return d >= `${year}-01-01` && d <= `${year}-12-31`
}

const fetchLeaderboard = unstable_cache(
  async (): Promise<LeaderboardResponse> => {
    // Run all 3 queries in parallel — each is independent
    const [members, cruiseDealRows, asistidaDealRows] = await Promise.all([

      // ── 1. Active members ──────────────────────────────────────────────────
      query<MemberRow>(`
        SELECT member_id, full_name, sponsor_id,
          consultor_start_date, lider_start_date, gerente_start_date
        FROM dw_zoho.dim_sales_team_member
        WHERE (inactive IS NULL OR inactive = '' OR LOWER(inactive) = 'false')
          AND member_id IS NOT NULL
          AND email    IS NOT NULL
      `),

      // ── 2. Personal deals during cruise period by pipeline ─────────────────
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
          ON LOWER(stm.email) = LOWER(ds.sale_rep_email)
        WHERE fd.closing_date >= $1
          AND fd.closing_date <= $2
          AND fd.closing_date IS NOT NULL
          AND dsr.stage <> 'Cancelled'
          AND stm.member_id IS NOT NULL
        GROUP BY stm.member_id, LOWER(dp.pipeline)
      `, [CRUISE_START, CRUISE_END]),

      // ── 3. Asistida: trainee (1st–4th sale) per mentor ────────────────────
      query<AsistidaRow>(`
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
          AND dsr.stage <> 'Cancelled'
          AND ds.trainee_sales IN ('1st Sale', '2nd Sale', '3rd Sale', '4th Sale')
          AND stm_mentor.member_id IS NOT NULL
        GROUP BY stm_mentor.member_id
      `, [CRUISE_START, CRUISE_END]),

    ])

    // ── Build lookup maps ────────────────────────────────────────────────────
    const pipelineMap: Record<string, Record<string, number>> = {}
    for (const r of cruiseDealRows) {
      if (!r.member_id) continue
      const p = (r.pipeline ?? 'unknown').toLowerCase()
      if (!pipelineMap[r.member_id]) pipelineMap[r.member_id] = {}
      pipelineMap[r.member_id][p] = (pipelineMap[r.member_id][p] ?? 0) + Number(r.cnt)
    }

    const asistidaMap: Record<string, number> = {}
    for (const r of asistidaDealRows) {
      if (r.mentor_id) asistidaMap[r.mentor_id] = Number(r.cnt)
    }

    const directReportsOf: Record<string, MemberRow[]> = {}
    for (const m of members) {
      if (m.sponsor_id) {
        if (!directReportsOf[m.sponsor_id]) directReportsOf[m.sponsor_id] = []
        directReportsOf[m.sponsor_id].push(m)
      }
    }

    // ── Compute per-member cruise scores ─────────────────────────────────────
    const rows: LeaderboardRow[] = members.map(m => {
      const counts = pipelineMap[m.member_id] ?? {}

      const solar   = ((counts['residential solar'] ?? 0) + (counts['commercial solar'] ?? 0)) * 1
      const roofing = (counts['roofing']        ?? 0) * 1
      const water   = (counts['water products'] ?? 0) * 0.5
      const pps     = (counts['pps']            ?? 0) * 0.5
      const asistida = (asistidaMap[m.member_id] ?? 0) * ASISTIDA_POINTS

      let consultor = 0, lider = 0, gerente = 0
      for (const tm of directReportsOf[m.member_id] ?? []) {
        if (dateInCurrentYear(tm.consultor_start_date)) consultor += GRADUATION_POINTS.consultor
        if (dateInCurrentYear(tm.lider_start_date))     lider     += GRADUATION_POINTS.lider
        if (dateInCurrentYear(tm.gerente_start_date))   gerente   += GRADUATION_POINTS.gerente
      }

      const personal = solar + roofing + water + pps
      const total    = personal + asistida + consultor + lider + gerente

      // For 2026 joiners use their earliest role date; otherwise use competition start
      const roleDates = [m.consultor_start_date, m.lider_start_date, m.gerente_start_date]
        .filter((d): d is string => !!d)
        .map(d => d.slice(0, 10))
        .sort()
      const paceStartDate = roleDates.length > 0 && roleDates[0] > CRUISE_START
        ? roleDates[0]
        : CRUISE_START

      return { zohoId: m.member_id, name: m.full_name, total, personal, paceStartDate, breakdown: { solar, roofing, water, pps, asistida, consultor, lider, gerente } }
    })

    rows.sort((a, b) => b.total - a.total)

    return { rows, cruiseTarget: CRUISE_TARGET, cruiseEnd: CRUISE_END, computedAt: new Date().toISOString() }
  },
  ['cruise-leaderboard'],
  { revalidate: 3600 },
)

export async function GET() {
  try {
    const data = await fetchLeaderboard()
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json(
      { error: String(e), stack: e instanceof Error ? e.stack : undefined },
      { status: 500 },
    )
  }
}

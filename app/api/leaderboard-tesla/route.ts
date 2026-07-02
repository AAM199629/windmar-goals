import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { query } from '@/lib/redshift'
import {
  COMPTESLA_START, COMPTESLA_END, COMPTESLA_POINTS, COMPTESLA_MIN_VENTAS,
  normalizeRole,
} from '@/lib/config'

export type TeslaRole = 'consultor' | 'lider' | 'gerente'

export interface TeslaLeaderboardRow {
  zohoId:          string
  name:            string
  role:            TeslaRole
  points:          number
  ventas:          number
  bateriaConSolar: number
  bateriaSola:     number
  asistida:        number
}

export interface TeslaLeaderboardResponse {
  rows:       TeslaLeaderboardRow[]
  start:      string
  end:        string
  minVentas:  number
  computedAt: string
}

interface MemberRow {
  member_id:  string
  full_name:  string
  sales_role: string | null
}

interface TeslaCompRow {
  member_id:         string
  bateria_con_solar: string | number
  bateria_sola:      string | number
}

interface AsistidaRow {
  mentor_id: string
  cnt:       string | number
}

const fetchTeslaLeaderboard = unstable_cache(
  async (): Promise<TeslaLeaderboardResponse> => {
    // Run all 3 queries in parallel — each is independent
    const [members, teslaCompRows, teslaAsistidaRows] = await Promise.all([

      // ── 1. Active members (with role) ──────────────────────────────────────
      query<MemberRow>(`
        SELECT member_id, full_name, sales_role
        FROM dw_zoho.dim_sales_team_member
        WHERE (inactive IS NULL OR inactive = '' OR LOWER(inactive) = 'false')
          AND member_id IS NOT NULL
          AND email    IS NOT NULL
      `),

      // ── 2. Batería Tesla propia: con solar (1 pt) / sola (0.5 pt) ───────────
      // Batería Tesla = battery_qty > 0 AND battery_type contiene 'tesla'.
      // Con solar = system_size_kw1 > 0 · Sola = system_size_kw1 en 0/null.
      query<TeslaCompRow>(`
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
          AND dsr.stage <> 'Cancelled'
          AND stm.member_id IS NOT NULL
          AND COALESCE(fd.battery_qty, 0) > 0
          AND LOWER(fd.battery_type) LIKE '%tesla%'
        GROUP BY stm.member_id
      `, [COMPTESLA_START, COMPTESLA_END]),

      // ── 3. Asistidas Tesla (1ª–4ª venta Tesla de un trainee → mentor) ───────
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
          AND COALESCE(fd.battery_qty, 0) > 0
          AND LOWER(fd.battery_type) LIKE '%tesla%'
          AND stm_mentor.member_id IS NOT NULL
        GROUP BY stm_mentor.member_id
      `, [COMPTESLA_START, COMPTESLA_END]),

    ])

    // ── Build lookup maps ──────────────────────────────────────────────────────
    const compMap: Record<string, { bateriaConSolar: number; bateriaSola: number; asistida: number }> = {}
    for (const r of teslaCompRows) {
      if (!r.member_id) continue
      compMap[r.member_id] = {
        bateriaConSolar: Number(r.bateria_con_solar) || 0,
        bateriaSola:     Number(r.bateria_sola)      || 0,
        asistida:        0,
      }
    }
    for (const r of teslaAsistidaRows) {
      if (!r.mentor_id) continue
      const e = compMap[r.mentor_id] ?? { bateriaConSolar: 0, bateriaSola: 0, asistida: 0 }
      e.asistida = Number(r.cnt) || 0
      compMap[r.mentor_id] = e
    }

    // ── Compute per-member scores (trainees excluded) ──────────────────────────
    const rows: TeslaLeaderboardRow[] = []
    for (const m of members) {
      const role = normalizeRole(m.sales_role)
      if (role === 'trainee') continue

      const c = compMap[m.member_id] ?? { bateriaConSolar: 0, bateriaSola: 0, asistida: 0 }
      const points =
        c.bateriaConSolar * COMPTESLA_POINTS.bateriaConSolar +
        c.bateriaSola     * COMPTESLA_POINTS.bateriaSola +
        c.asistida        * COMPTESLA_POINTS.asistida
      const ventas = c.bateriaConSolar + c.bateriaSola

      rows.push({
        zohoId:          m.member_id,
        name:            m.full_name,
        role,
        points,
        ventas,
        bateriaConSolar: c.bateriaConSolar,
        bateriaSola:     c.bateriaSola,
        asistida:        c.asistida,
      })
    }

    rows.sort((a, b) => b.points - a.points)

    return {
      rows,
      start:      COMPTESLA_START,
      end:        COMPTESLA_END,
      minVentas:  COMPTESLA_MIN_VENTAS,
      computedAt: new Date().toISOString(),
    }
  },
  ['tesla-leaderboard'],
  { revalidate: 3600 },
)

export async function GET() {
  try {
    const data = await fetchTeslaLeaderboard()
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json(
      { error: String(e), stack: e instanceof Error ? e.stack : undefined },
      { status: 500 },
    )
  }
}

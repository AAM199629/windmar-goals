import {
  CRUISE_POINTS,
  GRADUATION_POINTS,
  TESLA_TARGET,
  TESLA_PIPELINES,
  CRUISE_TARGET,
  CRUISE_PERSONAL_TARGET,
  ASISTIDA_POINTS,
  monthlyTarget,
} from './config'

// ── Types from Redshift ────────────────────────────────────────────────────────

export interface RepMember {
  member_id:            string
  full_name:            string
  email:                string
  status:               string | null
  upline_level_1:       string | null
  upline_level_2:       string | null
  upline_level_3:       string | null
  upline_level_4:       string | null
  consultor_start_date: string | null
  lider_start_date:     string | null
  gerente_start_date:   string | null
}

// Map of pipeline → count for one member
export type PipelineCounts = Record<string, number>

// ── Output type ────────────────────────────────────────────────────────────────

export interface CruiseBreakdown {
  solar:     number
  roofing:   number
  water:     number
  pps:       number
  asistida:  number
  consultor: number
  lider:     number
  gerente:   number
}

export interface GoalsMetrics {
  zohoId:  string
  name:    string
  email:   string
  tesla: {
    current:  number
    target:   number
    personal: number
    team:     number
  }
  cruise: {
    total:          number
    personal:       number
    target:         number
    personalTarget: number
    breakdown:      CruiseBreakdown
  }
  monthly: {
    current: number
    target:  number
    month:   string
  }
  updatedAt: string
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function dateInRange(dateStr: string | null, start: string, end: string): boolean {
  if (!dateStr) return false
  const d = dateStr.slice(0, 10)
  return d >= start && d <= end
}

function sumPipelinesFor(counts: PipelineCounts, pipelines: string[]): number {
  return pipelines.reduce((acc, p) => acc + (counts[p] ?? 0), 0)
}

function calcCruisePts(counts: PipelineCounts): number {
  return Object.entries(CRUISE_POINTS).reduce(
    (acc, [pipeline, pts]) => acc + (counts[pipeline] ?? 0) * pts,
    0,
  )
}

function calcGraduationPts(
  member:      RepMember,
  cruiseStart: string,
  cruiseEnd:   string,
): { consultor: number; lider: number; gerente: number } {
  return {
    consultor: dateInRange(member.consultor_start_date, cruiseStart, cruiseEnd)
      ? GRADUATION_POINTS.consultor : 0,
    lider:     dateInRange(member.lider_start_date, cruiseStart, cruiseEnd)
      ? GRADUATION_POINTS.lider : 0,
    gerente:   dateInRange(member.gerente_start_date, cruiseStart, cruiseEnd)
      ? GRADUATION_POINTS.gerente : 0,
  }
}

// ── Main builder ───────────────────────────────────────────────────────────────

export function buildMetrics(params: {
  member:        RepMember
  teslaCounts:   PipelineCounts
  teamCounts:    PipelineCounts
  cruiseCounts:  PipelineCounts
  teamMembers:   RepMember[]
  // Count of trainee (1st–4th) sales assisted by this member as mentor
  asistidaCount: number
  monthlyCount:  number
  currentMonth:  string
  cruiseStart:   string
  cruiseEnd:     string
}): GoalsMetrics {
  const { member, teslaCounts, teamCounts, cruiseCounts, teamMembers,
    asistidaCount, monthlyCount, currentMonth, cruiseStart, cruiseEnd } = params

  // ── Tesla ──────────────────────────────────────────────────────────────────
  const teslaPersonal = sumPipelinesFor(teslaCounts, TESLA_PIPELINES)
  const teslaTeam     = sumPipelinesFor(teamCounts,  TESLA_PIPELINES)

  // ── Cruise personal points ──────────────────────────────────────────────────
  const cruisePtsPersonal = calcCruisePts(cruiseCounts)

  const cruiseBreakdown: CruiseBreakdown = {
    solar:    ((cruiseCounts['residential solar'] ?? 0) + (cruiseCounts['commercial solar'] ?? 0)) * 1,
    roofing:  (cruiseCounts['roofing']        ?? 0) * 1,
    water:    (cruiseCounts['water products'] ?? 0) * 0.5,
    pps:      (cruiseCounts['pps']            ?? 0) * 0.5,
    asistida: asistidaCount * ASISTIDA_POINTS,
    consultor: 0,
    lider:     0,
    gerente:   0,
  }

  // ── Cruise graduation points from team members ──────────────────────────────
  for (const tm of teamMembers) {
    const grad = calcGraduationPts(tm, cruiseStart, cruiseEnd)
    cruiseBreakdown.consultor += grad.consultor
    cruiseBreakdown.lider     += grad.lider
    cruiseBreakdown.gerente   += grad.gerente
  }

  const cruiseTotal = cruisePtsPersonal
    + cruiseBreakdown.asistida
    + cruiseBreakdown.consultor
    + cruiseBreakdown.lider
    + cruiseBreakdown.gerente

  return {
    zohoId: member.member_id,
    name:   member.full_name,
    email:  member.email,
    tesla: {
      current:  teslaPersonal + teslaTeam,
      target:   TESLA_TARGET,
      personal: teslaPersonal,
      team:     teslaTeam,
    },
    cruise: {
      total:          cruiseTotal,
      personal:       cruisePtsPersonal,
      target:         CRUISE_TARGET,
      personalTarget: CRUISE_PERSONAL_TARGET,
      breakdown:      cruiseBreakdown,
    },
    monthly: {
      current: monthlyCount,
      target:  monthlyTarget(currentMonth),
      month:   currentMonth,
    },
    updatedAt: new Date().toISOString(),
  }
}

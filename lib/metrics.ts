import {
  CRUISE_POINTS,
  GRADUATION_POINTS,
  TESLA_TARGET,
  TESLA_PIPELINES,
  CRUISE_TARGET,
  CRUISE_PERSONAL_TARGET,
  ASISTIDA_POINTS,
  monthlyTarget,
  normalizeRole,
  nextGradRole,
  plinkoTarget,
  ruletaTarget,
  GRAD_POINTS,
  GRAD_TARGET,
  PREMIO_PIPELINES,
  COMPTESLA_POINTS,
  COMPTESLA_START,
  COMPTESLA_END,
} from './config'

const TEAM_BUILDER_TARGET = 10

// ── Types from Redshift ────────────────────────────────────────────────────────

export interface RepMember {
  member_id:            string
  full_name:            string
  email:                string
  status:               string | null
  sales_role:           string | null
  sponsor_id:           string | null
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

// ── Output types ───────────────────────────────────────────────────────────────

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

export interface PlinkoMetrics {
  current:        number
  target:         number
  role:           string
  weekStart:      string
  weeklyPipelines: Record<string, number>
}

export interface RuletaMetrics {
  current:         number
  target:          number
  role:            string
  month:           string
  monthlyPipelines: Record<string, number>
}

export interface GraduacionMetrics {
  current:   number
  target:    number
  role:      string
  breakdown: Record<string, number>
  month:     string
}

export interface TeamBuilderMetrics {
  current:   number
  target:    number
  breakdown: { gerentes: number; liders: number }
}

export interface CompetenciaTeslaMetrics {
  points:          number   // número grande de la tarjeta
  ventas:          number   // total ventas Tesla (hacia el mínimo de 10)
  bateriaConSolar: number
  bateriaSola:     number
  asistida:        number
  start:           string
  end:             string
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
    current:   number
    target:    number
    month:     string
    breakdown: Record<string, number>
  }
  plinko:      PlinkoMetrics
  ruleta:      RuletaMetrics | null
  graduacion:  GraduacionMetrics
  teamBuilder: TeamBuilderMetrics | null
  competenciaTesla: CompetenciaTeslaMetrics | null
  updatedAt:   string
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
  member: RepMember,
): { consultor: number; lider: number; gerente: number } {
  const year     = new Date().getFullYear()
  const yearStart = `${year}-01-01`
  const yearEnd   = `${year}-12-31`
  return {
    consultor: dateInRange(member.consultor_start_date, yearStart, yearEnd)
      ? GRADUATION_POINTS.consultor : 0,
    lider:     dateInRange(member.lider_start_date, yearStart, yearEnd)
      ? GRADUATION_POINTS.lider : 0,
    gerente:   dateInRange(member.gerente_start_date, yearStart, yearEnd)
      ? GRADUATION_POINTS.gerente : 0,
  }
}

// ── Main builder ───────────────────────────────────────────────────────────────

export function buildMetrics(params: {
  member:             RepMember
  teslaCounts:        PipelineCounts
  teamCounts:         PipelineCounts
  cruiseCounts:       PipelineCounts
  teamMembers:        RepMember[]
  directLineMembers:  RepMember[]
  asistidaCount:      number
  monthlyCount:       number
  weeklyPipelines:    PipelineCounts
  monthlyPipelines:   PipelineCounts
  teslaCompCounts:    { bateriaConSolar: number; bateriaSola: number; asistida: number }
  currentMonth:       string
  weekStart:          string
  cruiseStart:        string
  cruiseEnd:          string
}): GoalsMetrics {
  const {
    member, teslaCounts, teamCounts, cruiseCounts, teamMembers, directLineMembers,
    asistidaCount, monthlyCount, weeklyPipelines, monthlyPipelines, teslaCompCounts,
    currentMonth, weekStart, cruiseStart, cruiseEnd,
  } = params

  const role = normalizeRole(member.sales_role)
  const mm   = Number(currentMonth.slice(5, 7))

  // ── Tesla ──────────────────────────────────────────────────────────────────
  const teslaPersonal = sumPipelinesFor(teslaCounts, TESLA_PIPELINES)
  const teslaTeam     = sumPipelinesFor(teamCounts,  TESLA_PIPELINES)

  // ── Cruise ─────────────────────────────────────────────────────────────────
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

  for (const tm of teamMembers) {
    const grad = calcGraduationPts(tm)
    cruiseBreakdown.consultor += grad.consultor
    cruiseBreakdown.lider     += grad.lider
    cruiseBreakdown.gerente   += grad.gerente
  }

  const cruiseTotal = cruisePtsPersonal
    + cruiseBreakdown.asistida
    + cruiseBreakdown.consultor
    + cruiseBreakdown.lider
    + cruiseBreakdown.gerente

  // ── Plinko ─────────────────────────────────────────────────────────────────
  const plinko: PlinkoMetrics = {
    current:         sumPipelinesFor(weeklyPipelines, PREMIO_PIPELINES),
    target:          plinkoTarget(member.sales_role),
    role,
    weekStart,
    weeklyPipelines,
  }

  // ── Ruleta ─────────────────────────────────────────────────────────────────
  const ruletaCurrent = sumPipelinesFor(monthlyPipelines, PREMIO_PIPELINES)
  const ruletaTgt     = ruletaTarget(member.sales_role, mm)
  const ruleta: RuletaMetrics | null = ruletaTgt !== null
    ? { current: ruletaCurrent, target: ruletaTgt, role, month: currentMonth, monthlyPipelines }
    : null

  // ── Graduación (progress toward NEXT level, not current) ──────────────────
  const targetRole = nextGradRole(role)  // trainee→consultor, consultor→lider, lider→gerente
  const gradPts = GRAD_POINTS[targetRole] ?? GRAD_POINTS.consultor
  const gradBreakdown: Record<string, number> = {}
  let gradTotal = 0
  for (const [pipeline, pts] of Object.entries(gradPts)) {
    const earned = (monthlyPipelines[pipeline] ?? 0) * pts
    gradBreakdown[pipeline] = earned
    gradTotal += earned
  }

  const graduacion: GraduacionMetrics = {
    current:   gradTotal,
    target:    GRAD_TARGET[targetRole] ?? 20,
    role:      targetRole,  // shows the level they're working toward
    breakdown: gradBreakdown,
    month:     currentMonth,
  }

  // ── Team Builder (gerentes only) ────────────────────────────────────────────
  let teamBuilder: TeamBuilderMetrics | null = null
  if (role === 'gerente') {
    let tbPts = 0; let gerenteCount = 0; let liderCount = 0
    for (const dm of directLineMembers) {
      const dmRole = normalizeRole(dm.sales_role)
      if (dmRole === 'gerente') { tbPts += 5; gerenteCount++ }
      else if (dmRole === 'lider') { tbPts += 2; liderCount++ }
    }
    teamBuilder = { current: tbPts, target: TEAM_BUILDER_TARGET, breakdown: { gerentes: gerenteCount, liders: liderCount } }
  }

  // ── Competencia Tesla ────────────────────────────────────────────────────────
  const competenciaTesla: CompetenciaTeslaMetrics = {
    bateriaConSolar: teslaCompCounts.bateriaConSolar,
    bateriaSola:     teslaCompCounts.bateriaSola,
    asistida:        teslaCompCounts.asistida,
    ventas:          teslaCompCounts.bateriaConSolar + teslaCompCounts.bateriaSola,
    points:
      teslaCompCounts.bateriaConSolar * COMPTESLA_POINTS.bateriaConSolar +
      teslaCompCounts.bateriaSola     * COMPTESLA_POINTS.bateriaSola +
      teslaCompCounts.asistida        * COMPTESLA_POINTS.asistida,
    start: COMPTESLA_START,
    end:   COMPTESLA_END,
  }

  // PPS/Anker = 0.5 per sale; all other pipelines = 1
  const weightedMonthly = Object.entries(monthlyPipelines).reduce(
    (acc, [p, cnt]) => acc + cnt * (p === 'pps' ? 0.5 : 1),
    0,
  )

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
      current:   weightedMonthly,
      target:    monthlyTarget(currentMonth),
      month:     currentMonth,
      breakdown: monthlyPipelines,
    },
    plinko,
    ruleta,
    graduacion,
    teamBuilder,
    competenciaTesla,
    updatedAt: new Date().toISOString(),
  }
}

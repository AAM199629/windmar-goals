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
  PLINKO_POINTS,
  COMPTESLA_POINTS,
  COMPTESLA_START,
  COMPTESLA_END,
  isComptesaParticipant,
  GERENTEA_START,
  GERENTEA_END,
  GERENTEA_PRIMARY,
  GERENTEA_DEV_POINTS,
  GERENTEA_DEV_TARGET,
  GERENTEA_SALES_POINTS,
  GERENTEA_ASISTIDA_POINTS,
  GERENTEA_SALES_TARGET,
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
  ventas:          number   // total deals Tesla (hacia el mínimo de 10) — por venta, no por batería
  bateriaConSolar: number   // cantidad de baterías Tesla con solar (suma de battery_qty)
  bateriaSola:     number   // cantidad de baterías Tesla solas (suma de battery_qty)
  asistida:        number   // deals asistidos (1ª–4ª venta de un trainee) — por venta
  start:           string
  end:             string
}

export interface GerenteAccionistaMetrics {
  primary: {
    gerentes:       number
    lideres:        number
    consultores:    number
    target:         { gerentes: number; lideres: number; consultores: number }
    metasCumplidas: number   // 0–3 (cuántas de las 3 cuotas cumplidas) → número grande / barra
    done:           boolean   // 2·4·6 completo
  }
  dev: { points: number; target: number; done: boolean }
  sales: {
    points:    number
    target:    number
    done:      boolean
    breakdown: { solar: number; roofing: number; water: number; pps: number; asistida: number }
  }
  secondaryDone: boolean      // dev.done && sales.done
  start: string
  end:   string
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
  gerenteAccionista: GerenteAccionistaMetrics | null
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

// Suma ponderada: cada pipeline aporta (conteo × puntos). Usado por Plinko,
// donde Solar + Roofing valen 1 pto y Anker + Water valen ½ pto.
function sumWeightedPipelines(counts: PipelineCounts, weights: Record<string, number>): number {
  return Object.entries(weights).reduce((acc, [p, w]) => acc + (counts[p] ?? 0) * w, 0)
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
  teslaCompCounts:    { bateriaConSolar: number; bateriaSola: number; asistida: number; ventas: number }
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
    current:         sumWeightedPipelines(weeklyPipelines, PLINKO_POINTS),
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
  // Solo participan los líderes/gerentes del allow-list + todos los consultores.
  // Un no-participante recibe `null`: sin tarjeta ni desglose en su página, y
  // excluido del ranking (el sync solo hace push si competenciaTesla != null).
  const competenciaTesla: CompetenciaTeslaMetrics | null =
    isComptesaParticipant(member.member_id, role)
      ? {
          bateriaConSolar: teslaCompCounts.bateriaConSolar,
          bateriaSola:     teslaCompCounts.bateriaSola,
          asistida:        teslaCompCounts.asistida,
          // Ventas hacia el mínimo /10: por deal Tesla, NO por cantidad de baterías.
          ventas:          teslaCompCounts.ventas,
          points:
            teslaCompCounts.bateriaConSolar * COMPTESLA_POINTS.bateriaConSolar +
            teslaCompCounts.bateriaSola     * COMPTESLA_POINTS.bateriaSola +
            teslaCompCounts.asistida        * COMPTESLA_POINTS.asistida,
          start: COMPTESLA_START,
          end:   COMPTESLA_END,
        }
      : null

  // ── Gerente Accionista (solo gerentes: Gerente / Empleado - Gerente / Gerente Accionista) ──
  let gerenteAccionista: GerenteAccionistaMetrics | null = null
  if (role === 'gerente') {
    let gerentes = 0; let lideres = 0; let consultores = 0; let devPoints = 0
    for (const dm of directLineMembers) {
      if (dateInRange(dm.gerente_start_date, GERENTEA_START, GERENTEA_END)) {
        gerentes++; devPoints += GERENTEA_DEV_POINTS.gerente
      }
      if (dateInRange(dm.lider_start_date, GERENTEA_START, GERENTEA_END)) {
        lideres++; devPoints += GERENTEA_DEV_POINTS.lider
      }
      if (dateInRange(dm.consultor_start_date, GERENTEA_START, GERENTEA_END)) {
        consultores++; devPoints += GERENTEA_DEV_POINTS.consultor
      }
    }

    const salesBreakdown = {
      solar:    ((cruiseCounts['residential solar'] ?? 0) + (cruiseCounts['commercial solar'] ?? 0)) * GERENTEA_SALES_POINTS['residential solar'],
      roofing:  (cruiseCounts['roofing']        ?? 0) * GERENTEA_SALES_POINTS['roofing'],
      water:    (cruiseCounts['water products'] ?? 0) * GERENTEA_SALES_POINTS['water products'],
      pps:      (cruiseCounts['pps']            ?? 0) * GERENTEA_SALES_POINTS['pps'],
      asistida: asistidaCount * GERENTEA_ASISTIDA_POINTS,
    }
    const salesPoints = salesBreakdown.solar + salesBreakdown.roofing
      + salesBreakdown.water + salesBreakdown.pps + salesBreakdown.asistida

    const metasCumplidas =
      (gerentes    >= GERENTEA_PRIMARY.gerentes    ? 1 : 0) +
      (lideres     >= GERENTEA_PRIMARY.lideres     ? 1 : 0) +
      (consultores >= GERENTEA_PRIMARY.consultores ? 1 : 0)
    const primaryDone = metasCumplidas === 3
    const devDone     = devPoints  >= GERENTEA_DEV_TARGET
    const salesDone   = salesPoints >= GERENTEA_SALES_TARGET

    gerenteAccionista = {
      primary: {
        gerentes, lideres, consultores,
        target:         { ...GERENTEA_PRIMARY },
        metasCumplidas,
        done:           primaryDone,
      },
      dev:   { points: devPoints, target: GERENTEA_DEV_TARGET, done: devDone },
      sales: { points: salesPoints, target: GERENTEA_SALES_TARGET, done: salesDone, breakdown: salesBreakdown },
      secondaryDone: devDone && salesDone,
      start: GERENTEA_START,
      end:   GERENTEA_END,
    }
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
    gerenteAccionista,
    updatedAt: new Date().toISOString(),
  }
}

import GoalCard from '@/components/GoalCard'
import { getMetrics } from '@/lib/kv'
import { GRAD_POINTS } from '@/lib/config'

// ── Rules text generators (server-side, role-aware) ───────────────────────────

function plinkoRules(role: string, target: number, weekStart: string): string {
  const season = (() => {
    const mm = new Date().getMonth() + 1
    return mm >= 4 && mm <= 9 ? 'Abr–Sep (temporada alta)' : 'Oct–Mar (temporada baja)'
  })()
  return `META SEMANAL (lunes–domingo)
Semana desde: ${weekStart}
Temporada: ${season}

Productos elegibles:
  • Solar (con o sin batería)
  • Roofing

Tu meta (${role}): ${target} ventas`
}

function ruletaRules(role: string, target: number): string {
  const season = (() => {
    const mm = new Date().getMonth() + 1
    return mm >= 4 && mm <= 9 ? 'Abr–Sep (temporada alta)' : 'Oct–Mar (temporada baja)'
  })()
  return `META MENSUAL
Temporada: ${season}

Productos elegibles:
  • Solar (con o sin batería)
  • Roofing

Tu meta (${role}): ${target} ventas`
}

function graduacionRules(role: string, target: number): string {
  const pts = GRAD_POINTS[role] ?? GRAD_POINTS.trainee
  return `META MENSUAL: ${target} puntos

Puntos por venta (${role}):
  • Solar/Batería: ${pts['residential solar']} pt
  • Roofing: ${pts['roofing']} pt
  • PPS/Anchor: ${pts['pps']} pt
  • Agua: ${pts['water products']} pt`
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ zohoId: string }>
}) {
  const { zohoId } = await params
  const metrics    = await getMetrics(zohoId)

  if (!metrics) {
    return (
      <main className="not-found">
        <div className="not-found-box">
          <h1>Dashboard no disponible</h1>
          <p>No se encontraron datos para este vendedor.<br />
            Pide al administrador que corra el sync.</p>
        </div>
      </main>
    )
  }

  const { tesla, cruise, monthly, plinko, ruleta, graduacion } = metrics

  const cruiseSublabel = (
    cruise.breakdown.consultor + cruise.breakdown.lider + cruise.breakdown.gerente
  ) > 0
    ? `${(cruise.breakdown.consultor + cruise.breakdown.lider + cruise.breakdown.gerente).toFixed(1)} pts grad.`
    : undefined

  return (
    <main className="dashboard">
      {/* Header */}
      <header className="dashboard-header">
        <img src="/windmar-logo-rev.png" alt="Windmar" className="header-logo" />
        <div className="header-divider" />
        <div className="header-meta">
          <span className="header-label-top">Metas de Ventas</span>
          <span className="header-name">{metrics.name}</span>
        </div>
      </header>

      {/* Cards grid — main goals */}
      <div className="section-eyebrow">01 — Progreso de Metas</div>
      <section className="cards-grid">
        <GoalCard
          title="TESLA MODEL Y"
          current={tesla.current}
          target={tesla.target}
          label={`Tesla ${tesla.target}`}
          bgImage="/Tesla2.jpeg"
          bgPosition="center top"
          bgSize="contain"
          progressIcon="🚗"
        />

        <GoalCard
          title="CRUISE COMPETITION"
          current={cruise.total}
          target={cruise.target}
          label={`${cruise.target} pts`}
          sublabel={cruiseSublabel}
          bgImage="/Crucero2.jpeg"
          bgPosition="center top"
          bgSize="contain"
          unit="pts"
          progressIcon="🚢"
        />

        <GoalCard
          title="MONTHLY TOTAL SALES"
          current={monthly.current}
          target={monthly.target}
          label={String(monthly.target)}
          bgImage="/Solar.jpeg"
          bgPosition="center top"
          bgSize="contain"
          progressIcon="☀️"
        />
      </section>

      {/* Detail section */}
      <div className="section-eyebrow">02 — Desglose</div>
      <section className="detail-section">
        <div className="detail-card">
          <h3>Tesla — Desglose</h3>
          <dl>
            <dt>Personales</dt><dd>{tesla.personal}</dd>
            <dt>Equipo (hasta 4 líneas)</dt><dd>{tesla.team}</dd>
            <dt>Total</dt><dd className="highlight">{tesla.current} / {tesla.target}</dd>
          </dl>
        </div>

        <div className="detail-card">
          <h3>Crucero — Puntos</h3>
          <dl>
            <dt>Solar</dt><dd>{cruise.breakdown.solar.toFixed(1)}</dd>
            <dt>Roofing</dt><dd>{cruise.breakdown.roofing.toFixed(1)}</dd>
            <dt>Anchor (PPS)</dt><dd>{cruise.breakdown.pps.toFixed(1)}</dd>
            <dt>Agua</dt><dd>{cruise.breakdown.water.toFixed(1)}</dd>
            <dt>Asistidas</dt><dd>{cruise.breakdown.asistida.toFixed(1)}</dd>
            <dt>Grad. Consultor</dt><dd>{cruise.breakdown.consultor.toFixed(1)}</dd>
            <dt>Grad. Líder</dt><dd>{cruise.breakdown.lider.toFixed(1)}</dd>
            <dt>Grad. Gerente</dt><dd>{cruise.breakdown.gerente.toFixed(1)}</dd>
            <dt>Pts personales</dt><dd>{cruise.personal.toFixed(1)} / {cruise.personalTarget}</dd>
            <dt>Total</dt><dd className="highlight">{cruise.total.toFixed(1)} / {cruise.target}</dd>
          </dl>
        </div>

        <div className="detail-card">
          <h3>Meta Mensual</h3>
          <dl>
            <dt>Mes</dt><dd>{monthly.month}</dd>
            <dt>Ventas</dt><dd className="highlight">{monthly.current} / {monthly.target}</dd>
          </dl>
        </div>
      </section>

      {/* Premiaciones */}
      <div className="section-eyebrow">03 — Premiaciones</div>
      <section className="cards-grid">
        <GoalCard
          title="PLINKO"
          current={plinko.current}
          target={plinko.target}
          label={`Meta: ${plinko.target} ventas`}
          sublabel={`Semana del ${plinko.weekStart}`}
          bgImage="/Plinko.jpeg"
          bgPosition="center center"
          bgSize="cover"
          progressIcon="🎯"
          rules={plinkoRules(plinko.role, plinko.target, plinko.weekStart)}
        />

        {ruleta && (
          <GoalCard
            title="RULETA WINDMAR"
            current={ruleta.current}
            target={ruleta.target}
            label={`Meta: ${ruleta.target} ventas`}
            sublabel={ruleta.month}
            bgImage="/Ruleta.jpeg"
            bgPosition="center center"
            bgSize="cover"
            progressIcon="🎡"
            rules={ruletaRules(ruleta.role, ruleta.target)}
          />
        )}

        <GoalCard
          title={`GRADUACIÓN`}
          current={Number(graduacion.current.toFixed(1))}
          target={graduacion.target}
          label={`${graduacion.target} pts`}
          sublabel={`${graduacion.role.charAt(0).toUpperCase() + graduacion.role.slice(1)} — ${graduacion.month}`}
          bgImage="/Graduacion.jpeg"
          bgPosition="center center"
          bgSize="cover"
          unit="pts"
          progressIcon="🎓"
          rules={graduacionRules(graduacion.role, graduacion.target)}
        />
      </section>

      {/* Graduation detail */}
      <div className="section-eyebrow">04 — Desglose Premiaciones</div>
      <section className="detail-section">
        <div className="detail-card">
          <h3>Plinko — Semana</h3>
          <dl>
            <dt>Solar</dt>
            <dd>{(plinko as any).weeklyPipelines?.['residential solar'] ?? '—'}</dd>
            <dt>Roofing</dt>
            <dd>{(plinko as any).weeklyPipelines?.['roofing'] ?? '—'}</dd>
            <dt>Semana</dt><dd>{plinko.weekStart}</dd>
            <dt>Total elegibles</dt>
            <dd className="highlight">{plinko.current} / {plinko.target}</dd>
          </dl>
        </div>

        {ruleta && (
          <div className="detail-card">
            <h3>Ruleta — Mes</h3>
            <dl>
              <dt>Mes</dt><dd>{ruleta.month}</dd>
              <dt>Total elegibles</dt>
              <dd className="highlight">{ruleta.current} / {ruleta.target}</dd>
            </dl>
          </div>
        )}

        <div className="detail-card">
          <h3>Graduación — {graduacion.role}</h3>
          <dl>
            <dt>Solar</dt>
            <dd>{((graduacion.breakdown['residential solar'] ?? 0) + (graduacion.breakdown['commercial solar'] ?? 0)).toFixed(1)} pts</dd>
            <dt>Roofing</dt>
            <dd>{(graduacion.breakdown['roofing'] ?? 0).toFixed(1)} pts</dd>
            <dt>PPS/Anchor</dt>
            <dd>{(graduacion.breakdown['pps'] ?? 0).toFixed(1)} pts</dd>
            <dt>Agua</dt>
            <dd>{(graduacion.breakdown['water products'] ?? 0).toFixed(1)} pts</dd>
            <dt>Total</dt>
            <dd className="highlight">{graduacion.current.toFixed(1)} / {graduacion.target}</dd>
          </dl>
        </div>
      </section>

      <footer className="dashboard-footer">
        Actualizado: {new Date(metrics.updatedAt).toLocaleString('es-PR', { timeZone: 'America/Puerto_Rico' })}
      </footer>
    </main>
  )
}

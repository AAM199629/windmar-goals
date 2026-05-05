import GoalCard from '@/components/GoalCard'
import { getMetrics } from '@/lib/kv'

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

  const { tesla, cruise, monthly } = metrics

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

      {/* Cards grid */}
      <div className="section-eyebrow">01 — Progreso de Metas</div>
      <section className="cards-grid">
        <GoalCard
          title="TESLA MODEL Y"
          current={tesla.current}
          target={tesla.target}
          label={`Tesla ${tesla.target}`}
          bgImage="/images/tesla.png"
          bgPosition="center 20%"
          bgSize="auto 52%"
          progressIcon="🚗"
        />

        <GoalCard
          title="CRUISE COMPETITION"
          current={cruise.total}
          target={cruise.target}
          label={`${cruise.target} pts`}
          sublabel={cruiseSublabel}
          bgImage="/images/cruise.png"
          bgPosition="center 15%"
          bgSize="auto 52%"
          unit="pts"
          progressIcon="🚢"
        />

        <GoalCard
          title="MONTHLY TOTAL SALES"
          current={monthly.current}
          target={monthly.target}
          label={String(monthly.target)}
          bgImage="/images/solar.png"
          bgPosition="center center"
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

      <footer className="dashboard-footer">
        Actualizado: {new Date(metrics.updatedAt).toLocaleString('es-PR', { timeZone: 'America/Puerto_Rico' })}
      </footer>
    </main>
  )
}

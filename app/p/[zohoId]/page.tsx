import GoalCard from '@/components/GoalCard'
import { getMetrics } from '@/lib/kv'
import { GRAD_POINTS } from '@/lib/config'

// ── Rules text generators (server-side, role-aware) ───────────────────────────

function plinkoRules(role: string, target: number, weekStart: string): string {
  return `META SEMANAL (lunes–domingo)
Semana desde: ${weekStart}

Productos elegibles:
  • Solar (con o sin batería)
  • Roofing

Tu meta (${role}): ${target} ventas semanales

⚠️ La lista final y oficial del Plinko se
enviará en los respectivos chats.`
}

function ruletaRules(role: string, target: number): string {
  return `META MENSUAL

Productos elegibles:
  • Solar (con o sin batería)
  • Roofing

Tu meta (${role}): ${target} ventas

⚠️ La lista oficial y final se publicará
en los respectivos chats.
Dudas: comunícate con la Office Manager
o Asistente Administrativa.`
}

function graduacionRules(role: string, target: number): string {
  const pts = GRAD_POINTS[role] ?? GRAD_POINTS.trainee
  return `META MENSUAL: ${target} puntos

Puntos por venta (${role}):
  • Solar/Batería: ${pts['residential solar']} pt
  • Roofing: ${pts['roofing']} pt
  • PPS/Anker: ${pts['pps']} pt
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

  const { tesla, cruise, monthly, teamBuilder } = metrics
  const plinko     = metrics.plinko
  const ruleta     = metrics.ruleta
  const graduacion = metrics.graduacion

  // Guard: old KV records may be missing new fields entirely
  if (!plinko || !graduacion) {
    return (
      <main className="not-found">
        <div className="not-found-box">
          <h1>Datos desactualizados</h1>
          <p>El perfil de {metrics.name} necesita actualizarse.<br />
            Pide al administrador que corra el sync.</p>
        </div>
      </main>
    )
  }

  const cbd = cruise.breakdown ?? {} as any
  const cruiseSublabel = (
    (cbd.consultor ?? 0) + (cbd.lider ?? 0) + (cbd.gerente ?? 0)
  ) > 0
    ? `${((cbd.consultor ?? 0) + (cbd.lider ?? 0) + (cbd.gerente ?? 0)).toFixed(1)} pts grad.`
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
            <dt>Solar</dt><dd>{(cbd.solar ?? 0).toFixed(1)}</dd>
            <dt>Roofing</dt><dd>{(cbd.roofing ?? 0).toFixed(1)}</dd>
            <dt>Anker (PPS)</dt><dd>{(cbd.pps ?? 0).toFixed(1)}</dd>
            <dt>Agua</dt><dd>{(cbd.water ?? 0).toFixed(1)}</dd>
            <dt>Asistidas</dt><dd>{(cbd.asistida ?? 0).toFixed(1)}</dd>
            <dt>Grad. Consultor</dt><dd>{(cbd.consultor ?? 0).toFixed(1)}</dd>
            <dt>Grad. Líder</dt><dd>{(cbd.lider ?? 0).toFixed(1)}</dd>
            <dt>Grad. Gerente</dt><dd>{(cbd.gerente ?? 0).toFixed(1)}</dd>
            <dt>Pts personales</dt><dd>{cruise.personal.toFixed(1)} / {cruise.personalTarget}</dd>
            <dt>Total</dt><dd className="highlight">{cruise.total.toFixed(1)} / {cruise.target}</dd>
          </dl>
        </div>

        <div className="detail-card">
          <h3>Meta Mensual</h3>
          {(() => {
            const bd: Record<string, number> = (monthly as any).breakdown ?? {}
            return (
              <dl>
                <dt>Mes</dt><dd>{monthly.month}</dd>
                <dt>Solar</dt>
                <dd>{(bd['residential solar'] ?? 0) + (bd['commercial solar'] ?? 0)}</dd>
                <dt>Roofing</dt>
                <dd>{bd['roofing'] ?? 0}</dd>
                <dt>PPS/Anker</dt>
                <dd>{bd['pps'] ?? 0}</dd>
                <dt>Agua</dt>
                <dd>{bd['water products'] ?? 0}</dd>
                <dt>Total</dt><dd className="highlight">{monthly.current} / {monthly.target}</dd>
              </dl>
            )
          })()}
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
            bgImage="/Ruleta.png"
            bgPosition="center center"
            bgSize="cover"
            progressIcon="🎡"
            rules={ruletaRules(ruleta.role, ruleta.target)}
          />
        )}

        {!teamBuilder && (
          <GoalCard
            title="GRADUACIÓN"
            current={Number(graduacion.current.toFixed(1))}
            target={graduacion.target}
            label={`${graduacion.target} pts`}
            sublabel={`${graduacion.role.charAt(0).toUpperCase() + graduacion.role.slice(1)} — ${graduacion.month}`}
            bgImage="/bierrete.png"
            bgPosition="center center"
            bgSize="cover"
            unit="pts"
            progressIcon="🎓"
            rules={graduacionRules(graduacion.role, graduacion.target)}
          />
        )}

        {teamBuilder && (
          <GoalCard
            title="TEAM BUILDER"
            current={teamBuilder.current}
            target={teamBuilder.target}
            label="10 pts"
            sublabel={`${teamBuilder.breakdown.gerentes} Ger · ${teamBuilder.breakdown.liders} Líd en línea directa`}
            gradient="linear-gradient(155deg, #1A237E 0%, #283593 55%, #3949AB 100%)"
            unit="pts"
            progressIcon="🏆"
            rules={`META: 10 pts (línea directa)

Puntos por miembro activo:
  • Gerente: 5 pts c/u
  • Líder:   2 pts c/u

Solo cuenta tu línea directa (1er nivel).

Tu progreso:
  ${teamBuilder.breakdown.gerentes} gerentes × 5 = ${teamBuilder.breakdown.gerentes * 5} pts
  ${teamBuilder.breakdown.liders} líderes  × 2 = ${teamBuilder.breakdown.liders * 2} pts`}
          />
        )}
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

        {!teamBuilder && (
          <div className="detail-card">
            <h3>Graduación — {graduacion.role}</h3>
            {(() => {
              const gb: Record<string, number> = (graduacion as any).breakdown ?? {}
              return (
                <dl>
                  <dt>Solar</dt>
                  <dd>{((gb['residential solar'] ?? 0) + (gb['commercial solar'] ?? 0)).toFixed(1)} pts</dd>
                  <dt>Roofing</dt>
                  <dd>{(gb['roofing'] ?? 0).toFixed(1)} pts</dd>
                  <dt>PPS/Anker</dt>
                  <dd>{(gb['pps'] ?? 0).toFixed(1)} pts</dd>
                  <dt>Agua</dt>
                  <dd>{(gb['water products'] ?? 0).toFixed(1)} pts</dd>
                  <dt>Total</dt>
                  <dd className="highlight">{graduacion.current.toFixed(1)} / {graduacion.target}</dd>
                </dl>
              )
            })()}
          </div>
        )}

        {teamBuilder && (
          <div className="detail-card">
            <h3>Team Builder</h3>
            <dl>
              <dt>Gerentes en línea directa</dt>
              <dd>{teamBuilder.breakdown.gerentes} × 5 pts = {teamBuilder.breakdown.gerentes * 5} pts</dd>
              <dt>Líderes en línea directa</dt>
              <dd>{teamBuilder.breakdown.liders} × 2 pts = {teamBuilder.breakdown.liders * 2} pts</dd>
              <dt>Total</dt>
              <dd className="highlight">{teamBuilder.current} / {teamBuilder.target} pts</dd>
            </dl>
          </div>
        )}
      </section>

      <footer className="dashboard-footer">
        Actualizado: {new Date(metrics.updatedAt).toLocaleString('es-PR', { timeZone: 'America/Puerto_Rico' })}
      </footer>
    </main>
  )
}

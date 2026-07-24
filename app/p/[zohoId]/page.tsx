import GoalCard from '@/components/GoalCard'
import PromotorDashboardClient from '@/components/PromotorDashboardClient'
import { getMetrics, getComptesaRankings, getGerenteAccionistaRankings } from '@/lib/kv'
import { query } from '@/lib/redshift'
import { GRAD_POINTS, COMPTESLA_MIN_VENTAS, GERENTEA_PRIMARY, GERENTEA_DEV_TARGET, GERENTEA_SALES_TARGET, isPromotor } from '@/lib/config'

// ── Rules text generators (server-side, role-aware) ───────────────────────────

function plinkoRules(role: string, target: number, weekStart: string): string {
  return `META SEMANAL (lunes–domingo)
Semana desde: ${weekStart}

Productos elegibles:
  • Solar (con o sin batería) — 1 pto
  • Roofing — 1 pto
  • Anker (PPS) — ½ pto
  • Water — ½ pto

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

function competenciaTeslaRules(): string {
  return `01 julio – 15 octubre 2026
(corte final: +6 días)

Criterio: cantidad de Tesla que vendas.

Sistema de puntos:
  • Batería con solar: 1 pt
  • Batería sola: 0.5 pt
  • Venta asistida: 0.5 pt
    (primeras 4 ventas de un trainee,
     solo productos con Tesla)

Ganadores: top 10 consultores,
10 líderes y 10 gerentes.

Requisitos:
  • 10 ventas mínimo en el periodo
  • Mínimo 1 venta al mes
    (si un mes queda en cero → descalificado)`
}

function gerenteAccionistaRules(): string {
  return `AÑO 2026 · máximo 2 ganadores
(promociones ≤ 31 dic 2026)

FORMATO PRIMARIO (2·4·6)
Graduar en tu línea directa:
  • ${GERENTEA_PRIMARY.gerentes} gerentes
  • ${GERENTEA_PRIMARY.lideres} líderes
  • ${GERENTEA_PRIMARY.consultores} consultores

FORMATO SECUNDARIO
  • ${GERENTEA_DEV_TARGET}+ pts de desarrollo, Y
  • ${GERENTEA_SALES_TARGET}+ ventas personales (ponderadas)

Pts de desarrollo (por promoción 1ª línea):
  • Gerente: 5 · Líder: 2 · Consultor: 0.5

Pts por venta personal:
  • Solar/Roofing: 1 · Water/Anker: 0.5
  • Venta asistida: 1
    (1ª–4ª venta de un trainee)

SELECCIÓN
Solo 2 personas. El Primario tiene prioridad
sobre el Secundario. Solo cuentan promociones
de 1ª línea; transferidos no aplican.`
}

function rankBadge(rank: number): string {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return String(rank)
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
    // Los promotores no se sincronizan a KV: detectarlos por rol y mostrar su
    // dashboard propio (leads / citas) en vez del de vendedor.
    const rows = await query<{ full_name: string; sales_role: string | null }>(
      `SELECT full_name, sales_role FROM dw_zoho.dim_sales_team_member WHERE member_id = $1`,
      [zohoId],
    )
    if (rows.length > 0 && isPromotor(rows[0].sales_role)) {
      return <PromotorDashboardClient zohoId={zohoId} name={rows[0].full_name} />
    }

    return (
      <main className="not-found">
        <div className="not-found-box">
          <h1>Dashboard no disponible</h1>
          <p>No se encontraron datos para este perfil.<br />
            Puedes buscar otro vendedor en el directorio.</p>
          <a href="/search" className="search-btn">
            🔍 Buscar vendedor
          </a>
        </div>
      </main>
    )
  }

  const { tesla, cruise, monthly, teamBuilder } = metrics
  const plinko     = metrics.plinko
  const ruleta     = metrics.ruleta
  const graduacion = metrics.graduacion
  const competenciaTesla = metrics.competenciaTesla
  const gerenteAccionista = metrics.gerenteAccionista

  // Top 10 por rol para la Competencia Tesla (idéntico para todos los del mismo rol)
  const myRole   = plinko?.role ?? 'trainee'
  const rankings = competenciaTesla ? await getComptesaRankings() : null
  const compTop  = rankings?.[myRole] ?? []

  // Ranking de gerentes para la tarjeta Gerente Accionista
  const gaRanking = gerenteAccionista ? (await getGerenteAccionistaRankings() ?? []) : []

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
          current={cruise.total ?? 0}
          target={cruise.target}
          label={`${cruise.target} pts`}
          sublabel={cruiseSublabel}
          bgImage="/Crucero2.jpeg"
          bgPosition="center top"
          bgSize="contain"
          unit="pts"
          progressIcon="🚢"
        />

        {competenciaTesla && (
          <GoalCard
            title="COMPETENCIA TESLA"
            current={Number(competenciaTesla.points.toFixed(1))}
            target={1}
            noBar
            label="01 jul – 15 oct 2026"
            sublabel={`${competenciaTesla.ventas} / ${COMPTESLA_MIN_VENTAS} ventas`}
            bgImage="/fabrica_tesla.png"
            bgPosition="center center"
            bgSize="cover"
            unit="pts"
            progressIcon="⚡"
            rules={competenciaTeslaRules()}
          />
        )}

        {gerenteAccionista && (
          <GoalCard
            title="GERENTE ACCIONISTA"
            current={gerenteAccionista.primary.metasCumplidas}
            target={3}
            label="Formato Primario 2·4·6"
            sublabel={`Ger ${gerenteAccionista.primary.gerentes}/${gerenteAccionista.primary.target.gerentes} · Líd ${gerenteAccionista.primary.lideres}/${gerenteAccionista.primary.target.lideres} · Cons ${gerenteAccionista.primary.consultores}/${gerenteAccionista.primary.target.consultores}`}
            gradient="linear-gradient(155deg, #1a1408 0%, #3a2c10 45%, #8a6a1e 100%)"
            progressIcon="👔"
            rules={gerenteAccionistaRules()}
          />
        )}

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
            <dt>Pts personales</dt><dd>{(cruise.personal ?? 0).toFixed(1)} / {cruise.personalTarget ?? '—'}</dd>
            <dt>Total</dt><dd className="highlight">{(cruise.total ?? 0).toFixed(1)} / {cruise.target}</dd>
          </dl>
        </div>

        {competenciaTesla && (
          <div className="detail-card">
            <h3>Competencia Tesla — Desglose</h3>
            <dl>
              <dt>Batería con solar</dt><dd>{competenciaTesla.bateriaConSolar} <span style={{ color: 'var(--gray)' }}>(×1)</span></dd>
              <dt>Batería sola</dt><dd>{competenciaTesla.bateriaSola} <span style={{ color: 'var(--gray)' }}>(×0.5)</span></dd>
              <dt>Asistidas Tesla</dt><dd>{competenciaTesla.asistida} <span style={{ color: 'var(--gray)' }}>(×0.5)</span></dd>
              <dt>Total puntos</dt><dd className="highlight">{competenciaTesla.points.toFixed(1)} pts</dd>
            </dl>

            {/* Top 10 por rol */}
            <div style={{ marginTop: '1rem', borderTop: '1px solid #edf0f8', paddingTop: '0.85rem' }}>
              <div style={{
                fontFamily: 'var(--font-cond)', fontWeight: 800, fontSize: '0.62rem',
                letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--orange)',
                marginBottom: '0.6rem',
              }}>
                Top 10 — {myRole.charAt(0).toUpperCase() + myRole.slice(1)}
              </div>

              {myRole === 'trainee' ? (
                <p style={{ fontFamily: 'var(--font-cond)', fontSize: '0.8rem', color: 'var(--gray)', margin: 0 }}>
                  Los trainees no participan en el ranking de esta competencia.
                </p>
              ) : compTop.length === 0 ? (
                <p style={{ fontFamily: 'var(--font-cond)', fontSize: '0.8rem', color: 'var(--gray)', margin: 0 }}>
                  Ranking disponible al iniciar la competencia.
                </p>
              ) : (
                <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  {compTop.map((r, i) => {
                    const isMe = r.zohoId === metrics.zohoId
                    return (
                      <li key={r.zohoId} style={{
                        display: 'flex', alignItems: 'center', gap: '0.6rem',
                        padding: '0.4rem 0.55rem', borderRadius: 7,
                        background: isMe ? 'rgba(245,166,35,0.14)' : i % 2 === 0 ? '#fafbff' : 'transparent',
                        border: isMe ? '1px solid rgba(245,166,35,0.45)' : '1px solid transparent',
                      }}>
                        <span style={{
                          width: '1.5rem', textAlign: 'center', flexShrink: 0,
                          fontFamily: i < 3 ? 'inherit' : 'var(--font-bebas)',
                          fontSize: i < 3 ? '1rem' : '0.85rem', color: 'var(--gray)',
                        }}>{rankBadge(i + 1)}</span>
                        <a href={`/p/${r.zohoId}`} style={{
                          flex: 1, fontFamily: 'var(--font-body)', fontWeight: isMe ? 700 : 500,
                          fontSize: '0.82rem', color: 'var(--navy)', textDecoration: 'none',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>{r.name}{isMe && ' (tú)'}</a>
                        <span style={{
                          flexShrink: 0, fontFamily: 'var(--font-cond)', fontWeight: 700,
                          fontSize: '0.82rem', color: 'var(--orange)',
                        }}>{r.points.toFixed(1)} pts</span>
                      </li>
                    )
                  })}
                </ol>
              )}
            </div>
          </div>
        )}

        {gerenteAccionista && (
          <div className="detail-card">
            <h3>Gerente Accionista — Desglose</h3>

            {/* Formato Primario 2·4·6 */}
            <div style={{
              fontFamily: 'var(--font-cond)', fontWeight: 800, fontSize: '0.62rem',
              letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--orange)',
              marginBottom: '0.5rem',
            }}>
              Formato Primario {gerenteAccionista.primary.done ? '✓' : ''}
            </div>
            <dl>
              <dt>Gerentes graduados</dt><dd>{gerenteAccionista.primary.gerentes} / {gerenteAccionista.primary.target.gerentes}</dd>
              <dt>Líderes graduados</dt><dd>{gerenteAccionista.primary.lideres} / {gerenteAccionista.primary.target.lideres}</dd>
              <dt>Consultores graduados</dt><dd>{gerenteAccionista.primary.consultores} / {gerenteAccionista.primary.target.consultores}</dd>
              <dt>Metas cumplidas</dt><dd className="highlight">{gerenteAccionista.primary.metasCumplidas} / 3</dd>
            </dl>

            {/* Formato Secundario */}
            <div style={{
              fontFamily: 'var(--font-cond)', fontWeight: 800, fontSize: '0.62rem',
              letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--orange)',
              margin: '0.9rem 0 0.5rem',
            }}>
              Formato Secundario {gerenteAccionista.secondaryDone ? '✓' : ''}
            </div>
            <dl>
              <dt>Pts de desarrollo</dt><dd>{gerenteAccionista.dev.points.toFixed(1)} / {gerenteAccionista.dev.target}</dd>
              <dt>Solar</dt><dd>{gerenteAccionista.sales.breakdown.solar.toFixed(1)}</dd>
              <dt>Roofing</dt><dd>{gerenteAccionista.sales.breakdown.roofing.toFixed(1)}</dd>
              <dt>Anker (PPS)</dt><dd>{gerenteAccionista.sales.breakdown.pps.toFixed(1)}</dd>
              <dt>Agua</dt><dd>{gerenteAccionista.sales.breakdown.water.toFixed(1)}</dd>
              <dt>Asistidas</dt><dd>{gerenteAccionista.sales.breakdown.asistida.toFixed(1)}</dd>
              <dt>Ventas personales</dt><dd className="highlight">{gerenteAccionista.sales.points.toFixed(1)} / {gerenteAccionista.sales.target}</dd>
            </dl>

            {/* Ranking de gerentes */}
            <div style={{ marginTop: '1rem', borderTop: '1px solid #edf0f8', paddingTop: '0.85rem' }}>
              <div style={{
                fontFamily: 'var(--font-cond)', fontWeight: 800, fontSize: '0.62rem',
                letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--orange)',
                marginBottom: '0.6rem',
              }}>
                Top 10 Gerentes — pts de desarrollo
              </div>

              {gaRanking.length === 0 ? (
                <p style={{ fontFamily: 'var(--font-cond)', fontSize: '0.8rem', color: 'var(--gray)', margin: 0 }}>
                  Ranking disponible tras el próximo sync.
                </p>
              ) : (
                <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  {gaRanking.map((r, i) => {
                    const isMe = r.zohoId === metrics.zohoId
                    return (
                      <li key={r.zohoId} style={{
                        display: 'flex', alignItems: 'center', gap: '0.6rem',
                        padding: '0.4rem 0.55rem', borderRadius: 7,
                        background: isMe ? 'rgba(245,166,35,0.14)' : i % 2 === 0 ? '#fafbff' : 'transparent',
                        border: isMe ? '1px solid rgba(245,166,35,0.45)' : '1px solid transparent',
                      }}>
                        <span style={{
                          width: '1.5rem', textAlign: 'center', flexShrink: 0,
                          fontFamily: i < 3 ? 'inherit' : 'var(--font-bebas)',
                          fontSize: i < 3 ? '1rem' : '0.85rem', color: 'var(--gray)',
                        }}>{rankBadge(i + 1)}</span>
                        <a href={`/p/${r.zohoId}`} style={{
                          flex: 1, fontFamily: 'var(--font-body)', fontWeight: isMe ? 700 : 500,
                          fontSize: '0.82rem', color: 'var(--navy)', textDecoration: 'none',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>{r.name}{isMe && ' (tú)'}</a>
                        <span style={{
                          flexShrink: 0, fontFamily: 'var(--font-cond)', fontWeight: 700,
                          fontSize: '0.82rem', color: 'var(--orange)',
                        }}>{r.primaryDone ? 'Primario ✓' : `${r.devPoints.toFixed(1)} pts`}</span>
                      </li>
                    )
                  })}
                </ol>
              )}
            </div>
          </div>
        )}

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
                <dt>Total</dt><dd className="highlight">{Number.isInteger(monthly.current) ? monthly.current : monthly.current.toFixed(1)} / {monthly.target}</dd>
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
            <dd>{(plinko.weeklyPipelines['residential solar'] || 0) + (plinko.weeklyPipelines['commercial solar'] || 0) || '—'}</dd>
            <dt>Roofing</dt>
            <dd>{plinko.weeklyPipelines['roofing'] || '—'}</dd>
            <dt>Anker (½)</dt>
            <dd>{plinko.weeklyPipelines['pps'] || '—'}</dd>
            <dt>Water (½)</dt>
            <dd>{plinko.weeklyPipelines['water products'] || '—'}</dd>
            <dt>Semana</dt><dd>{plinko.weekStart}</dd>
            <dt>Total pts</dt>
            <dd className="highlight">{plinko.current} / {plinko.target}</dd>
          </dl>
        </div>

        {ruleta && (
          <div className="detail-card">
            <h3>Ruleta — Mes</h3>
            <dl>
              <dt>Solar</dt>
              <dd>{ruleta.monthlyPipelines['residential solar'] || '—'}</dd>
              <dt>Roofing</dt>
              <dd>{ruleta.monthlyPipelines['roofing'] || '—'}</dd>
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

'use client'

import { Fragment, useEffect, useState } from 'react'
import type { TeslaLeaderboardResponse, TeslaLeaderboardRow, TeslaRole } from '@/app/api/leaderboard-tesla/route'

// ── Style helpers ──────────────────────────────────────────────────────────────

function thGroup(label: string, borderColor: string, align: 'left' | 'center' = 'center'): React.CSSProperties {
  return {
    padding: '0.35rem 0.75rem',
    fontFamily: 'var(--font-cond)', fontWeight: 800,
    fontSize: '0.58rem', letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: label ? 'rgba(255,255,255,0.85)' : 'transparent',
    textAlign: align,
    borderBottom: `2px solid ${borderColor}`,
    background: 'var(--navy)',
    whiteSpace: 'nowrap',
  }
}

const numTd: React.CSSProperties = {
  padding: '0.7rem 0.5rem',
  textAlign: 'center',
  verticalAlign: 'middle',
  fontFamily: 'var(--font-cond)',
  fontWeight: 600,
  fontSize: '0.9rem',
  color: 'var(--navy)',
  letterSpacing: '0.02em',
}

function fmt(n: number) {
  return n % 1 === 0 ? String(n) : n.toFixed(1)
}

function rankBadge(rank: number) {
  if (rank === 1) return { icon: '🥇', color: '#F5A623' }
  if (rank === 2) return { icon: '🥈', color: '#9AA5B4' }
  if (rank === 3) return { icon: '🥉', color: '#C87941' }
  return { icon: String(rank), color: 'var(--gray)' }
}

const TOP_N = 10  // top 10 por rol ganan

const ROLE_TABS: { role: TeslaRole; label: string }[] = [
  { role: 'consultor', label: 'Consultores' },
  { role: 'lider',     label: 'Líderes' },
  { role: 'gerente',   label: 'Gerentes' },
]

// ── Loading skeleton for the table ──────────────────────────────────────────────

function TableSkeleton() {
  return (
    <tbody>
      {Array.from({ length: 6 }).map((_, i) => (
        <tr key={i} style={{ borderBottom: '1px solid #edf0f8', background: i % 2 === 0 ? '#fff' : '#fafbff' }}>
          {Array.from({ length: 7 }).map((_, j) => (
            <td key={j} style={{ padding: '0.7rem 0.5rem' }}>
              <div style={{
                height: 14, borderRadius: 4,
                background: '#e8eef8',
                animation: 'pulse 1.5s ease-in-out infinite',
                width: j === 1 ? '80%' : '60%',
                margin: j === 1 ? '0' : '0 auto',
              }} />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  )
}

// ── Main component ───────────────────────────────────────────────────────────────

export default function TeslaLeaderboardClient() {
  const [data, setData]           = useState<TeslaLeaderboardResponse | null>(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [activeRole, setActiveRole] = useState<TeslaRole>('consultor')

  useEffect(() => {
    fetch('/api/leaderboard-tesla')
      .then(r => r.json())
      .then((d: TeslaLeaderboardResponse & { error?: string }) => {
        if (d.error) { setError(d.error); return }
        setData(d)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const rows      = data?.rows ?? []
  const start     = data?.start ?? '2026-07-01'
  const end       = data?.end ?? '2026-10-15'
  const minVentas = data?.minVentas ?? 10

  // Rows for the active role, already sorted by points desc (server-side)
  const roleRows   = rows.filter(m => m.role === activeRole)
  const qualified  = rows.filter(m => m.ventas >= minVentas).length

  const today    = new Date()
  const endDate  = new Date(end + 'T00:00:00')
  const daysLeft = Math.max(0, Math.ceil((endDate.getTime() - today.getTime()) / 86_400_000))

  const fmtDay = (iso: string) => {
    const d = new Date(iso + 'T00:00:00')
    const mes = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][d.getMonth()]
    return `${d.getDate()} ${mes}`
  }

  return (
    <main style={{ minHeight: '100vh', background: 'var(--light)', paddingBottom: '3rem' }}>

      {/* keyframe for skeleton */}
      <style>{`@keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.4 } }`}</style>

      {/* ═══════════════════════════════════════════════════════
          HERO — Competencia Tesla Banner
      ═══════════════════════════════════════════════════════ */}
      <section style={{ position: 'relative', minHeight: 560, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Factory background */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'url(/fabrica_tesla.png)',
          backgroundSize: 'cover',
          backgroundPosition: 'center 40%',
        }} />

        {/* Gradient layers */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(120deg, rgba(13,22,84,0.92) 0%, rgba(13,22,84,0.55) 45%, rgba(13,22,84,0.15) 100%)',
        }} />
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to bottom, transparent 25%, rgba(13,22,84,0.65) 60%, rgba(13,22,84,0.97) 100%)',
        }} />

        {/* Red accent stripe (Tesla) */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          height: 4,
          background: 'linear-gradient(to right, #E82127, var(--gold), #E82127)',
        }} />

        {/* ── Top navbar ── */}
        <header style={{ position: 'relative', zIndex: 3, padding: '1.1rem 2rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <img src="/windmar-logo-rev.png" alt="Windmar" style={{ height: '2rem', objectFit: 'contain', flexShrink: 0 }} />
          <span style={{
            background: '#E82127', color: '#fff',
            fontFamily: 'var(--font-cond)', fontWeight: 800,
            fontSize: '0.58rem', letterSpacing: '0.22em', textTransform: 'uppercase',
            padding: '0.22rem 0.7rem', borderRadius: 3,
          }}>EN ACCIÓN</span>
          <nav style={{ marginLeft: 'auto', display: 'flex', gap: '1.25rem' }}>
            <a href="/leaderboard" style={{
              fontFamily: 'var(--font-cond)', fontWeight: 700,
              fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.6)', textDecoration: 'none',
            }}>Crucero →</a>
            <a href="/leaderboard-lideres" style={{
              fontFamily: 'var(--font-cond)', fontWeight: 700,
              fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.6)', textDecoration: 'none',
            }}>Competencia Líderes →</a>
            <a href="/plinko-ruleta" style={{
              fontFamily: 'var(--font-cond)', fontWeight: 700,
              fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.6)', textDecoration: 'none',
            }}>Plinko & Ruleta →</a>
            <a href="/search" style={{
              fontFamily: 'var(--font-cond)', fontWeight: 700,
              fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.6)', textDecoration: 'none',
            }}>Buscar vendedor →</a>
          </nav>
        </header>

        {/* ── Hero copy ── */}
        <div style={{ position: 'relative', zIndex: 3, padding: '0 2rem 0', marginTop: 'auto', paddingBottom: '1.75rem' }}>
          {/* Main title */}
          <div style={{ lineHeight: 1, marginBottom: '0.5rem' }}>
            <div style={{
              fontFamily: 'var(--font-bebas)',
              fontSize: 'clamp(4rem, 12vw, 7.5rem)',
              color: '#fff',
              letterSpacing: '0.04em', lineHeight: 0.85,
              textShadow: '0 4px 40px rgba(0,0,0,0.8), 0 0 80px rgba(13,22,84,0.5)',
            }}>COMPETENCIA TESLA</div>
            <div style={{
              fontFamily: 'var(--font-bebas)',
              fontSize: 'clamp(2.5rem, 7vw, 4.5rem)',
              color: 'var(--gold)',
              letterSpacing: '0.22em', lineHeight: 1,
              textShadow: '0 2px 20px rgba(0,0,0,0.7)',
            }}>FÁBRICA 2026</div>
          </div>

          {/* Tagline */}
          <p style={{
            fontFamily: 'var(--font-cond)', fontWeight: 700,
            fontSize: '0.68rem', letterSpacing: '0.24em',
            color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', marginBottom: '0.3rem',
          }}>{fmtDay(start)} – {fmtDay(end)} &nbsp;·&nbsp; TOP 10 POR ROL &nbsp;·&nbsp; A LA FÁBRICA DE TESLA</p>

          {/* Challenge */}
          <p style={{
            fontFamily: 'var(--font-bebas)',
            fontSize: 'clamp(1.4rem, 4vw, 2.1rem)',
            color: 'var(--orange)', letterSpacing: '0.07em',
            textShadow: '0 2px 12px rgba(0,0,0,0.5)', marginBottom: '1.5rem',
          }}>¿VAS A COMPETIR O VAS A MIRAR?</p>

          {/* ── Rule pills + live stats ── */}
          <div style={{ display: 'flex', gap: '1px', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
            {[
              { big: '1',   label: 'BATERÍA',  sub: '+ SOLAR',    bg: 'rgba(232,33,39,0.22)', accent: '#fff' },
              { big: '0.5', label: 'BATERÍA',  sub: 'SOLA',       bg: 'rgba(255,255,255,0.12)', accent: '#fff' },
              { big: '0.5', label: 'VENTA',    sub: 'ASISTIDA',   bg: 'rgba(245,166,35,0.22)', accent: 'var(--gold)' },
              { big: String(minVentas), label: 'VENTAS', sub: 'MÍNIMO', bg: 'rgba(232,33,39,0.15)', accent: '#E82127' },
            ].map(({ big, label, sub, bg, accent }) => (
              <div key={big + label + sub} style={{
                background: bg, border: '1px solid rgba(255,255,255,0.15)',
                backdropFilter: 'blur(4px)', borderRadius: 8,
                padding: '0.65rem 1.25rem', textAlign: 'center', minWidth: 90,
              }}>
                <div style={{ fontFamily: 'var(--font-bebas)', fontSize: '2.4rem', lineHeight: 1, color: accent, letterSpacing: '0.04em', textShadow: '0 2px 8px rgba(0,0,0,0.4)' }}>{big}</div>
                <div style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: '0.58rem', letterSpacing: '0.15em', color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', lineHeight: 1.3 }}>{label}<br />{sub}</div>
              </div>
            ))}

            {/* Divider */}
            <div style={{ width: 1, background: 'rgba(255,255,255,0.12)', margin: '0 0.5rem', alignSelf: 'stretch' }} />

            {/* Live stats */}
            {[
              { big: loading ? '…' : String(rows.length), label: 'PARTICIPANTES', sub: 'EN COMPETENCIA', accent: 'rgba(255,255,255,0.9)' },
              { big: loading ? '…' : String(daysLeft),    label: 'DÍAS',          sub: 'RESTANTES',      accent: '#7EC8E3' },
              { big: loading ? '…' : String(qualified),   label: qualified === 1 ? 'CLASIFICADO' : 'CLASIFICADOS', sub: `≥${minVentas} VENTAS`, accent: !loading && qualified > 0 ? 'var(--gold)' : 'rgba(255,255,255,0.4)' },
            ].map(({ big, label, sub, accent }) => (
              <div key={big + label} style={{
                background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8, padding: '0.65rem 1.1rem', textAlign: 'center', minWidth: 80,
              }}>
                <div style={{ fontFamily: 'var(--font-bebas)', fontSize: '2.4rem', lineHeight: 1, color: accent, letterSpacing: '0.04em' }}>{big}</div>
                <div style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: '0.58rem', letterSpacing: '0.15em', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', lineHeight: 1.3 }}>{label}<br />{sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
          ROLE TABS
      ═══════════════════════════════════════════════════════ */}
      <div style={{ padding: '1.25rem 1.5rem 0', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {ROLE_TABS.map(({ role, label }) => {
          const isActive = role === activeRole
          const count = rows.filter(m => m.role === role).length
          return (
            <button
              key={role}
              onClick={() => setActiveRole(role)}
              style={{
                fontFamily: 'var(--font-cond)', fontWeight: 800,
                fontSize: '0.8rem', letterSpacing: '0.08em', textTransform: 'uppercase',
                padding: '0.55rem 1.25rem', borderRadius: 999, cursor: 'pointer',
                border: isActive ? '1px solid var(--navy)' : '1px solid #d7deec',
                background: isActive ? 'var(--navy)' : '#fff',
                color: isActive ? '#fff' : 'var(--gray)',
                transition: 'all 0.15s',
              }}
            >
              {label}
              <span style={{
                marginLeft: 8, fontSize: '0.7rem',
                color: isActive ? 'rgba(255,255,255,0.6)' : '#aab4cc',
              }}>{loading ? '' : count}</span>
            </button>
          )
        })}
      </div>

      {/* ═══════════════════════════════════════════════════════
          LEADERBOARD TABLE
      ═══════════════════════════════════════════════════════ */}
      <div className="section-eyebrow" style={{ background: 'var(--light)' }}>
        🏆 Ranking {ROLE_TABS.find(t => t.role === activeRole)?.label} — {loading ? '…' : roleRows.length} participantes · gana el top {TOP_N}
      </div>

      <div style={{ padding: '0 1.5rem' }}>
        <div style={{ overflowX: 'auto', borderRadius: '0.75rem', boxShadow: '0 4px 24px rgba(13,22,84,0.12)', border: '1px solid #e2e8f4' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', fontFamily: 'var(--font-body)', fontSize: '0.875rem', minWidth: 720 }}>
            <thead>
              <tr>
                <th colSpan={2} style={thGroup('', 'transparent', 'left')} />
                <th colSpan={3} style={thGroup('Baterías Tesla', '#E82127')}>Baterías Tesla</th>
                <th colSpan={1} style={thGroup('Ventas', '#1565C0')}>Ventas</th>
                <th colSpan={1} style={thGroup('', 'transparent')} />
              </tr>
              <tr style={{ background: 'var(--navy)' }}>
                {[
                  { label: '#',          w: '3rem',   align: 'center' as const },
                  { label: 'Nombre',     w: 'auto',   align: 'left'   as const },
                  { label: 'Bat.+Solar', w: '6rem',   align: 'center' as const },
                  { label: 'Bat. sola',  w: '6rem',   align: 'center' as const },
                  { label: 'Asist.',     w: '5rem',   align: 'center' as const },
                  { label: 'Ventas',     w: '5.5rem', align: 'center' as const },
                  { label: 'Total pts',  w: '7.5rem', align: 'center' as const },
                ].map(({ label, w, align }) => (
                  <th key={label} style={{ padding: '0.65rem 0.5rem', fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: '0.68rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.75)', textAlign: align, width: w, whiteSpace: 'nowrap' }}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>

            {loading ? <TableSkeleton /> : (
              <tbody>
                {roleRows.map((m: TeslaLeaderboardRow, i: number) => {
                  const rank      = i + 1
                  const isWinner  = rank <= TOP_N
                  const isQualified = m.ventas >= minVentas
                  const { icon, color } = rankBadge(rank)
                  const rowBg = isWinner
                    ? (rank <= 3 ? 'rgba(245,166,35,0.10)' : 'rgba(245,166,35,0.05)')
                    : i % 2 === 0 ? '#fff' : '#fafbff'
                  const dim = !isWinner

                  return (
                    <Fragment key={m.zohoId}>
                      {rank === TOP_N + 1 && (
                        <tr>
                          <td colSpan={7} style={{
                            padding: '0.3rem 1rem', textAlign: 'center',
                            fontFamily: 'var(--font-cond)', fontWeight: 800,
                            fontSize: '0.6rem', letterSpacing: '0.2em', textTransform: 'uppercase',
                            color: '#aab4cc', background: '#f1f4fb',
                            borderTop: '2px dashed #d7deec', borderBottom: '1px solid #edf0f8',
                          }}>
                            ── corte top {TOP_N} ──
                          </td>
                        </tr>
                      )}
                      <tr style={{ background: rowBg, borderBottom: '1px solid #edf0f8', opacity: dim ? 0.62 : 1 }}>
                        {/* Rank */}
                        <td style={{ padding: '0.7rem 0.25rem 0.7rem 0.75rem', textAlign: 'center', verticalAlign: 'middle', fontFamily: rank <= 3 ? 'inherit' : 'var(--font-bebas)', fontSize: rank <= 3 ? '1.3rem' : '0.95rem', color, fontWeight: 600, lineHeight: 1 }}>
                          {icon}
                        </td>

                        {/* Name */}
                        <td style={{ padding: '0.7rem 0.5rem 0.7rem 1rem', verticalAlign: 'middle' }}>
                          <a href={`/p/${m.zohoId}`} style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--navy)', textDecoration: 'none', fontFamily: 'var(--font-body)' }}>
                            {m.name}
                          </a>
                          {isWinner && (
                            <span style={{ marginLeft: 8, background: 'var(--gold)', color: '#fff', fontFamily: 'var(--font-cond)', fontWeight: 800, fontSize: '0.55rem', letterSpacing: '0.12em', padding: '0.15rem 0.5rem', borderRadius: 999, textTransform: 'uppercase', verticalAlign: 'middle' }}>
                              GANA
                            </span>
                          )}
                          {isQualified && (
                            <span style={{ marginLeft: 6, background: 'rgba(21,101,192,0.12)', color: 'var(--blue)', fontFamily: 'var(--font-cond)', fontWeight: 800, fontSize: '0.55rem', letterSpacing: '0.1em', padding: '0.15rem 0.5rem', borderRadius: 999, textTransform: 'uppercase', verticalAlign: 'middle' }}>
                              CLASIFICADO
                            </span>
                          )}
                        </td>

                        {/* Batería con solar */}
                        <td style={numTd}>{m.bateriaConSolar > 0 ? m.bateriaConSolar : <span style={{ color: '#ccd3e0' }}>—</span>}</td>
                        {/* Batería sola */}
                        <td style={numTd}>{m.bateriaSola > 0 ? m.bateriaSola : <span style={{ color: '#ccd3e0' }}>—</span>}</td>
                        {/* Asistidas */}
                        <td style={{ ...numTd, color: m.asistida > 0 ? 'var(--orange)' : '#ccd3e0' }}>
                          {m.asistida > 0 ? m.asistida : '—'}
                        </td>

                        {/* Ventas x/min */}
                        <td style={{ ...numTd, color: isQualified ? 'var(--blue)' : m.ventas > 0 ? 'var(--navy)' : '#ccd3e0', fontWeight: isQualified ? 800 : 600 }}>
                          {m.ventas}
                          <span style={{ fontSize: '0.62rem', color: '#aab4cc', marginLeft: 2 }}>/{minVentas}</span>
                        </td>

                        {/* Total pts */}
                        <td style={{ padding: '0.7rem 1rem 0.7rem 0.5rem', textAlign: 'center', verticalAlign: 'middle' }}>
                          <span style={{ fontFamily: 'var(--font-bebas)', fontSize: m.points > 0 ? '1.35rem' : '1rem', letterSpacing: '0.04em', lineHeight: 1, color: isWinner ? 'var(--orange)' : m.points > 0 ? 'var(--navy)' : '#ccd3e0' }}>
                            {m.points > 0 ? fmt(m.points) : '0'}
                          </span>
                        </td>
                      </tr>
                    </Fragment>
                  )
                })}

                {!loading && error && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: '#dc2626', fontFamily: 'var(--font-cond)' }}>
                      Error al cargar datos: {error}
                    </td>
                  </tr>
                )}

                {!loading && !error && roleRows.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: 'var(--gray)', fontFamily: 'var(--font-cond)' }}>
                      No hay participantes en este rol todavía.
                    </td>
                  </tr>
                )}
              </tbody>
            )}
          </table>
        </div>

        {/* Legend */}
        <div style={{ marginTop: '1.25rem', display: 'flex', gap: '1.5rem', flexWrap: 'wrap', justifyContent: 'center', fontFamily: 'var(--font-cond)', fontSize: '0.72rem', color: 'var(--gray)', letterSpacing: '0.04em' }}>
          {[
            'Batería + Solar = 1 pt c/u',
            'Batería sola = 0.5 pts c/u',
            'Venta asistida (1ª–4ª de un trainee) = 0.5 pts c/u',
            `Clasifican con ≥${minVentas} ventas · Ganan los primeros ${TOP_N} de cada rol`,
            'Trainees no participan',
          ].map(t => (
            <span key={t} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#E82127', display: 'inline-block', flexShrink: 0 }} />
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* Footer: last updated */}
      {data?.computedAt && (
        <footer className="dashboard-footer">
          Datos de Redshift · Actualizado: {new Date(data.computedAt).toLocaleString('es-PR', { timeZone: 'America/Puerto_Rico' })}
        </footer>
      )}
    </main>
  )
}

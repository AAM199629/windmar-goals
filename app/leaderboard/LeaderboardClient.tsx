'use client'

import { useEffect, useState } from 'react'
import type { LeaderboardResponse, LeaderboardRow } from '@/app/api/leaderboard/route'

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

// ── Loading skeleton for the table ────────────────────────────────────────────

function TableSkeleton() {
  return (
    <tbody>
      {Array.from({ length: 6 }).map((_, i) => (
        <tr key={i} style={{ borderBottom: '1px solid #edf0f8', background: i % 2 === 0 ? '#fff' : '#fafbff' }}>
          {Array.from({ length: 9 }).map((_, j) => (
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

// ── Main component ─────────────────────────────────────────────────────────────

export default function LeaderboardClient() {
  const [data, setData]       = useState<LeaderboardResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/leaderboard')
      .then(r => r.json())
      .then((d: LeaderboardResponse & { error?: string }) => {
        if (d.error) { setError(d.error); return }
        setData(d)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const rows         = data?.rows ?? []
  const cruiseTarget = data?.cruiseTarget ?? 70
  const cruiseEnd    = data?.cruiseEnd ?? '2026-12-31'

  const withPoints = rows.filter(m => m.total > 0).length

  const today      = new Date()
  const endDate    = new Date(cruiseEnd + 'T00:00:00')
  const daysLeft   = Math.max(0, Math.ceil((endDate.getTime() - today.getTime()) / 86_400_000))

  const compStart  = new Date('2026-01-01T00:00:00')
  const mElapsed   = Math.max(1, (today.getTime() - compStart.getTime()) / (30.44 * 86_400_000))
  const onPace     = rows.filter(m => m.total > 0 && (m.total / mElapsed) >= 4.5).length

  return (
    <main style={{ minHeight: '100vh', background: 'var(--light)', paddingBottom: '3rem' }}>

      {/* keyframe for skeleton */}
      <style>{`@keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.4 } }`}</style>

      {/* ═══════════════════════════════════════════════════════
          HERO — Cruise Competition Banner
      ═══════════════════════════════════════════════════════ */}
      <section style={{ position: 'relative', minHeight: 560, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Ship background */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'url(/Crucero2.jpeg)',
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

        {/* Orange accent stripe */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          height: 4,
          background: 'linear-gradient(to right, var(--orange), var(--gold), var(--orange))',
        }} />

        {/* ── Top navbar ── */}
        <header style={{ position: 'relative', zIndex: 3, padding: '1.1rem 2rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <img src="/windmar-logo-rev.png" alt="Windmar" style={{ height: '2rem', objectFit: 'contain', flexShrink: 0 }} />
          <span style={{
            background: 'var(--orange)', color: '#fff',
            fontFamily: 'var(--font-cond)', fontWeight: 800,
            fontSize: '0.58rem', letterSpacing: '0.22em', textTransform: 'uppercase',
            padding: '0.22rem 0.7rem', borderRadius: 3,
          }}>EN ACCIÓN</span>
          <nav style={{ marginLeft: 'auto', display: 'flex', gap: '1.25rem' }}>
            <a href="/leaderboard-tesla" style={{
              fontFamily: 'var(--font-cond)', fontWeight: 700,
              fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.6)', textDecoration: 'none',
            }}>Competencia Tesla →</a>
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
              fontSize: 'clamp(5.5rem, 16vw, 9.5rem)',
              color: '#fff',
              letterSpacing: '0.06em', lineHeight: 0.85,
              textShadow: '0 4px 40px rgba(0,0,0,0.8), 0 0 80px rgba(13,22,84,0.5)',
            }}>CRUCERO</div>
            <div style={{
              fontFamily: 'var(--font-bebas)',
              fontSize: 'clamp(2.5rem, 7vw, 4.5rem)',
              color: 'var(--gold)',
              letterSpacing: '0.22em', lineHeight: 1,
              textShadow: '0 2px 20px rgba(0,0,0,0.7)',
            }}>2027</div>
          </div>

          {/* Tagline */}
          <p style={{
            fontFamily: 'var(--font-cond)', fontWeight: 700,
            fontSize: '0.68rem', letterSpacing: '0.24em',
            color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', marginBottom: '0.3rem',
          }}>UN AÑO &nbsp;·&nbsp; UNA META &nbsp;·&nbsp; UN LUGAR PARA DOS</p>

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
              { big: '70',  label: 'PUNTOS',    sub: 'TOTALES',      bg: 'rgba(255,255,255,0.12)', accent: '#fff' },
              { big: '50',  label: 'EN VENTAS', sub: 'PERSONALES',   bg: 'rgba(232,139,12,0.22)', accent: 'var(--orange)' },
              { big: '75',  label: 'SOLO',      sub: 'CLASIFICAN',   bg: 'rgba(245,166,35,0.22)', accent: 'var(--gold)' },
            ].map(({ big, label, sub, bg, accent }) => (
              <div key={big + label} style={{
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
              { big: loading ? '…' : String(rows.length), label: 'VENDEDORES',  sub: 'EN COMPETENCIA',  accent: 'rgba(255,255,255,0.9)' },
              { big: loading ? '…' : String(daysLeft),    label: 'DÍAS',        sub: 'RESTANTES',       accent: '#7EC8E3' },
              { big: loading ? '…' : String(onPace), label: onPace === 1 ? 'VA EN RITMO' : 'VAN EN RITMO', sub: '≥4.5 PTS / MES', accent: !loading && onPace > 0 ? 'var(--gold)' : 'rgba(255,255,255,0.4)' },
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
          LEADERBOARD TABLE
      ═══════════════════════════════════════════════════════ */}
      <div className="section-eyebrow" style={{ background: 'var(--light)' }}>
        🏆 Clasificación General — {loading ? '…' : rows.length} vendedores · {loading ? '…' : withPoints} con puntos acumulados
      </div>

      <div style={{ padding: '0 1.5rem' }}>
        <div style={{ overflowX: 'auto', borderRadius: '0.75rem', boxShadow: '0 4px 24px rgba(13,22,84,0.12)', border: '1px solid #e2e8f4' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', fontFamily: 'var(--font-body)', fontSize: '0.875rem', minWidth: 820 }}>
            <thead>
              <tr>
                <th colSpan={2} style={thGroup('', 'transparent', 'left')} />
                <th colSpan={4} style={thGroup('Ventas por Producto', '#1565C0')}>Ventas por Producto</th>
                <th colSpan={1} style={thGroup('Reclutamiento', '#E88B0C')}>Reclutamiento</th>
                <th colSpan={1} style={thGroup('Asistidas', '#2196F3')}>Asistidas</th>
                <th colSpan={1} style={thGroup('', 'transparent')} />
              </tr>
              <tr style={{ background: 'var(--navy)' }}>
                {[
                  { label: '#',          w: '3rem',   align: 'center' as const },
                  { label: 'Nombre',     w: 'auto',   align: 'left'   as const },
                  { label: 'Solar',      w: '5rem',   align: 'center' as const },
                  { label: 'Roofing',    w: '5rem',   align: 'center' as const },
                  { label: 'Agua',       w: '5rem',   align: 'center' as const },
                  { label: 'PPS',        w: '4.5rem', align: 'center' as const },
                  { label: 'Recl. pts',  w: '6rem',   align: 'center' as const },
                  { label: 'Asist. pts', w: '5.5rem', align: 'center' as const },
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
                {rows.map((m: LeaderboardRow, i: number) => {
                  const bd    = m.breakdown
                  const total = m.total
                  const recl  = (bd.consultor ?? 0) + (bd.lider ?? 0) + (bd.gerente ?? 0)
                  const pct   = Math.min(100, (total / cruiseTarget) * 100)
                  const { icon, color } = rankBadge(i + 1)
                  const isQualified = total >= cruiseTarget
                  const rowBg = isQualified
                    ? 'rgba(245,166,35,0.08)'
                    : i < 3 ? 'rgba(21,101,192,0.04)'
                    : i % 2 === 0 ? '#fff' : '#fafbff'

                  return (
                    <tr key={m.zohoId} style={{ background: rowBg, borderBottom: '1px solid #edf0f8' }}>
                      {/* Rank */}
                      <td style={{ padding: '0.7rem 0.25rem 0.7rem 0.75rem', textAlign: 'center', verticalAlign: 'middle', fontFamily: i < 3 ? 'inherit' : 'var(--font-bebas)', fontSize: i < 3 ? '1.3rem' : '0.95rem', color, fontWeight: 600, lineHeight: 1 }}>
                        {icon}
                      </td>

                      {/* Name */}
                      <td style={{ padding: '0.7rem 0.5rem 0.7rem 1rem', verticalAlign: 'middle' }}>
                        <a href={`/p/${m.zohoId}`} style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--navy)', textDecoration: 'none', fontFamily: 'var(--font-body)' }}>
                          {m.name}
                        </a>
                        {isQualified && (
                          <span style={{ marginLeft: 8, background: 'var(--gold)', color: '#fff', fontFamily: 'var(--font-cond)', fontWeight: 800, fontSize: '0.55rem', letterSpacing: '0.12em', padding: '0.15rem 0.5rem', borderRadius: 999, textTransform: 'uppercase', verticalAlign: 'middle' }}>
                            CLASIFICADO
                          </span>
                        )}
                      </td>

                      {/* Product pts */}
                      <td style={numTd}>{total > 0 ? fmt(bd.solar   ?? 0) : <span style={{ color: '#ccd3e0' }}>—</span>}</td>
                      <td style={numTd}>{total > 0 ? fmt(bd.roofing ?? 0) : <span style={{ color: '#ccd3e0' }}>—</span>}</td>
                      <td style={numTd}>{total > 0 ? fmt(bd.water   ?? 0) : <span style={{ color: '#ccd3e0' }}>—</span>}</td>
                      <td style={numTd}>{total > 0 ? fmt(bd.pps     ?? 0) : <span style={{ color: '#ccd3e0' }}>—</span>}</td>

                      {/* Reclutamiento */}
                      <td style={{ ...numTd, color: recl > 0 ? 'var(--orange)' : '#ccd3e0', fontWeight: recl > 0 ? 700 : 400 }}>
                        {recl > 0 ? fmt(recl) : '—'}
                      </td>

                      {/* Asistidas */}
                      <td style={{ ...numTd, color: (bd.asistida ?? 0) > 0 ? 'var(--blue)' : '#ccd3e0' }}>
                        {(bd.asistida ?? 0) > 0 ? fmt(bd.asistida ?? 0) : '—'}
                      </td>

                      {/* Total + bar */}
                      <td style={{ padding: '0.7rem 1rem 0.7rem 0.5rem', textAlign: 'center', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem' }}>
                          <span style={{ fontFamily: 'var(--font-bebas)', fontSize: total > 0 ? '1.35rem' : '1rem', letterSpacing: '0.04em', lineHeight: 1, color: isQualified ? 'var(--orange)' : total > 0 ? 'var(--navy)' : '#ccd3e0' }}>
                            {total > 0 ? fmt(total) : '0'}
                            <span style={{ fontFamily: 'var(--font-cond)', fontSize: '0.6rem', color: '#aab4cc', marginLeft: 3, letterSpacing: '0.05em' }}>/ {cruiseTarget}</span>
                          </span>
                          {total > 0 && (
                            <div style={{ width: 72, height: 4, background: '#e4e9f5', borderRadius: 999, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${pct}%`, minWidth: 4, background: isQualified ? 'linear-gradient(to right, var(--orange), var(--gold))' : 'linear-gradient(to right, var(--blue), #42A5F5)', borderRadius: 999 }} />
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}

                {!loading && error && (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: '3rem', color: '#dc2626', fontFamily: 'var(--font-cond)' }}>
                      Error al cargar datos: {error}
                    </td>
                  </tr>
                )}

                {!loading && !error && rows.length === 0 && (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: '3rem', color: 'var(--gray)', fontFamily: 'var(--font-cond)' }}>
                      No hay datos disponibles. Intenta recargar la página.
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
            'Solar = Res. Solar + Com. Solar (1 pt c/u)',
            'Agua = Water Products (0.5 pts c/u)',
            'PPS / Anker (0.5 pts c/u)',
            'Reclutamiento: Consultor 1 pt · Líder 5 pts · Gerente 10 pts',
            'Asistidas: 0.5 pts c/u',
          ].map(t => (
            <span key={t} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--orange)', display: 'inline-block', flexShrink: 0 }} />
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

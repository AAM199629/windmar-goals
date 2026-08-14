'use client'

import { Fragment, useEffect, useState } from 'react'
import type { LideresLeaderboardResponse, LideresLeaderboardRow } from '@/app/api/leaderboard-lideres/route'

// ── Style helpers ──────────────────────────────────────────────────────────────

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

function money(n: number) {
  return `$${n.toLocaleString('en-US')}`
}

function rankBadge(rank: number) {
  if (rank === 1) return { icon: '🥇', color: '#F5A623' }
  if (rank === 2) return { icon: '🥈', color: '#9AA5B4' }
  if (rank === 3) return { icon: '🥉', color: '#C87941' }
  return { icon: String(rank), color: 'var(--gray)' }
}

const COLS = 9

// ── Loading skeleton ───────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <tbody>
      {Array.from({ length: 8 }).map((_, i) => (
        <tr key={i} style={{ borderBottom: '1px solid #edf0f8', background: i % 2 === 0 ? '#fff' : '#fafbff' }}>
          {Array.from({ length: COLS }).map((_, j) => (
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

export default function LideresLeaderboardClient() {
  const [data, setData]       = useState<LideresLeaderboardResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/leaderboard-lideres')
      .then(r => r.json())
      .then((d: LideresLeaderboardResponse & { error?: string }) => {
        if (d.error) { setError(d.error); return }
        setData(d)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const rows      = data?.rows ?? []
  const start     = data?.start ?? '2026-08-01'
  const end       = data?.end ?? '2026-12-31'
  const minPoints = data?.minPoints ?? 9
  const topN      = data?.topN ?? 15
  const prizes    = data?.prizes ?? []

  const qualified = rows.filter(m => m.qualified).length
  const totalPool = prizes.reduce((a, b) => a + b, 0)

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

      <style>{`@keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.4 } }`}</style>

      {/* ═══════════════════════════════════════════════════════
          HERO — Competencia Líderes
      ═══════════════════════════════════════════════════════ */}
      <section style={{ position: 'relative', minHeight: 520, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Gradiente base (no hay imagen de fondo para esta competencia) */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(135deg, #041710 0%, #0B3322 40%, #10502F 70%, #1A6B3F 100%)',
        }} />
        {/* Halo dorado */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(circle at 78% 22%, rgba(201,162,39,0.35) 0%, transparent 55%)',
        }} />
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to bottom, transparent 35%, rgba(4,23,16,0.55) 75%, rgba(4,23,16,0.95) 100%)',
        }} />
        {/* Franja dorada */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 4,
          background: 'linear-gradient(to right, #C9A227, var(--gold), #C9A227)',
        }} />

        {/* ── Navbar ── */}
        <header style={{ position: 'relative', zIndex: 3, padding: '1.1rem 2rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <img src="/windmar-logo-rev.png" alt="Windmar" style={{ height: '2rem', objectFit: 'contain', flexShrink: 0 }} />
          <span style={{
            background: '#C9A227', color: '#04170F',
            fontFamily: 'var(--font-cond)', fontWeight: 800,
            fontSize: '0.58rem', letterSpacing: '0.22em', textTransform: 'uppercase',
            padding: '0.22rem 0.7rem', borderRadius: 3,
          }}>RECTA FINAL</span>
          <nav style={{ marginLeft: 'auto', display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
            {[
              { href: '/leaderboard',       label: 'Crucero →' },
              { href: '/leaderboard-tesla', label: 'Tesla →' },
              { href: '/plinko-ruleta',     label: 'Plinko & Ruleta →' },
              { href: '/search',            label: 'Buscar vendedor →' },
            ].map(({ href, label }) => (
              <a key={href} href={href} style={{
                fontFamily: 'var(--font-cond)', fontWeight: 700,
                fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.6)', textDecoration: 'none',
              }}>{label}</a>
            ))}
          </nav>
        </header>

        {/* ── Hero copy ── */}
        <div style={{ position: 'relative', zIndex: 3, padding: '0 2rem 0', marginTop: 'auto', paddingBottom: '1.75rem' }}>
          <div style={{ lineHeight: 1, marginBottom: '0.5rem' }}>
            <div style={{
              fontFamily: 'var(--font-bebas)',
              fontSize: 'clamp(3.5rem, 11vw, 7rem)',
              color: '#fff',
              letterSpacing: '0.04em', lineHeight: 0.85,
              textShadow: '0 4px 40px rgba(0,0,0,0.8)',
            }}>COMPETENCIA LÍDERES</div>
            <div style={{
              fontFamily: 'var(--font-bebas)',
              fontSize: 'clamp(2.5rem, 7vw, 4.5rem)',
              color: 'var(--gold)',
              letterSpacing: '0.22em', lineHeight: 1,
              textShadow: '0 2px 20px rgba(0,0,0,0.7)',
            }}>{money(totalPool)} · 2026</div>
          </div>

          <p style={{
            fontFamily: 'var(--font-cond)', fontWeight: 700,
            fontSize: '0.68rem', letterSpacing: '0.24em',
            color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', marginBottom: '0.3rem',
          }}>{fmtDay(start)} – {fmtDay(end)} &nbsp;·&nbsp; TOP {topN} &nbsp;·&nbsp; COMPETENCIA INDIVIDUAL</p>

          <p style={{
            fontFamily: 'var(--font-bebas)',
            fontSize: 'clamp(1.4rem, 4vw, 2.1rem)',
            color: 'var(--orange)', letterSpacing: '0.07em',
            textShadow: '0 2px 12px rgba(0,0,0,0.5)', marginBottom: '1.5rem',
          }}>LA RECTA FINAL DEL AÑO</p>

          {/* ── Pills de reglas + stats en vivo ── */}
          <div style={{ display: 'flex', gap: '1px', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
            {[
              { big: '1',   label: 'VENTA',  sub: 'SOLAR',      bg: 'rgba(201,162,39,0.22)', accent: 'var(--gold)' },
              { big: '1',   label: 'VENTA',  sub: 'ROOFING',    bg: 'rgba(255,255,255,0.12)', accent: '#fff' },
              { big: '½',   label: 'VENTA',  sub: 'WATER',      bg: 'rgba(255,255,255,0.12)', accent: '#fff' },
              { big: '½',   label: 'VENTA',  sub: 'ANKER',      bg: 'rgba(255,255,255,0.12)', accent: '#fff' },
              { big: String(minPoints), label: 'PUNTOS', sub: 'MÍNIMO', bg: 'rgba(201,162,39,0.15)', accent: '#C9A227' },
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

            <div style={{ width: 1, background: 'rgba(255,255,255,0.12)', margin: '0 0.5rem', alignSelf: 'stretch' }} />

            {[
              { big: loading ? '…' : String(rows.length), label: 'LÍDERES',      sub: 'EN COMPETENCIA', accent: 'rgba(255,255,255,0.9)' },
              { big: loading ? '…' : String(daysLeft),    label: 'DÍAS',         sub: 'RESTANTES',      accent: '#7EC8E3' },
              { big: loading ? '…' : String(qualified),   label: qualified === 1 ? 'CLASIFICADO' : 'CLASIFICADOS', sub: `≥${minPoints} PTS`, accent: !loading && qualified > 0 ? 'var(--gold)' : 'rgba(255,255,255,0.4)' },
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
          TABLA
      ═══════════════════════════════════════════════════════ */}
      <div className="section-eyebrow" style={{ background: 'var(--light)' }}>
        🏅 Ranking Líderes — {loading ? '…' : rows.length} participantes · gana el top {topN}
      </div>

      <div style={{ padding: '0 1.5rem' }}>
        <div style={{ overflowX: 'auto', borderRadius: '0.75rem', boxShadow: '0 4px 24px rgba(13,22,84,0.12)', border: '1px solid #e2e8f4' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', fontFamily: 'var(--font-body)', fontSize: '0.875rem', minWidth: 820 }}>
            <thead>
              <tr style={{ background: 'var(--navy)' }}>
                {[
                  { label: '#',            w: '3rem',   align: 'center' as const },
                  { label: 'Nombre',       w: 'auto',   align: 'left'   as const },
                  { label: 'Solar',        w: '4.5rem', align: 'center' as const },
                  { label: 'Roofing',      w: '4.5rem', align: 'center' as const },
                  { label: 'Agua',         w: '4.5rem', align: 'center' as const },
                  { label: 'Anker',        w: '4.5rem', align: 'center' as const },
                  { label: 'Pts trainee',  w: '6rem',   align: 'center' as const },
                  { label: 'Total pts',    w: '6.5rem', align: 'center' as const },
                  { label: 'Premio',       w: '6rem',   align: 'center' as const },
                ].map(({ label, w, align }) => (
                  <th key={label} style={{ padding: '0.65rem 0.5rem', fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: '0.68rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.75)', textAlign: align, width: w, whiteSpace: 'nowrap' }}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>

            {loading ? <TableSkeleton /> : (
              <tbody>
                {rows.map((m: LideresLeaderboardRow, i: number) => {
                  const rank     = i + 1
                  // Gana quien está dentro del corte Y llegó al mínimo de puntos.
                  const isWinner = rank <= topN && m.qualified
                  const { icon, color } = rankBadge(rank)
                  const rowBg = isWinner
                    ? (rank <= 3 ? 'rgba(201,162,39,0.14)' : 'rgba(201,162,39,0.06)')
                    : i % 2 === 0 ? '#fff' : '#fafbff'

                  return (
                    <Fragment key={m.zohoId}>
                      {rank === topN + 1 && (
                        <tr>
                          <td colSpan={COLS} style={{
                            padding: '0.3rem 1rem', textAlign: 'center',
                            fontFamily: 'var(--font-cond)', fontWeight: 800,
                            fontSize: '0.6rem', letterSpacing: '0.2em', textTransform: 'uppercase',
                            color: '#aab4cc', background: '#f1f4fb',
                            borderTop: '2px dashed #d7deec', borderBottom: '1px solid #edf0f8',
                          }}>
                            ── corte top {topN} ──
                          </td>
                        </tr>
                      )}
                      <tr style={{ background: rowBg, borderBottom: '1px solid #edf0f8', opacity: rank <= topN ? 1 : 0.62 }}>
                        {/* Rank */}
                        <td style={{ padding: '0.7rem 0.25rem 0.7rem 0.75rem', textAlign: 'center', verticalAlign: 'middle', fontFamily: rank <= 3 ? 'inherit' : 'var(--font-bebas)', fontSize: rank <= 3 ? '1.3rem' : '0.95rem', color, fontWeight: 600, lineHeight: 1 }}>
                          {icon}
                        </td>

                        {/* Nombre */}
                        <td style={{ padding: '0.7rem 0.5rem 0.7rem 1rem', verticalAlign: 'middle' }}>
                          <a href={`/p/${m.zohoId}`} style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--navy)', textDecoration: 'none', fontFamily: 'var(--font-body)' }}>
                            {m.name}
                          </a>
                          {isWinner && (
                            <span style={{ marginLeft: 8, background: 'var(--gold)', color: '#fff', fontFamily: 'var(--font-cond)', fontWeight: 800, fontSize: '0.55rem', letterSpacing: '0.12em', padding: '0.15rem 0.5rem', borderRadius: 999, textTransform: 'uppercase', verticalAlign: 'middle' }}>
                              GANA
                            </span>
                          )}
                          {m.qualified && (
                            <span style={{ marginLeft: 6, background: 'rgba(26,127,75,0.12)', color: '#1a7f4b', fontFamily: 'var(--font-cond)', fontWeight: 800, fontSize: '0.55rem', letterSpacing: '0.1em', padding: '0.15rem 0.5rem', borderRadius: 999, textTransform: 'uppercase', verticalAlign: 'middle' }}>
                              CLASIFICADO
                            </span>
                          )}
                        </td>

                        {/* Ventas por producto (personales + trainee) */}
                        <td style={numTd}>{m.solar   > 0 ? m.solar   : <span style={{ color: '#ccd3e0' }}>—</span>}</td>
                        <td style={numTd}>{m.roofing > 0 ? m.roofing : <span style={{ color: '#ccd3e0' }}>—</span>}</td>
                        <td style={numTd}>{m.water   > 0 ? m.water   : <span style={{ color: '#ccd3e0' }}>—</span>}</td>
                        <td style={numTd}>{m.pps     > 0 ? m.pps     : <span style={{ color: '#ccd3e0' }}>—</span>}</td>

                        {/* Pts de trainee */}
                        <td style={{ ...numTd, color: m.traineePoints > 0 ? 'var(--orange)' : '#ccd3e0' }}>
                          {m.traineePoints > 0 ? fmt(m.traineePoints) : '—'}
                        </td>

                        {/* Total pts */}
                        <td style={{ padding: '0.7rem 0.5rem', textAlign: 'center', verticalAlign: 'middle' }}>
                          <span style={{ fontFamily: 'var(--font-bebas)', fontSize: m.points > 0 ? '1.35rem' : '1rem', letterSpacing: '0.04em', lineHeight: 1, color: isWinner ? 'var(--orange)' : m.points > 0 ? 'var(--navy)' : '#ccd3e0' }}>
                            {m.points > 0 ? fmt(m.points) : '0'}
                          </span>
                          <span style={{ fontSize: '0.62rem', color: '#aab4cc', marginLeft: 2 }}>/{minPoints}</span>
                        </td>

                        {/* Premio de la posición: se muestra a todo el top 15 para que se vea
                            qué está en juego, pero atenuado hasta llegar al mínimo de puntos. */}
                        <td style={{ padding: '0.7rem 1rem 0.7rem 0.5rem', textAlign: 'center', verticalAlign: 'middle' }}>
                          <span
                            title={rank > topN ? 'Fuera del top 15'
                              : m.qualified ? 'Clasificado' : `Necesita ${minPoints} pts para clasificar`}
                            style={{
                              fontFamily: 'var(--font-cond)', fontWeight: 800, fontSize: '0.85rem',
                              color: isWinner ? '#1a7f4b' : '#c3cad8',
                            }}
                          >
                            {rank <= topN ? money(prizes[i] ?? 0) : '—'}
                          </span>
                        </td>
                      </tr>
                    </Fragment>
                  )
                })}

                {!loading && error && (
                  <tr>
                    <td colSpan={COLS} style={{ textAlign: 'center', padding: '3rem', color: '#dc2626', fontFamily: 'var(--font-cond)' }}>
                      Error al cargar datos: {error}
                    </td>
                  </tr>
                )}

                {!loading && !error && rows.length === 0 && (
                  <tr>
                    <td colSpan={COLS} style={{ textAlign: 'center', padding: '3rem', color: 'var(--gray)', fontFamily: 'var(--font-cond)' }}>
                      No hay líderes activos todavía.
                    </td>
                  </tr>
                )}
              </tbody>
            )}
          </table>
        </div>

        {/* Leyenda */}
        <div style={{ marginTop: '1.25rem', display: 'flex', gap: '1.5rem', flexWrap: 'wrap', justifyContent: 'center', fontFamily: 'var(--font-cond)', fontSize: '0.72rem', color: 'var(--gray)', letterSpacing: '0.04em' }}>
          {[
            'Solar = 1 pt · Roofing = 1 pt · Water = ½ pt · Anker = ½ pt',
            'La venta de tu trainee (1ª–4ª) vale lo mismo que la tuya',
            `Clasifican con ≥${minPoints} pts · Ganan los primeros ${topN}`,
            'Solo participan líderes activos (Líder y Empleado - Líder)',
            'Solo cuentan ventas netas: documentos completos y al día',
            'Fecha de corte: 06 enero 2027',
          ].map(t => (
            <span key={t} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#C9A227', display: 'inline-block', flexShrink: 0 }} />
              {t}
            </span>
          ))}
        </div>
      </div>

      {data?.computedAt && (
        <footer className="dashboard-footer">
          Datos de Redshift · Actualizado: {new Date(data.computedAt).toLocaleString('es-PR', { timeZone: 'America/Puerto_Rico' })}
        </footer>
      )}
    </main>
  )
}

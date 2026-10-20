'use client'

import { Fragment } from 'react'
import type { TeslaLeaderboardRow, TeslaRole } from '@/app/api/leaderboard-tesla/route'

// ── Vista de cierre ─────────────────────────────────────────────────────────────
// Top 15 de cada rol con el desglose de puntos de siempre + EPC sumado, que es el
// desempate (ver compareComptesla). Sirve para ver de un vistazo quién gana el
// corte y por qué gana un empate.

const CIERRE_TOP_N = 15
const WIN_N = 10

const ROLES: { role: TeslaRole; label: string }[] = [
  { role: 'consultor', label: 'Consultores' },
  { role: 'lider',     label: 'Líderes' },
  { role: 'gerente',   label: 'Gerentes' },
]

const thStyle: React.CSSProperties = {
  padding: '0.65rem 0.5rem', fontFamily: 'var(--font-cond)', fontWeight: 700,
  fontSize: '0.68rem', letterSpacing: '0.1em', textTransform: 'uppercase',
  color: 'rgba(255,255,255,0.75)', whiteSpace: 'nowrap', textAlign: 'center',
}

const numTd: React.CSSProperties = {
  padding: '0.6rem 0.5rem', textAlign: 'center', verticalAlign: 'middle',
  fontFamily: 'var(--font-cond)', fontWeight: 600, fontSize: '0.9rem', color: 'var(--navy)',
}

const dash = <span style={{ color: '#ccd3e0' }}>—</span>

function fmt(n: number) {
  return n % 1 === 0 ? String(n) : n.toFixed(1)
}

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

// Empata con el de arriba o el de abajo → el EPC decidió el orden.
function isTied(rows: TeslaLeaderboardRow[], i: number) {
  return rows[i - 1]?.points === rows[i].points || rows[i + 1]?.points === rows[i].points
}

function RoleTable({ label, rows, minVentas }: { label: string; rows: TeslaLeaderboardRow[]; minVentas: number }) {
  const top = rows.slice(0, CIERRE_TOP_N)

  return (
    <section style={{ marginBottom: '2rem' }}>
      <div className="section-eyebrow" style={{ background: 'var(--light)' }}>
        🏁 {label} — top {CIERRE_TOP_N} · ganan los primeros {WIN_N}
      </div>
      <div style={{ overflowX: 'auto', borderRadius: '0.75rem', boxShadow: '0 4px 24px rgba(13,22,84,0.12)', border: '1px solid #e2e8f4' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', fontFamily: 'var(--font-body)', fontSize: '0.875rem', minWidth: 820 }}>
          <thead>
            <tr style={{ background: 'var(--navy)' }}>
              <th style={{ ...thStyle, width: '3rem' }}>#</th>
              <th style={{ ...thStyle, textAlign: 'left', paddingLeft: '1rem' }}>Nombre</th>
              <th style={thStyle}>Bat.+Solar</th>
              <th style={thStyle}>Bat. sola</th>
              <th style={thStyle}>Asist.</th>
              <th style={thStyle}>Ventas</th>
              <th style={thStyle}>Total pts</th>
              <th style={thStyle}>EPC total</th>
            </tr>
          </thead>
          <tbody>
            {top.map((m, i) => {
              const rank = i + 1
              const isWinner = rank <= WIN_N
              const tied = isTied(top, i)
              return (
                <Fragment key={m.zohoId}>
                  {rank === WIN_N + 1 && (
                    <tr>
                      <td colSpan={8} style={{ padding: '0.3rem 1rem', textAlign: 'center', fontFamily: 'var(--font-cond)', fontWeight: 800, fontSize: '0.6rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: '#aab4cc', background: '#f1f4fb', borderTop: '2px dashed #d7deec' }}>
                        ── corte top {WIN_N} ──
                      </td>
                    </tr>
                  )}
                  <tr style={{ background: isWinner ? 'rgba(245,166,35,0.05)' : i % 2 === 0 ? '#fff' : '#fafbff', borderBottom: '1px solid #edf0f8' }}>
                    <td style={{ ...numTd, fontFamily: 'var(--font-bebas)', color: 'var(--gray)' }}>{rank}</td>
                    <td style={{ padding: '0.6rem 0.5rem 0.6rem 1rem', verticalAlign: 'middle' }}>
                      <a href={`/p/${m.zohoId}`} style={{ fontWeight: 600, color: 'var(--navy)', textDecoration: 'none' }}>{m.name}</a>
                      {m.ventas < minVentas && (
                        <span style={{ marginLeft: 6, background: 'rgba(220,38,38,0.1)', color: '#dc2626', fontFamily: 'var(--font-cond)', fontWeight: 800, fontSize: '0.55rem', letterSpacing: '0.1em', padding: '0.15rem 0.5rem', borderRadius: 999, textTransform: 'uppercase' }}>
                          &lt;{minVentas} ventas
                        </span>
                      )}
                    </td>
                    <td style={numTd}>{m.bateriaConSolar || dash}</td>
                    <td style={numTd}>{m.bateriaSola || dash}</td>
                    <td style={{ ...numTd, color: m.asistida ? 'var(--orange)' : undefined }}>{m.asistida || dash}</td>
                    <td style={numTd}>{m.ventas}<span style={{ fontSize: '0.62rem', color: '#aab4cc', marginLeft: 2 }}>/{minVentas}</span></td>
                    <td style={{ ...numTd, fontFamily: 'var(--font-bebas)', fontSize: '1.25rem', color: isWinner ? 'var(--orange)' : 'var(--navy)' }}>
                      {fmt(m.points)}
                    </td>
                    <td style={{ ...numTd, fontWeight: tied ? 800 : 600 }} title={tied ? 'Empate en puntos: desempata el EPC' : undefined}>
                      {money(m.epc)}
                      {tied && <span style={{ marginLeft: 4, fontSize: '0.55rem', color: 'var(--blue)', letterSpacing: '0.1em' }}>EMPATE</span>}
                    </td>
                  </tr>
                </Fragment>
              )
            })}
            {top.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray)', fontFamily: 'var(--font-cond)' }}>Sin participantes.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default function CierreView({ rows, minVentas, note }: { rows: TeslaLeaderboardRow[]; minVentas: number; note?: string }) {
  return (
    <div style={{ padding: '0 1.5rem' }}>
      {ROLES.map(({ role, label }) => (
        <RoleTable key={role} label={label} rows={rows.filter(r => r.role === role)} minVentas={minVentas} />
      ))}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--font-cond)', fontSize: '0.72rem', color: 'var(--gray)', textAlign: 'center' }}>
        <span>Empate en puntos → gana el mayor EPC total (suma del monto de sus ventas Tesla válidas)</span>
        {note && <span style={{ fontSize: '0.66rem' }}>{note}</span>}
      </div>
    </div>
  )
}

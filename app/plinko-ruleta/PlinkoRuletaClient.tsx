'use client'

import { useEffect, useState } from 'react'
import type { PlinkoRuletaResponse, PrizeRow, PrizeRole } from '@/app/api/plinko-ruleta/route'
import type { DealDetail } from '@/app/api/plinko-ruleta/deals/route'
import { PLINKO_POINTS } from '@/lib/config'

// ── Style helpers ──────────────────────────────────────────────────────────────
const numTd: React.CSSProperties = {
  padding: '0.7rem 0.5rem', textAlign: 'center', verticalAlign: 'middle',
  fontFamily: 'var(--font-cond)', fontWeight: 600, fontSize: '0.9rem',
  color: 'var(--navy)', letterSpacing: '0.02em',
}
function rankBadge(rank: number) {
  if (rank === 1) return { icon: '🥇', color: '#F5A623' }
  if (rank === 2) return { icon: '🥈', color: '#9AA5B4' }
  if (rank === 3) return { icon: '🥉', color: '#C87941' }
  return { icon: String(rank), color: 'var(--gray)' }
}

const ROLE_TABS: { role: PrizeRole; label: string }[] = [
  { role: 'consultor', label: 'Consultores' },
  { role: 'lider',     label: 'Líderes' },
  { role: 'gerente',   label: 'Gerentes' },
]

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MESES_LARGO = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

function fmtDay(iso: string) {
  const d = new Date(iso + 'T00:00:00Z')
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`
}
function monthLabel(yyyymm: string) {
  const [y, m] = yyyymm.split('-')
  return `${MESES_LARGO[Number(m) - 1]} ${y}`
}
function monthLastDay(yyyymm: string) {
  const [y, m] = yyyymm.split('-')
  const d = new Date(Number(y), Number(m), 0).getDate()
  return `${yyyymm}-${String(d).padStart(2, '0')}`
}
function fmtMoney(n: number | null) {
  if (n == null) return '—'
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

// Lista de meses: ene-2026 → mes actual
function availableMonths(): string[] {
  const out: string[] = []
  const now = new Date()
  const endY = now.getFullYear(), endM = now.getMonth() + 1
  for (let y = 2026; y <= endY; y++) {
    const mMax = y === endY ? endM : 12
    for (let m = 1; m <= mMax; m++) out.push(`${y}-${String(m).padStart(2, '0')}`)
  }
  return out.reverse()   // más reciente primero
}

type Mode = 'plinko' | 'ruleta'

export default function PlinkoRuletaClient() {
  const MONTHS = availableMonths()
  const [month, setMonth]         = useState<string>(MONTHS[0])
  const [mode, setMode]           = useState<Mode>('ruleta')
  const [weekIdx, setWeekIdx]     = useState(0)
  const [activeRole, setActiveRole] = useState<PrizeRole>('consultor')
  const [data, setData]           = useState<PlinkoRuletaResponse | null>(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [detailRow, setDetailRow]     = useState<PrizeRow | null>(null)
  const [detailDeals, setDetailDeals] = useState<DealDetail[] | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    setLoading(true); setError(null)
    fetch(`/api/plinko-ruleta?month=${month}`)
      .then(r => r.json())
      .then((d: PlinkoRuletaResponse & { error?: string }) => {
        if (d.error) { setError(d.error); return }
        setData(d); setWeekIdx(0)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [month])

  const weeks   = data?.plinko ?? []
  const wIdx    = Math.min(weekIdx, Math.max(0, weeks.length - 1))
  const bg      = mode === 'plinko' ? '/Plinko.jpeg' : '/Ruleta.png'
  const accent  = mode === 'plinko' ? 'var(--blue)' : 'var(--gold)'

  // Filas del periodo activo (Ruleta = mes · Plinko = semana seleccionada)
  const periodRows: PrizeRow[] = mode === 'ruleta'
    ? (data?.ruleta ?? [])
    : (weeks[wIdx]?.rows ?? [])

  const roleRows = periodRows.filter(r => r.role === activeRole)
  const fcRows   = roleRows.filter(r => !r.isEmpleado)
  const empRows  = roleRows.filter(r => r.isEmpleado)

  // Rango del periodo activo (Ruleta = mes · Plinko = semana seleccionada)
  const periodStart = mode === 'ruleta' ? `${month}-01`          : (weeks[wIdx]?.weekStart ?? `${month}-01`)
  const periodEnd   = mode === 'ruleta' ? monthLastDay(month)    : (weeks[wIdx]?.weekEnd   ?? monthLastDay(month))
  const periodLabel = mode === 'ruleta' ? monthLabel(month)      : (weeks[wIdx] ? `Semana ${wIdx + 1} (${fmtDay(weeks[wIdx].weekStart)}–${fmtDay(weeks[wIdx].weekEnd)})` : '')

  function openDetail(row: PrizeRow) {
    setDetailRow(row); setDetailDeals(null); setDetailLoading(true)
    fetch(`/api/plinko-ruleta/deals?zohoId=${row.zohoId}&start=${periodStart}&end=${periodEnd}&mode=${mode}`)
      .then(r => r.json())
      .then((d: { deals?: DealDetail[] }) => setDetailDeals(d.deals ?? []))
      .catch(() => setDetailDeals([]))
      .finally(() => setDetailLoading(false))
  }

  // Metas por rol para la leyenda del modo activo
  const metaFor = (role: PrizeRole): number => {
    const sample = periodRows.find(r => r.role === role)
    if (sample) return sample.meta
    // fallback estático si no hay filas
    if (mode === 'plinko') return role === 'consultor' ? 2 : 3
    const mm = Number(month.slice(5, 7)); const hi = mm >= 4 && mm <= 9
    return role === 'consultor' ? (hi ? 6 : 4) : role === 'lider' ? (hi ? 8 : 6) : (hi ? 10 : 8)
  }

  return (
    <main style={{ minHeight: '100vh', background: 'var(--light)', paddingBottom: '3rem' }}>
      <style>{`@keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.4 } }`}</style>

      {/* ═══════════════ HERO ═══════════════ */}
      <section style={{ position: 'relative', minHeight: 420, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${bg})`, backgroundSize: 'cover', backgroundPosition: 'center 40%' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(120deg, rgba(13,22,84,0.92) 0%, rgba(13,22,84,0.55) 45%, rgba(13,22,84,0.15) 100%)' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 20%, rgba(13,22,84,0.65) 55%, rgba(13,22,84,0.97) 100%)' }} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(to right, var(--orange), var(--gold), var(--orange))' }} />

        {/* Navbar */}
        <header style={{ position: 'relative', zIndex: 3, padding: '1.1rem 2rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <img src="/windmar-logo-rev.png" alt="Windmar" style={{ height: '2rem', objectFit: 'contain', flexShrink: 0 }} />
          <span style={{ background: 'var(--orange)', color: '#fff', fontFamily: 'var(--font-cond)', fontWeight: 800, fontSize: '0.58rem', letterSpacing: '0.22em', textTransform: 'uppercase', padding: '0.22rem 0.7rem', borderRadius: 3 }}>PREMIACIONES</span>
          <nav style={{ marginLeft: 'auto', display: 'flex', gap: '1.25rem' }}>
            {[['/leaderboard', 'Crucero →'], ['/leaderboard-tesla', 'Competencia Tesla →'], ['/leaderboard-lideres', 'Competencia Líderes →'], ['/search', 'Buscar vendedor →']].map(([href, txt]) => (
              <a key={href} href={href} style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)', textDecoration: 'none' }}>{txt}</a>
            ))}
          </nav>
        </header>

        {/* Título */}
        <div style={{ position: 'relative', zIndex: 3, padding: '0 2rem 1.75rem', marginTop: 'auto' }}>
          <div style={{ fontFamily: 'var(--font-bebas)', fontSize: 'clamp(3.5rem, 11vw, 7rem)', color: '#fff', letterSpacing: '0.04em', lineHeight: 0.85, textShadow: '0 4px 40px rgba(0,0,0,0.8)' }}>PLINKO & RULETA</div>
          <p style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: '0.68rem', letterSpacing: '0.24em', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', marginTop: '0.4rem' }}>
            GANADORES POR ROL &nbsp;·&nbsp; {mode === 'plinko' ? 'PREMIO SEMANAL' : 'PREMIO MENSUAL'} &nbsp;·&nbsp; {monthLabel(month)}
          </p>
        </div>
      </section>

      {/* ═══════════════ CONTROLES ═══════════════ */}
      <div style={{ padding: '1.25rem 1.5rem 0', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Toggle modo */}
        <div style={{ display: 'flex', borderRadius: 999, overflow: 'hidden', border: '1px solid #d7deec' }}>
          {(['ruleta', 'plinko'] as Mode[]).map(m => (
            <button key={m} onClick={() => setMode(m)} style={{
              fontFamily: 'var(--font-cond)', fontWeight: 800, fontSize: '0.8rem', letterSpacing: '0.08em',
              textTransform: 'uppercase', padding: '0.55rem 1.5rem', cursor: 'pointer', border: 'none',
              background: mode === m ? 'var(--navy)' : '#fff', color: mode === m ? '#fff' : 'var(--gray)', transition: 'all 0.15s',
            }}>{m === 'ruleta' ? '🎡 Ruleta' : '🎯 Plinko'}</button>
          ))}
        </div>

        {/* Selector de mes */}
        <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem', fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: '0.72rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gray)' }}>
          Mes:
          <select value={month} onChange={e => setMonth(e.target.value)} style={{
            fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: '0.85rem', color: 'var(--navy)',
            padding: '0.45rem 0.75rem', borderRadius: 8, border: '1px solid #d7deec', background: '#fff', cursor: 'pointer',
          }}>
            {MONTHS.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        </label>
      </div>

      {/* Selector de semana (solo Plinko) */}
      {mode === 'plinko' && (
        <div style={{ padding: '1rem 1.5rem 0', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: '0.72rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gray)', marginRight: '0.25rem' }}>Semana:</span>
          {weeks.map((w, i) => (
            <button key={w.weekStart} onClick={() => setWeekIdx(i)} style={{
              fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: '0.72rem', letterSpacing: '0.04em',
              padding: '0.4rem 0.85rem', borderRadius: 8, cursor: 'pointer',
              border: i === wIdx ? '1px solid var(--blue)' : '1px solid #d7deec',
              background: i === wIdx ? 'var(--blue)' : '#fff', color: i === wIdx ? '#fff' : 'var(--gray)',
            }}>Sem {i + 1} · {fmtDay(w.weekStart)}–{fmtDay(w.weekEnd)}</button>
          ))}
        </div>
      )}

      {/* ═══════════════ TARJETAS DE GANADORES POR ROL ═══════════════ */}
      <div className="section-eyebrow" style={{ background: 'var(--light)' }}>
        🏆 Ganadores {mode === 'plinko' ? `— Semana ${wIdx + 1} (${weeks[wIdx] ? `${fmtDay(weeks[wIdx].weekStart)}–${fmtDay(weeks[wIdx].weekEnd)}` : '—'})` : `— ${monthLabel(month)}`}
      </div>
      <div style={{ padding: '0 1.5rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        {ROLE_TABS.map(({ role, label }) => {
          const rr = periodRows.filter(r => r.role === role && r.clasificado)
          const fc = rr.filter(r => !r.isEmpleado).length
          const emp = rr.filter(r => r.isEmpleado).length
          return (
            <div key={role} style={{ flex: '1 1 200px', background: '#fff', border: '1px solid #e2e8f4', borderRadius: 12, padding: '1rem 1.25rem', boxShadow: '0 2px 12px rgba(13,22,84,0.06)' }}>
              <div style={{ fontFamily: 'var(--font-cond)', fontWeight: 800, fontSize: '0.65rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--gray)' }}>{label}</div>
              <div style={{ fontFamily: 'var(--font-bebas)', fontSize: '2.6rem', lineHeight: 1, color: rr.length > 0 ? accent : '#ccd3e0', margin: '0.2rem 0' }}>{loading ? '…' : rr.length}</div>
              <div style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: '0.62rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--gray)' }}>
                clasificados · <span style={{ color: 'var(--navy)' }}>{fc}</span> full comm · <span style={{ color: 'var(--navy)' }}>{emp}</span> empleados
              </div>
            </div>
          )
        })}
      </div>

      {/* ═══════════════ PESTAÑAS DE ROL ═══════════════ */}
      <div style={{ padding: '1.25rem 1.5rem 0', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {ROLE_TABS.map(({ role, label }) => {
          const isActive = role === activeRole
          const count = periodRows.filter(r => r.role === role).length
          return (
            <button key={role} onClick={() => setActiveRole(role)} style={{
              fontFamily: 'var(--font-cond)', fontWeight: 800, fontSize: '0.8rem', letterSpacing: '0.08em', textTransform: 'uppercase',
              padding: '0.55rem 1.25rem', borderRadius: 999, cursor: 'pointer',
              border: isActive ? '1px solid var(--navy)' : '1px solid #d7deec',
              background: isActive ? 'var(--navy)' : '#fff', color: isActive ? '#fff' : 'var(--gray)', transition: 'all 0.15s',
            }}>
              {label}<span style={{ marginLeft: 8, fontSize: '0.7rem', color: isActive ? 'rgba(255,255,255,0.6)' : '#aab4cc' }}>{loading ? '' : count}</span>
            </button>
          )
        })}
      </div>

      {/* ═══════════════ TABLAS FC / EMPLEADOS ═══════════════ */}
      <div style={{ padding: '1rem 1.5rem 0', display: 'flex', gap: '1.25rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <PrizeTable title="Full Commission" rows={fcRows} accent={accent} loading={loading} onOpen={openDetail} />
        <PrizeTable title="Empleados"       rows={empRows} accent={accent} loading={loading} onOpen={openDetail} />
      </div>

      {error && (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#dc2626', fontFamily: 'var(--font-cond)' }}>Error al cargar datos: {error}</div>
      )}

      {/* Leyenda */}
      <div style={{ marginTop: '1.5rem', padding: '0 1.5rem', display: 'flex', gap: '1.5rem', flexWrap: 'wrap', justifyContent: 'center', fontFamily: 'var(--font-cond)', fontSize: '0.72rem', color: 'var(--gray)', letterSpacing: '0.04em' }}>
        {[
          `${mode === 'plinko' ? 'Meta semanal' : 'Meta mensual'}: Consultor ${metaFor('consultor')} · Líder ${metaFor('lider')} · Gerente ${metaFor('gerente')} ventas`,
          mode === 'plinko'
            ? 'Cuentan: Solar y Roofing (1 pto) · Anker y Water (½ pto)'
            : 'Cuentan: Solar (res. + com.) y Roofing',
          'Clasificado = alcanzó su meta en el periodo',
          '⚠️ La lista oficial y final se publica en los respectivos chats',
        ].map(t => (
          <span key={t} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--orange)', display: 'inline-block', flexShrink: 0 }} />{t}
          </span>
        ))}
      </div>

      {data?.computedAt && (
        <footer className="dashboard-footer">
          Datos de Redshift · Actualizado: {new Date(data.computedAt).toLocaleString('es-PR', { timeZone: 'America/Puerto_Rico' })}
        </footer>
      )}

      {/* ═══════════════ MODAL DE DESGLOSE ═══════════════ */}
      {detailRow && (
        <DealsModal
          row={detailRow}
          periodLabel={periodLabel}
          deals={detailDeals}
          loading={detailLoading}
          mode={mode}
          onClose={() => setDetailRow(null)}
        />
      )}
    </main>
  )
}

// ── Modal con el desglose de las ventas que componen el conteo ──────────────────
function plinkoPts(pipeline: string | null): number {
  return PLINKO_POINTS[(pipeline ?? '').toLowerCase()] ?? 0
}

function DealsModal({ row, periodLabel, deals, loading, mode, onClose }: {
  row: PrizeRow; periodLabel: string; deals: DealDetail[] | null; loading: boolean; mode: Mode; onClose: () => void
}) {
  const showPts = mode === 'plinko'
  const th: React.CSSProperties = { padding: '0.55rem 0.7rem', textAlign: 'left', fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: '0.62rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.75)', background: 'var(--navy)', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '0.55rem 0.7rem', fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--navy)', borderBottom: '1px solid #edf0f8', whiteSpace: 'nowrap' }
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(13,22,84,0.55)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, maxWidth: 860, width: '100%', maxHeight: '85vh', overflow: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.4)' }}>
        {/* Header */}
        <div style={{ padding: '1.1rem 1.4rem', borderBottom: '1px solid #e2e8f4', display: 'flex', alignItems: 'flex-start', gap: '1rem', position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-bebas)', fontSize: '1.5rem', color: 'var(--navy)', letterSpacing: '0.03em', lineHeight: 1.1 }}>{row.name}</div>
            <div style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: '0.72rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--gray)', marginTop: 2 }}>
              {periodLabel} · {row.ventas} venta{row.ventas === 1 ? '' : 's'} elegible{row.ventas === 1 ? '' : 's'} (meta {row.meta})
            </div>
          </div>
          <button onClick={onClose} style={{ marginLeft: 'auto', border: 'none', background: '#eef1f9', color: 'var(--navy)', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1, flexShrink: 0 }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: '0.5rem 0.4rem 1rem' }}>
          {loading ? (
            <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--gray)', fontFamily: 'var(--font-cond)' }}>Cargando desglose…</div>
          ) : !deals || deals.length === 0 ? (
            <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--gray)', fontFamily: 'var(--font-cond)' }}>Sin ventas elegibles en este periodo.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 780 }}>
                <thead>
                  <tr>
                    {['Caso', 'Closing date', 'Pipeline', ...(showPts ? ['Puntos'] : []), 'Amount', 'Sales rep', 'All Sales Docs Rec.', 'On hold Status'].map(h => (
                      <th key={h} style={th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {deals.map((d, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fafbff' }}>
                      <td style={{ ...td, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--navy)' }}>{d.caseNumber ?? '—'}</td>
                      <td style={td}>{d.closingDate ?? '—'}</td>
                      <td style={{ ...td, textTransform: 'capitalize' }}>{d.pipeline ?? '—'}</td>
                      {showPts && (
                        <td style={{ ...td, fontWeight: 700, textAlign: 'center' }}>
                          {plinkoPts(d.pipeline) === 0.5 ? '½' : plinkoPts(d.pipeline)}
                        </td>
                      )}
                      <td style={{ ...td, fontWeight: 600 }}>{fmtMoney(d.amount)}</td>
                      <td style={td}>{d.salesRep ?? '—'}</td>
                      <td style={{ ...td, color: '#aab4cc' }}>{d.allSalesDocs ?? 'n/d'}</td>
                      <td style={td}>{d.onHoldStatus
                        ? <span style={{ background: 'rgba(232,33,39,0.12)', color: '#c62828', fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: '0.66rem', padding: '0.12rem 0.5rem', borderRadius: 999 }}>{d.onHoldStatus}</span>
                        : <span style={{ color: '#9fb0c9' }}>—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{ fontFamily: 'var(--font-cond)', fontSize: '0.68rem', color: '#aab4cc', letterSpacing: '0.03em', padding: '0.75rem 0.7rem 0' }}>
                “All Sales Docs Received” aún no está disponible en el warehouse (n/d). Se muestran las ventas activas elegibles del periodo{showPts ? ' — Solar y Roofing (1 pto) · Anker y Water (½ pto)' : ' (Solar + Roofing)'}.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Tabla de premios (una por segmento FC / Empleados) ──────────────────────────
function PrizeTable({ title, rows, accent, loading, onOpen }: { title: string; rows: PrizeRow[]; accent: string; loading: boolean; onOpen: (row: PrizeRow) => void }) {
  return (
    <div style={{ flex: '1 1 340px', minWidth: 300 }}>
      <div style={{ fontFamily: 'var(--font-cond)', fontWeight: 800, fontSize: '0.7rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--navy)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        {title}
        <span style={{ background: '#eef1f9', color: 'var(--gray)', borderRadius: 999, padding: '0.1rem 0.55rem', fontSize: '0.62rem' }}>{loading ? '…' : rows.length}</span>
      </div>
      <div style={{ overflowX: 'auto', borderRadius: '0.75rem', boxShadow: '0 4px 24px rgba(13,22,84,0.10)', border: '1px solid #e2e8f4' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', fontFamily: 'var(--font-body)', fontSize: '0.875rem', minWidth: 300 }}>
          <thead>
            <tr style={{ background: 'var(--navy)' }}>
              {[['#', 'center'], ['Nombre', 'left'], ['Ventas', 'center'], ['Estado', 'center']].map(([label, align]) => (
                <th key={label} style={{ padding: '0.6rem 0.5rem', fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: '0.66rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.75)', textAlign: align as 'left' | 'center', whiteSpace: 'nowrap' }}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #edf0f8' }}>
                  {Array.from({ length: 4 }).map((_, j) => (
                    <td key={j} style={{ padding: '0.7rem 0.5rem' }}><div style={{ height: 13, borderRadius: 4, background: '#e8eef8', animation: 'pulse 1.5s ease-in-out infinite', width: j === 1 ? '80%' : '50%', margin: j === 1 ? 0 : '0 auto' }} /></td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr><td colSpan={4} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--gray)', fontFamily: 'var(--font-cond)' }}>Sin participantes en este periodo.</td></tr>
            ) : rows.map((m, i) => {
              const { icon, color } = rankBadge(i + 1)
              const rowBg = m.clasificado ? 'rgba(245,166,35,0.09)' : i % 2 === 0 ? '#fff' : '#fafbff'
              return (
                <tr key={m.zohoId} style={{ background: rowBg, borderBottom: '1px solid #edf0f8' }}>
                  <td style={{ padding: '0.7rem 0.25rem 0.7rem 0.75rem', textAlign: 'center', fontFamily: i < 3 ? 'inherit' : 'var(--font-bebas)', fontSize: i < 3 ? '1.2rem' : '0.9rem', color, lineHeight: 1 }}>{icon}</td>
                  <td style={{ padding: '0.7rem 0.5rem 0.7rem 1rem' }}>
                    <a href={`/p/${m.zohoId}`} style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--navy)', textDecoration: 'none' }}>{m.name}</a>
                  </td>
                  <td style={{ ...numTd, padding: 0 }}>
                    <button
                      onClick={() => onOpen(m)}
                      title="Ver desglose de ventas"
                      style={{
                        width: '100%', height: '100%', padding: '0.7rem 0.5rem', border: 'none', background: 'transparent',
                        cursor: 'pointer', fontFamily: 'var(--font-cond)', letterSpacing: '0.02em',
                        fontWeight: m.clasificado ? 800 : 600, fontSize: '0.9rem',
                        color: m.clasificado ? accent : 'var(--blue)', textDecoration: 'underline', textUnderlineOffset: 3, textDecorationColor: '#c7d2ea',
                      }}
                    >
                      {m.ventas}<span style={{ fontSize: '0.62rem', color: '#aab4cc', marginLeft: 2, textDecoration: 'none' }}>/{m.meta}</span>
                    </button>
                  </td>
                  <td style={{ padding: '0.7rem 0.5rem', textAlign: 'center' }}>
                    {m.clasificado
                      ? <span style={{ background: 'var(--gold)', color: '#fff', fontFamily: 'var(--font-cond)', fontWeight: 800, fontSize: '0.55rem', letterSpacing: '0.1em', padding: '0.15rem 0.5rem', borderRadius: 999, textTransform: 'uppercase' }}>CLASIFICADO ✓</span>
                      : <span style={{ color: '#ccd3e0', fontFamily: 'var(--font-cond)', fontSize: '0.7rem' }}>—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

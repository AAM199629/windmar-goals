'use client'

import { useEffect, useState } from 'react'
import type { PromotoresResponse, PromotorSummaryRow } from '@/app/api/promotores/route'
import type { PromotorLeadDetail, PromotorLeadsType } from '@/app/api/promotor/[zohoId]/leads/route'

const MESES_LARGO = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

function monthLabel(yyyymm: string) {
  const [y, m] = yyyymm.split('-')
  return `${MESES_LARGO[Number(m) - 1]} ${y}`
}

function availableMonths(): string[] {
  const out: string[] = []
  const now = new Date()
  const endY = now.getFullYear(), endM = now.getMonth() + 1
  for (let y = 2024; y <= endY; y++) {
    const mMax = y === endY ? endM : 12
    for (let m = 1; m <= mMax; m++) out.push(`${y}-${String(m).padStart(2, '0')}`)
  }
  return out.reverse()
}

function currentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

const numTd: React.CSSProperties = {
  padding: '0.7rem 0.6rem', textAlign: 'center', verticalAlign: 'middle',
  fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: '0.95rem', color: 'var(--navy)',
}

const TYPE_LABEL: Record<PromotorLeadsType, string> = {
  creados:  'Leads creados',
  citas:    'Citas creadas',
  vendidos: 'Casos vendidos',
  semana:   'Leads esta semana',
}

interface DetailState {
  promotor: PromotorSummaryRow
  type:     PromotorLeadsType
}

export default function PromotoresClient() {
  const MONTHS = availableMonths()
  const [month, setMonth]     = useState<string>(currentMonth())
  const [data, setData]       = useState<PromotoresResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [detail, setDetail]       = useState<DetailState | null>(null)
  const [detailRows, setDetailRows] = useState<PromotorLeadDetail[] | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  function openDetail(promotor: PromotorSummaryRow, type: PromotorLeadsType, count: number) {
    if (count <= 0) return
    setDetail({ promotor, type }); setDetailRows(null); setDetailLoading(true)
    fetch(`/api/promotor/${promotor.zohoId}/leads?type=${type}&month=${month}`)
      .then(r => r.json())
      .then((d: { rows?: PromotorLeadDetail[] }) => setDetailRows(d.rows ?? []))
      .catch(() => setDetailRows([]))
      .finally(() => setDetailLoading(false))
  }

  useEffect(() => {
    setLoading(true); setError(null)
    fetch(`/api/promotores?month=${month}`)
      .then(r => r.json())
      .then((d: PromotoresResponse & { error?: string }) => {
        if (d.error) { setError(d.error); return }
        setData(d)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [month])

  const rows = data?.rows ?? []
  const weeklyTarget = data?.weeklyTarget ?? 25
  const totals = rows.reduce(
    (t, r) => ({ leads: t.leads + r.leadsCreados, citas: t.citas + r.citasCreadas, vendidos: t.vendidos + r.casosVendidos, semana: t.semana + r.leadsSemana }),
    { leads: 0, citas: 0, vendidos: 0, semana: 0 },
  )
  const fmtDay = (iso?: string) => {
    if (!iso) return ''
    const [, m, d] = iso.split('-')
    return `${Number(d)} ${['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][Number(m) - 1]}`
  }

  return (
    <main style={{ minHeight: '100vh', background: 'var(--light)', paddingBottom: '3rem' }}>
      <style>{`@keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.4 } }`}</style>

      {/* ═══════════════ HERO ═══════════════ */}
      <section style={{ position: 'relative', minHeight: 300, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'linear-gradient(120deg, #0D1654 0%, #123089 55%, #1565C0 100%)' }}>
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(to right, var(--orange), var(--gold), var(--orange))' }} />

        <header style={{ position: 'relative', zIndex: 3, padding: '1.1rem 2rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <img src="/windmar-logo-rev.png" alt="Windmar" style={{ height: '2rem', objectFit: 'contain', flexShrink: 0 }} />
          <span style={{ background: 'var(--orange)', color: '#fff', fontFamily: 'var(--font-cond)', fontWeight: 800, fontSize: '0.58rem', letterSpacing: '0.22em', textTransform: 'uppercase', padding: '0.22rem 0.7rem', borderRadius: 3 }}>PROMOTORES</span>
          <nav style={{ marginLeft: 'auto', display: 'flex', gap: '1.25rem' }}>
            {[['/plinko-ruleta', 'Plinko & Ruleta →'], ['/search', 'Buscar →']].map(([href, txt]) => (
              <a key={href} href={href} style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)', textDecoration: 'none' }}>{txt}</a>
            ))}
          </nav>
        </header>

        <div style={{ position: 'relative', zIndex: 3, padding: '0 2rem 1.75rem', marginTop: 'auto' }}>
          <div style={{ fontFamily: 'var(--font-bebas)', fontSize: 'clamp(3rem, 9vw, 5.5rem)', color: '#fff', letterSpacing: '0.04em', lineHeight: 0.9, textShadow: '0 4px 40px rgba(0,0,0,0.6)' }}>PROMOTORES</div>
          <p style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: '0.68rem', letterSpacing: '0.24em', color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', marginTop: '0.4rem' }}>
            LEADS &amp; CITAS GENERADAS &nbsp;·&nbsp; {monthLabel(month)}
          </p>
        </div>
      </section>

      {/* ═══════════════ CONTROLES ═══════════════ */}
      <div style={{ padding: '1.25rem 1.5rem 0', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
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

      {/* Resumen global */}
      <div style={{ padding: '1rem 1.5rem 0', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        {[
          { label: 'Promotores activos', value: rows.length, accent: 'var(--navy)' },
          { label: 'Leads creados', value: totals.leads, accent: 'var(--blue)' },
          { label: 'Citas creadas', value: totals.citas, accent: 'var(--orange)' },
          { label: 'Casos vendidos', value: totals.vendidos, accent: '#1c7a43' },
          { label: `Leads esta semana${data?.week ? ` (${fmtDay(data.week.start)}–${fmtDay(data.week.end)})` : ''}`, value: totals.semana, accent: 'var(--gold)' },
        ].map(c => (
          <div key={c.label} style={{ flex: '1 1 180px', background: '#fff', border: '1px solid #e2e8f4', borderRadius: 12, padding: '1rem 1.25rem', boxShadow: '0 2px 12px rgba(13,22,84,0.06)' }}>
            <div style={{ fontFamily: 'var(--font-cond)', fontWeight: 800, fontSize: '0.65rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--gray)' }}>{c.label}</div>
            <div style={{ fontFamily: 'var(--font-bebas)', fontSize: '2.6rem', lineHeight: 1, color: c.accent, margin: '0.2rem 0' }}>{loading ? '…' : c.value}</div>
          </div>
        ))}
      </div>

      {error && (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#dc2626', fontFamily: 'var(--font-cond)' }}>Error al cargar datos: {error}</div>
      )}

      {/* ═══════════════ TABLA ═══════════════ */}
      <div className="section-eyebrow" style={{ background: 'var(--light)' }}>📋 Detalle por promotor — {monthLabel(month)}</div>
      <div style={{ padding: '0 1.5rem' }}>
        <div style={{ overflowX: 'auto', borderRadius: '0.75rem', boxShadow: '0 4px 24px rgba(13,22,84,0.10)', border: '1px solid #e2e8f4' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', minWidth: 520 }}>
            <thead>
              <tr style={{ background: 'var(--navy)' }}>
                {[['Promotor', 'left'], ['Leads creados', 'center'], ['Citas creadas', 'center'], ['Casos vendidos', 'center'], [`Esta semana (meta ${weeklyTarget})`, 'center']].map(([label, align]) => (
                  <th key={label} style={{ padding: '0.6rem 0.6rem', fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: '0.66rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.75)', textAlign: align as 'left' | 'center', whiteSpace: 'nowrap' }}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #edf0f8' }}>
                    {Array.from({ length: 5 }).map((_, j) => (
                      <td key={j} style={{ padding: '0.7rem 0.6rem' }}><div style={{ height: 13, borderRadius: 4, background: '#e8eef8', animation: 'pulse 1.5s ease-in-out infinite', width: j === 0 ? '70%' : '40%', margin: j === 0 ? 0 : '0 auto' }} /></td>
                    ))}
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--gray)', fontFamily: 'var(--font-cond)' }}>Sin actividad de promotores en {monthLabel(month)}.</td></tr>
              ) : rows.map((r: PromotorSummaryRow, i) => {
                const metaOk = r.leadsSemana >= weeklyTarget
                return (
                <tr key={r.zohoId} style={{ background: i % 2 === 0 ? '#fff' : '#fafbff', borderBottom: '1px solid #edf0f8' }}>
                  <td style={{ padding: '0.7rem 0.6rem 0.7rem 1rem' }}>
                    <a href={`/p/${r.zohoId}`} style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: '0.88rem', color: 'var(--navy)', textDecoration: 'none' }}>{r.name}</a>
                  </td>
                  <CellNum value={r.leadsCreados} color="var(--navy)" onClick={() => openDetail(r, 'creados', r.leadsCreados)} />
                  <CellNum value={r.citasCreadas} color={r.citasCreadas > 0 ? 'var(--orange)' : '#ccd3e0'} onClick={() => openDetail(r, 'citas', r.citasCreadas)} />
                  <CellNum value={r.casosVendidos} color={r.casosVendidos > 0 ? '#1c7a43' : '#ccd3e0'} onClick={() => openDetail(r, 'vendidos', r.casosVendidos)} />
                  <CellNum
                    value={r.leadsSemana}
                    color={metaOk ? '#1c7a43' : r.leadsSemana > 0 ? 'var(--navy)' : '#ccd3e0'}
                    suffix={<><span style={{ fontSize: '0.62rem', color: '#aab4cc', marginLeft: 2, textDecoration: 'none' }}>/{weeklyTarget}</span>{metaOk && <span style={{ marginLeft: 4 }}>✓</span>}</>}
                    onClick={() => openDetail(r, 'semana', r.leadsSemana)}
                  />
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p style={{ fontFamily: 'var(--font-cond)', fontSize: '0.68rem', color: '#aab4cc', letterSpacing: '0.03em', padding: '0.6rem 0.2rem 0' }}>
          Leads creados = leads registrados por el promotor en el mes · Citas creadas = leads con fecha de cita en el mes · Esta semana = leads registrados en la semana en curso (meta {weeklyTarget}) · Click en cualquier número para ver el desglose de esos leads.
        </p>
      </div>

      {data?.computedAt && (
        <footer className="dashboard-footer">
          Datos de Redshift · Actualizado: {new Date(data.computedAt).toLocaleString('es-PR', { timeZone: 'America/Puerto_Rico' })}
        </footer>
      )}

      {detail && (
        <LeadsModal
          detail={detail}
          monthLbl={detail.type === 'semana' ? 'semana en curso' : monthLabel(month)}
          rows={detailRows}
          loading={detailLoading}
          onClose={() => setDetail(null)}
        />
      )}
    </main>
  )
}

// Celda numérica clickable (abre el desglose). Deshabilitada si el valor es 0.
function CellNum({ value, color, suffix, onClick }: {
  value: number; color: string; suffix?: React.ReactNode; onClick: () => void
}) {
  const clickable = value > 0
  return (
    <td style={{ ...numTd, padding: 0 }}>
      <button
        onClick={clickable ? onClick : undefined}
        disabled={!clickable}
        title={clickable ? 'Ver desglose de leads' : undefined}
        style={{
          width: '100%', height: '100%', padding: '0.7rem 0.6rem', border: 'none', background: 'transparent',
          fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: '0.95rem', color,
          cursor: clickable ? 'pointer' : 'default',
          textDecoration: clickable ? 'underline' : 'none', textUnderlineOffset: 3, textDecorationColor: '#c7d2ea',
        }}
      >
        {value}{suffix}
      </button>
    </td>
  )
}

// Modal con el desglose de los leads detrás de un número
function fmtDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-PR', {
    timeZone: 'America/Puerto_Rico', day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}
function fmtDateOnly(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-PR', {
    timeZone: 'America/Puerto_Rico', day: '2-digit', month: 'short', year: 'numeric',
  })
}

function LeadsModal({ detail, monthLbl, rows, loading, onClose }: {
  detail: DetailState; monthLbl: string; rows: PromotorLeadDetail[] | null; loading: boolean; onClose: () => void
}) {
  const showCita = detail.type === 'citas' || detail.type === 'vendidos'
  const th: React.CSSProperties = { padding: '0.55rem 0.7rem', textAlign: 'left', fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: '0.62rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.75)', background: 'var(--navy)', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '0.55rem 0.7rem', fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--navy)', borderBottom: '1px solid #edf0f8', whiteSpace: 'nowrap' }
  const headers = showCita
    ? ['Cliente', 'Fecha creado', 'Fecha cita', 'Status lead', 'Vendedor asignado']
    : ['Cliente', 'Fecha creado', 'Status lead', 'Vendedor asignado']
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(13,22,84,0.55)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, maxWidth: 900, width: '100%', maxHeight: '85vh', overflow: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.4)' }}>
        <div style={{ padding: '1.1rem 1.4rem', borderBottom: '1px solid #e2e8f4', display: 'flex', alignItems: 'flex-start', gap: '1rem', position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-bebas)', fontSize: '1.5rem', color: 'var(--navy)', letterSpacing: '0.03em', lineHeight: 1.1 }}>{detail.promotor.name}</div>
            <div style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: '0.72rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--gray)', marginTop: 2 }}>
              {TYPE_LABEL[detail.type]} · {monthLbl}{rows ? ` · ${rows.length}` : ''}
            </div>
          </div>
          <button onClick={onClose} style={{ marginLeft: 'auto', border: 'none', background: '#eef1f9', color: 'var(--navy)', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1, flexShrink: 0 }}>✕</button>
        </div>
        <div style={{ padding: '0.5rem 0.4rem 1rem' }}>
          {loading ? (
            <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--gray)', fontFamily: 'var(--font-cond)' }}>Cargando desglose…</div>
          ) : !rows || rows.length === 0 ? (
            <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--gray)', fontFamily: 'var(--font-cond)' }}>Sin leads en este desglose.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: showCita ? 720 : 560 }}>
                <thead><tr>{headers.map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fafbff' }}>
                      <td style={{ ...td, fontWeight: 600 }}>{r.leadName ?? '—'}</td>
                      <td style={td}>{fmtDateOnly(r.createdDate)}</td>
                      {showCita && <td style={td}>{fmtDateTime(r.citaDate)}</td>}
                      <td style={td}>{r.leadStatus ?? '—'}</td>
                      <td style={{ ...td, color: r.vendedor ? 'var(--navy)' : '#aab4cc' }}>{r.vendedor ?? 'No asignado'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

'use client'

import { Fragment, useEffect, useState } from 'react'
import GoalCard from '@/components/GoalCard'
import type { PromotorResponse, PromotorCita } from '@/app/api/promotor/[zohoId]/route'

const MESES_LARGO = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

function monthLabel(yyyymm: string) {
  const [y, m] = yyyymm.split('-')
  return `${MESES_LARGO[Number(m) - 1]} ${y}`
}

// Lista de meses: ene-2024 → mes actual (los leads de promotores abarcan varios años)
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

function fmtCitaDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('es-PR', {
    timeZone: 'America/Puerto_Rico',
    day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

// Color del chip según el status del lead
function statusColor(status: string | null): { bg: string; fg: string } {
  const s = (status ?? '').toLowerCase()
  if (s === 'caso vendido')                       return { bg: 'rgba(34,150,83,0.14)',  fg: '#1c7a43' }
  if (s.startsWith('cita'))                        return { bg: 'rgba(21,101,192,0.12)', fg: '#1565c0' }
  if (s.includes('no le interesa') || s.includes('dq') || s.includes('junk'))
                                                   return { bg: 'rgba(232,33,39,0.12)',  fg: '#c62828' }
  return { bg: '#eef1f9', fg: 'var(--gray)' }
}

export default function PromotorDashboardClient({ zohoId, name }: { zohoId: string; name: string }) {
  const MONTHS = availableMonths()
  const [month, setMonth]     = useState<string>(currentMonth())
  const [data, setData]       = useState<PromotorResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    setLoading(true); setError(null)
    fetch(`/api/promotor/${zohoId}?month=${month}`)
      .then(r => r.json())
      .then((d: PromotorResponse & { error?: string }) => {
        if (d.error) { setError(d.error); return }
        setData(d)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [zohoId, month])

  const summary = data?.summary
  const week    = data?.week
  const citas   = data?.citas ?? []

  const fmtDay = (iso: string) => {
    const [, m, d] = iso.split('-')
    return `${Number(d)} ${['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][Number(m) - 1]}`
  }

  return (
    <main className="dashboard">
      <style>{`@keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.4 } }`}</style>

      {/* Header */}
      <header className="dashboard-header">
        <img src="/windmar-logo-rev.png" alt="Windmar" className="header-logo" />
        <div className="header-divider" />
        <div className="header-meta">
          <span className="header-label-top">Promotor · Leads &amp; Citas</span>
          <span className="header-name">{name}</span>
        </div>
      </header>

      {/* Selector de mes */}
      <div style={{ padding: '1.25rem 1.5rem 0', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <a href="/promotores" style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: '0.72rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--blue)', textDecoration: 'none' }}>← Todos los promotores</a>
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

      {/* Tarjetas de resumen */}
      <div className="section-eyebrow">01 — Resumen del mes ({monthLabel(month)})</div>
      <section className="cards-grid">
        <GoalCard
          title="LEADS CREADOS"
          current={summary?.leadsCreados ?? 0}
          target={1}
          noBar
          label={monthLabel(month)}
          gradient="linear-gradient(155deg, #0D1654 0%, #1565C0 55%, #2196F3 100%)"
          progressIcon="📋"
        />
        <GoalCard
          title="CITAS CREADAS"
          current={summary?.citasCreadas ?? 0}
          target={1}
          noBar
          label="Con fecha de cita en el mes"
          gradient="linear-gradient(155deg, #10233f 0%, #1565C0 55%, #E88B0C 100%)"
          progressIcon="📅"
        />
        <GoalCard
          title="CASOS VENDIDOS"
          current={summary?.casosVendidos ?? 0}
          target={1}
          noBar
          label="Citas del mes marcadas Vendido"
          gradient="linear-gradient(155deg, #0f2a19 0%, #1c7a43 60%, #2fae63 100%)"
          progressIcon="✅"
        />
      </section>

      {/* Meta semanal (semana en curso, independiente del mes) */}
      <div className="section-eyebrow">
        02 — Meta semanal{week ? ` (${fmtDay(week.start)} – ${fmtDay(week.end)})` : ''}
      </div>
      <section className="cards-grid">
        <GoalCard
          title="LEADS ESTA SEMANA"
          current={week?.leads ?? 0}
          target={week?.target ?? 25}
          label={`${week?.target ?? 25} leads / semana`}
          sublabel={week ? `Semana ${fmtDay(week.start)} – ${fmtDay(week.end)}` : undefined}
          gradient="linear-gradient(155deg, #0D1654 0%, #1565C0 55%, #F5A623 100%)"
          progressIcon="🎯"
        />
      </section>

      {error && (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#dc2626', fontFamily: 'var(--font-cond)' }}>Error al cargar datos: {error}</div>
      )}

      {/* Tabla de citas */}
      <div className="section-eyebrow">03 — Citas generadas ({monthLabel(month)})</div>
      <div style={{ padding: '0 1.5rem' }}>
        <div style={{ overflowX: 'auto', borderRadius: '0.75rem', boxShadow: '0 4px 24px rgba(13,22,84,0.10)', border: '1px solid #e2e8f4' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', minWidth: 760 }}>
            <thead>
              <tr style={{ background: 'var(--navy)' }}>
                {['Cliente', 'Fecha de cita', 'Tipo', 'Status cita', 'Status lead', 'Vendedor asignado'].map(h => (
                  <th key={h} style={{ padding: '0.6rem 0.7rem', fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: '0.64rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.75)', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #edf0f8' }}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} style={{ padding: '0.7rem' }}><div style={{ height: 13, borderRadius: 4, background: '#e8eef8', animation: 'pulse 1.5s ease-in-out infinite', width: j === 0 ? '80%' : '55%' }} /></td>
                    ))}
                  </tr>
                ))
              ) : citas.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--gray)', fontFamily: 'var(--font-cond)' }}>Sin citas con fecha en {monthLabel(month)}.</td></tr>
              ) : citas.map((c: PromotorCita, i) => {
                const sc = statusColor(c.leadStatus)
                return (
                  <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fafbff', borderBottom: '1px solid #edf0f8' }}>
                    <td style={{ padding: '0.6rem 0.7rem', fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: '0.85rem', color: 'var(--navy)' }}>{c.leadName ?? '—'}</td>
                    <td style={{ padding: '0.6rem 0.7rem', fontFamily: 'var(--font-cond)', fontSize: '0.82rem', color: 'var(--navy)', whiteSpace: 'nowrap' }}>{fmtCitaDate(c.citaDate)}</td>
                    <td style={{ padding: '0.6rem 0.7rem', fontFamily: 'var(--font-cond)', fontSize: '0.82rem', color: 'var(--gray)' }}>{c.citaType ?? '—'}</td>
                    <td style={{ padding: '0.6rem 0.7rem', fontFamily: 'var(--font-cond)', fontSize: '0.82rem', color: 'var(--gray)' }}>{c.citaStatus ?? '—'}</td>
                    <td style={{ padding: '0.6rem 0.7rem' }}>
                      {c.leadStatus
                        ? <span style={{ background: sc.bg, color: sc.fg, fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: '0.66rem', padding: '0.15rem 0.55rem', borderRadius: 999, whiteSpace: 'nowrap' }}>{c.leadStatus}</span>
                        : <span style={{ color: '#9fb0c9' }}>—</span>}
                    </td>
                    <td style={{ padding: '0.6rem 0.7rem', fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: c.vendedor ? 'var(--navy)' : '#aab4cc' }}>{c.vendedor ?? 'No asignado'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p style={{ fontFamily: 'var(--font-cond)', fontSize: '0.68rem', color: '#aab4cc', letterSpacing: '0.03em', padding: '0.6rem 0.2rem 0' }}>
          "Vendedor asignado" muestra lo que hay en el sistema (Sales Rep): el vendedor asignado si ya se registró, o el promotor mientras el lead siga a su nombre.
        </p>
      </div>

      {/* Desglose por status de lead */}
      <div className="section-eyebrow">04 — Leads por status ({monthLabel(month)})</div>
      <section className="detail-section">
        <div className="detail-card">
          <h3>Status de leads creados</h3>
          {loading ? (
            <p style={{ fontFamily: 'var(--font-cond)', color: 'var(--gray)' }}>Cargando…</p>
          ) : !summary || summary.byLeadStatus.length === 0 ? (
            <p style={{ fontFamily: 'var(--font-cond)', color: 'var(--gray)', margin: 0 }}>Sin leads creados en {monthLabel(month)}.</p>
          ) : (
            <dl>
              {summary.byLeadStatus.map(s => (
                <Fragment key={s.status}>
                  <dt>{s.status}</dt><dd>{s.n}</dd>
                </Fragment>
              ))}
              <dt>Total</dt><dd className="highlight">{summary.leadsCreados}</dd>
            </dl>
          )}
        </div>
      </section>

      {data?.computedAt && (
        <footer className="dashboard-footer">
          Datos de Redshift · Actualizado: {new Date(data.computedAt).toLocaleString('es-PR', { timeZone: 'America/Puerto_Rico' })}
        </footer>
      )}
    </main>
  )
}

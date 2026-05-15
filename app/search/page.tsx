'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface Member { zohoId: string; name: string }

export default function SearchPage() {
  const [members, setMembers]   = useState<Member[]>([])
  const [query,   setQuery]     = useState('')
  const [loading, setLoading]   = useState(true)
  const router = useRouter()

  useEffect(() => {
    fetch('/api/members')
      .then(r => r.json())
      .then((data: Member[]) => { setMembers(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const filtered = query.trim().length < 1
    ? members
    : members.filter(m =>
        m.name.toLowerCase().includes(query.toLowerCase())
      )

  return (
    <main style={{ minHeight: '100vh', background: 'var(--light)' }}>
      {/* Header */}
      <header className="dashboard-header">
        <img src="/windmar-logo-rev.png" alt="Windmar" className="header-logo" />
        <div className="header-divider" />
        <div className="header-meta">
          <span className="header-label-top">Directorio</span>
          <span className="header-name">Metas de Ventas</span>
        </div>
      </header>

      <div style={{ maxWidth: 640, margin: '2.5rem auto', padding: '0 1.25rem' }}>
        {/* Search input */}
        <div style={{ position: 'relative', marginBottom: '1.5rem' }}>
          <span style={{
            position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)',
            fontSize: '1.1rem', color: 'var(--gray)',
          }}>🔍</span>
          <input
            type="text"
            placeholder="Buscar vendedor por nombre…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoFocus
            style={{
              width: '100%',
              padding: '0.85rem 1rem 0.85rem 2.75rem',
              fontSize: '1rem',
              fontFamily: 'var(--font-body)',
              border: '2px solid #dde3f0',
              borderRadius: 12,
              outline: 'none',
              background: '#fff',
              color: 'var(--navy)',
              boxSizing: 'border-box',
            }}
            onFocus={e => { e.currentTarget.style.borderColor = 'var(--blue)' }}
            onBlur={e => { e.currentTarget.style.borderColor = '#dde3f0' }}
          />
        </div>

        {/* Results */}
        {loading ? (
          <p style={{ textAlign: 'center', color: 'var(--gray)', padding: '2rem 0' }}>
            Cargando directorio…
          </p>
        ) : (
          <>
            <p style={{ color: 'var(--gray)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
              {filtered.length} {filtered.length === 1 ? 'vendedor' : 'vendedores'}
              {query.trim() && ` para "${query}"`}
            </p>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {filtered.map(m => (
                <li key={m.zohoId}>
                  <button
                    onClick={() => router.push(`/p/${m.zohoId}`)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.875rem',
                      padding: '0.9rem 1.25rem',
                      background: '#fff',
                      border: '1.5px solid #e4e9f5',
                      borderRadius: 10,
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'border-color 0.15s, box-shadow 0.15s',
                      fontFamily: 'var(--font-body)',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = 'var(--blue)'
                      e.currentTarget.style.boxShadow = '0 2px 12px rgba(21,101,192,0.12)'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = '#e4e9f5'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                  >
                    <span style={{
                      width: 36, height: 36, borderRadius: '50%',
                      background: 'var(--navy)', color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.95rem', fontWeight: 700, flexShrink: 0,
                      fontFamily: 'var(--font-bebas)',
                    }}>
                      {m.name.charAt(0)}
                    </span>
                    <span style={{ fontWeight: 500, color: 'var(--navy)', fontSize: '0.97rem' }}>
                      {m.name}
                    </span>
                    <span style={{ marginLeft: 'auto', color: 'var(--gray)', fontSize: '1rem' }}>›</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </main>
  )
}

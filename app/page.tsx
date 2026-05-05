export default function Home() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--font-barlow), Barlow, sans-serif',
        background: '#0a1628',
        color: 'white',
        textAlign: 'center',
        padding: '2rem',
      }}
    >
      <div>
        <h1
          style={{
            fontFamily: 'var(--font-bebas), Bebas Neue, sans-serif',
            fontSize: '2.5rem',
            letterSpacing: '0.1em',
            color: '#f4b400',
            marginBottom: '0.5rem',
          }}
        >
          WINDMAR GOALS
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.65)', marginBottom: '1.5rem' }}>
          Accede a tu dashboard usando el link personalizado que recibiste.
        </p>
        <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.4)' }}>
          /p/&#123;tu-zoho-id&#125;
        </p>
      </div>
    </main>
  )
}

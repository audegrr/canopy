export default function AppHome() {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px', color: 'var(--muted)', padding: '40px' }}>
      <div style={{ fontSize: '3.5rem', opacity: 0.35 }}>🌿</div>
      <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.4rem', color: 'var(--text)', fontWeight: 500 }}>Your workspace is ready</h2>
      <p style={{ fontSize: '0.95rem', textAlign: 'center', maxWidth: '300px', lineHeight: 1.6 }}>
        Create a document or folder from the sidebar to get started.
      </p>
    </div>
  )
}

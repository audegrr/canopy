export default function AppLoading() {
  return (
    <main aria-busy="true" aria-label="Loading workspace" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg)' }}>
      <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Loading workspace…</div>
    </main>
  )
}

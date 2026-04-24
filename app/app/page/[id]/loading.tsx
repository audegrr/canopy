export default function Loading() {
  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '64px 60px 80px' }}>
        {/* Title skeleton */}
        <div style={{
          height: '44px', width: '60%', borderRadius: '6px', marginBottom: '24px',
          background: 'linear-gradient(90deg, var(--border) 25%, var(--sidebar-hover) 50%, var(--border) 75%)',
          backgroundSize: '400% 100%',
          animation: 'shimmer 1.4s ease infinite',
        }} />
        {/* Content skeletons */}
        {[85, 70, 90, 55, 75, 40, 80].map((w, i) => (
          <div key={i} style={{
            height: '16px', width: `${w}%`, borderRadius: '4px',
            marginBottom: '10px',
            background: 'linear-gradient(90deg, var(--border) 25%, var(--sidebar-hover) 50%, var(--border) 75%)',
            backgroundSize: '400% 100%',
            animation: `shimmer 1.4s ease infinite ${i * 0.08}s`,
          }} />
        ))}
      </div>
      <style>{`
        @keyframes shimmer {
          0% { background-position: 100% 0; }
          100% { background-position: -100% 0; }
        }
      `}</style>
    </div>
  )
}

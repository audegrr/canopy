'use client'

import { useEffect } from 'react'
import Image from 'next/image'

export default function ErrorPage({ error, unstable_retry }: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    console.error('Unexpected application error', error)
    navigator.sendBeacon('/api/telemetry/client-error', new Blob([JSON.stringify({ message: error.message, digest: error.digest, path: location.pathname })], { type: 'application/json' }))
  }, [error])

  return (
    <main role="alert" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: 'var(--bg)' }}>
      <div style={{ maxWidth: 420, textAlign: 'center' }}>
        <Image src="/canopy_favicon_no_bg.ico" alt="" width={64} height={64} />
        <h1 style={{ margin: '16px 0 8px', fontSize: 24 }}>Something went wrong</h1>
        <p style={{ margin: '0 0 20px', color: 'var(--text-secondary)' }}>
          Your data has not been deleted. Try loading this view again.
        </p>
        <button className="btn-primary" onClick={unstable_retry}>Try again</button>
      </div>
    </main>
  )
}

'use client'

type ClientErrorContext = {
  operation: string
  path?: string
  digest?: string
}

export function reportClientError(error: unknown, context: ClientErrorContext): void {
  const message = error instanceof Error ? error.message : String(error)
  const payload = JSON.stringify({
    message: message.slice(0, 1_000),
    operation: context.operation.slice(0, 100),
    digest: context.digest?.slice(0, 200),
    path: (context.path ?? (typeof location !== 'undefined' ? location.pathname : undefined))?.slice(0, 200),
  })

  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon('/api/telemetry/client-error', new Blob([payload], { type: 'application/json' }))
      return
    }
    void fetch('/api/telemetry/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    })
  } catch {
    // Telemetry must never interrupt the user action that it observes.
  }
}

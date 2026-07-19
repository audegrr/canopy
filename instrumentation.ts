import type { Instrumentation } from 'next'

export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  const message = error instanceof Error ? error.message : String(error)
  const digest = typeof error === 'object' && error !== null && 'digest' in error
    ? String(error.digest)
    : undefined

  // Structured output is searchable in the free Vercel runtime logs. Strip the
  // query string because share and invitation URLs can contain access tokens.
  console.error(JSON.stringify({
    event: 'server_request_error',
    message,
    digest,
    method: request.method,
    path: request.path.split('?')[0],
    route: context.routePath,
    routeType: context.routeType,
    timestamp: new Date().toISOString(),
  }))
}

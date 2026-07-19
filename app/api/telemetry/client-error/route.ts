import { NextResponse } from 'next/server'
import { readJson } from '@/lib/server/security'

export async function POST(req: Request) {
  const body = await readJson(req, 4_000)
  if (!body || typeof body.message !== 'string') return NextResponse.json({ error: 'Invalid error report' }, { status: 400 })
  console.error(JSON.stringify({ event: 'client_error', message: body.message.slice(0, 1_000), digest: typeof body.digest === 'string' ? body.digest.slice(0, 200) : undefined, path: typeof body.path === 'string' ? body.path.slice(0, 200).split('?')[0] : undefined, timestamp: new Date().toISOString() }))
  return new NextResponse(null, { status: 204 })
}

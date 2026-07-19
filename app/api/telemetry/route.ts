import { NextResponse } from 'next/server'
import { readJson } from '@/lib/server/security'

const METRICS = new Set(['TTFB', 'FCP', 'LCP', 'FID', 'CLS', 'INP'])

export async function POST(req: Request) {
  const body = await readJson(req, 2_000)
  if (!body || typeof body.name !== 'string' || !METRICS.has(body.name) || typeof body.value !== 'number' || !Number.isFinite(body.value)) {
    return NextResponse.json({ error: 'Invalid metric' }, { status: 400 })
  }
  console.info(JSON.stringify({ event: 'web_vital', name: body.name, value: Math.round(body.value * 1000) / 1000, rating: typeof body.rating === 'string' ? body.rating : undefined, navigationType: typeof body.navigationType === 'string' ? body.navigationType : undefined, path: typeof body.path === 'string' ? body.path.slice(0, 200).split('?')[0] : undefined, timestamp: new Date().toISOString() }))
  return new NextResponse(null, { status: 204 })
}

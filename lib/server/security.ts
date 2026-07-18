import 'server-only'

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isRecord } from '@/lib/validation'
export { isRecord, isUuid, normalizeEmail } from '@/lib/validation'

type RateEntry = { count: number; resetAt: number }
const rateStore = new Map<string, RateEntry>()

export async function readJson(req: Request, maxBytes = 1_000_000): Promise<Record<string, unknown> | null> {
  const declaredLength = Number(req.headers.get('content-length') || 0)
  if (declaredLength > maxBytes) return null
  try {
    const text = await req.text()
    if (new TextEncoder().encode(text).byteLength > maxBytes) return null
    const parsed: unknown = JSON.parse(text)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function rateLimit(key: string, limit: number, windowMs: number): NextResponse | null {
  const now = Date.now()
  if (rateStore.size > 10_000) {
    for (const [entryKey, entry] of rateStore) {
      if (entry.resetAt <= now) rateStore.delete(entryKey)
    }
  }
  const current = rateStore.get(key)
  if (!current || current.resetAt <= now) {
    rateStore.set(key, { count: 1, resetAt: now + windowMs })
    return null
  }
  current.count += 1
  if (current.count <= limit) return null
  return NextResponse.json(
    { error: 'Too many requests. Please try again later.' },
    { status: 429, headers: { 'Retry-After': String(Math.ceil((current.resetAt - now) / 1000)) } },
  )
}

export async function requireUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return { supabase, user }
}

export function safePublicOrigin(req: Request): string | null {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim()
  const candidate = configured || new URL(req.url).origin
  try {
    const url = new URL(candidate)
    if (!['http:', 'https:'].includes(url.protocol)) return null
    return url.origin
  } catch {
    return null
  }
}

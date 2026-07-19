import 'server-only'

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { isRecord, isUuid } from '@/lib/validation'
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

function memoryRateLimit(key: string, limit: number, windowMs: number): NextResponse | null {
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

export async function rateLimit(key: string, limit: number, windowMs: number): Promise<NextResponse | null> {
  const separator = key.indexOf(':')
  const bucket = separator > 0 ? key.slice(0, separator) : key
  const subject = separator > 0 ? key.slice(separator + 1) : ''
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

  if (serviceRoleKey && supabaseUrl && isUuid(subject)) {
    const admin = createAdminClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data, error } = await admin.rpc('consume_api_rate_limit', {
      p_bucket: bucket,
      p_subject: subject,
      p_limit: limit,
      p_window_seconds: Math.max(1, Math.ceil(windowMs / 1000)),
    })
    const result = data?.[0] as { allowed?: boolean; retry_after_seconds?: number } | undefined
    if (!error && result && result.allowed === false) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(result.retry_after_seconds || 1) } },
      )
    }
    if (!error && result?.allowed === true) return null
  }

  return memoryRateLimit(key, limit, windowMs)
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

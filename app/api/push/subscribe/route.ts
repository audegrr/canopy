import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { isRecord, readJson } from '@/lib/server/security'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const serverClient = await createServerClient()
  const { data: { user } } = await serverClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await readJson(req, 16_000)
  const subscription = body?.subscription
  if (!isRecord(subscription) || typeof subscription.endpoint !== 'string' || subscription.endpoint.length > 4096 || !isRecord(subscription.keys)) {
    return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 })
  }
  try {
    const endpoint = new URL(subscription.endpoint)
    if (endpoint.protocol !== 'https:') throw new Error('Invalid protocol')
  } catch {
    return NextResponse.json({ error: 'Invalid subscription endpoint' }, { status: 400 })
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const db = serviceRoleKey
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, { auth: { persistSession: false } })
    : serverClient

  // Upsert by endpoint to avoid duplicates
  const { error } = await db.from('push_subscriptions')
    .upsert({ user_id: user.id, subscription }, { onConflict: 'user_id' })
  if (error) return NextResponse.json({ error: 'Unable to save subscription' }, { status: 500 })

  return NextResponse.json({ ok: true })
}

export async function DELETE() {
  const serverClient = await createServerClient()
  const { data: { user } } = await serverClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const db = serviceRoleKey
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, { auth: { persistSession: false } })
    : serverClient

  const { error } = await db.from('push_subscriptions').delete().eq('user_id', user.id)
  if (error) return NextResponse.json({ error: 'Unable to remove subscription' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

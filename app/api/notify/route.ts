import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import webpush from 'web-push'

export const dynamic = 'force-dynamic'

if (process.env.VAPID_PRIVATE_KEY && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:hello@canopy.app',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  )
}

export async function POST(req: Request) {
  const serverClient = await createServerClient()
  const { data: { user } } = await serverClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { user_id, type, title, body: notifBody, data } = body
  if (!user_id || !type || !title) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const db = serviceRoleKey
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, { auth: { persistSession: false } })
    : serverClient

  const { error } = await db.from('notifications').insert({ user_id, type, title, body: notifBody, data })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Send web push to all subscriptions for this user
  if (process.env.VAPID_PRIVATE_KEY) {
    const { data: subs } = await db.from('push_subscriptions').select('id, subscription').eq('user_id', user_id)
    if (subs?.length) {
      const payload = JSON.stringify({ title, body: notifBody, url: data?.page_id ? `/app/page/${data.page_id}` : '/app' })
      const dead: string[] = []
      await Promise.allSettled(subs.map(async row => {
        try {
          await webpush.sendNotification(row.subscription, payload)
        } catch (e: any) {
          if (e.statusCode === 410 || e.statusCode === 404) dead.push(row.id)
        }
      }))
      if (dead.length) await db.from('push_subscriptions').delete().in('id', dead)
    }
  }

  return NextResponse.json({ ok: true })
}

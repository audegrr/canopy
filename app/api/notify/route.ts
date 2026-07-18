import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import webpush from 'web-push'
import { getPageAccess } from '@/lib/server/access'
import { isRecord, isUuid, rateLimit, readJson } from '@/lib/server/security'

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

  const requestBody = await readJson(req, 32_000)
  const user_id = requestBody?.user_id
  const type = requestBody?.type
  const data = isRecord(requestBody?.data) ? requestBody.data : {}
  if (!isUuid(user_id) || (type !== 'page_share' && type !== 'workspace_invite')) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  const limited = rateLimit(`notify:${user.id}`, 60, 60 * 60 * 1000)
  if (limited) return limited

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const db = serviceRoleKey
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, { auth: { persistSession: false } })
    : serverClient

  let title: string
  let notifBody: string
  if (type === 'page_share') {
    const pageId = data.page_id
    if (!isUuid(pageId)) return NextResponse.json({ error: 'Invalid page' }, { status: 400 })
    const [{ data: page }, { data: recipientShare }] = await Promise.all([
      db.from('pages').select('id, title, owner_id, workspace_id, link_permission').eq('id', pageId).single(),
      db.from('page_shares').select('permission').eq('page_id', pageId).eq('user_id', user_id).maybeSingle(),
    ])
    if (!page || !recipientShare) return NextResponse.json({ error: 'Share not found' }, { status: 403 })
    const access = await getPageAccess(db, user.id, page)
    if (!access.canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    title = `"${page.title || 'Untitled'}" was shared with you`
    notifBody = `You received ${recipientShare.permission === 'edit' ? 'edit' : 'view'} access.`
    data.page_title = page.title
  } else {
    const workspaceId = data.workspace_id
    if (!isUuid(workspaceId)) return NextResponse.json({ error: 'Invalid workspace' }, { status: 400 })
    const [{ data: workspace }, { data: recipient }] = await Promise.all([
      db.from('workspaces').select('name, owner_id').eq('id', workspaceId).single(),
      db.from('workspace_members').select('role').eq('workspace_id', workspaceId).eq('user_id', user_id).maybeSingle(),
    ])
    if (!workspace || workspace.owner_id !== user.id || !recipient) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    title = `Added to workspace "${workspace.name}"`
    notifBody = `You were invited as ${recipient.role === 'viewer' ? 'viewer' : 'member'}.`
    data.workspace_name = workspace.name
  }

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

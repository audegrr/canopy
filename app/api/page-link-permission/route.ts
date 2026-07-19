import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getPageAccess } from '@/lib/server/access'
import { isUuid, readJson, requireUser } from '@/lib/server/security'

export async function POST(req: Request) {
  const { user } = await requireUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await readJson(req, 16_000)
  const pageId = body?.page_id
  const permission = body?.permission
  if (!isUuid(pageId) || !['none', 'view', 'edit'].includes(String(permission))) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!key || !url) return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  const admin = createAdminClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: page } = await admin.from('pages').select('id, owner_id, workspace_id, link_permission').eq('id', pageId).single()
  if (!page) return NextResponse.json({ error: 'Page not found' }, { status: 404 })
  const access = await getPageAccess(admin, user.id, page)
  if (!access.canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { error } = await admin.rpc('set_page_link_permission_atomic', {
    p_user_id: user.id, p_page_id: pageId, p_permission: permission, p_only_upgrade: false,
  })
  if (!error) return NextResponse.json({ ok: true })
  if (error.code !== 'PGRST202' && !error.message.includes('set_page_link_permission_atomic')) {
    return NextResponse.json({ error: error.message }, { status: error.code === '42501' ? 403 : 500 })
  }

  const { error: fallbackError } = await admin.from('pages').update({ link_permission: permission }).eq('id', pageId)
  if (fallbackError) return NextResponse.json({ error: fallbackError.message }, { status: 500 })
  const { data: subIds } = await admin.rpc('get_all_subpage_ids', { page_id: pageId })
  if (subIds?.length) {
    const { error: childError } = await admin.from('pages').update({ link_permission: permission }).in('id', subIds.map((row: { id: string }) => row.id))
    if (childError) return NextResponse.json({ error: childError.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

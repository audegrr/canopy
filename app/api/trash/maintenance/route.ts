import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { isUuid, rateLimit, readJson, requireUser } from '@/lib/server/security'

export async function POST(req: Request) {
  const { user } = await requireUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await readJson(req, 2_000)
  if (!body || !isUuid(body.workspace_id)) return NextResponse.json({ error: 'Invalid workspace' }, { status: 400 })
  const limited = await rateLimit(`trash-maintenance:${user.id}`, 20, 60 * 60 * 1000)
  if (limited) return limited
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Server configuration missing' }, { status: 500 })
  const admin = createAdminClient(url, key, { auth: { persistSession: false } })
  const { data, error } = await admin.rpc('purge_workspace_trash_as', { p_user_id: user.id, p_workspace_id: body.workspace_id, p_retention_days: 30 })
  if (error) return NextResponse.json({ error: 'Maintenance failed' }, { status: 403 })
  return NextResponse.json({ purged: data ?? 0 })
}

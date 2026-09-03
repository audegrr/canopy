import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { isUuid, rateLimit } from '@/lib/server/security'

export const dynamic = 'force-dynamic'

// Returns all members of a workspace (id, user_id, role, email, full_name).
// Uses the service role to bypass RLS, but only after verifying the requesting
// user is the workspace owner or a workspace member — mirrors app/api/workspace-pages/route.ts.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const wsId = searchParams.get('ws_id')
  if (!isUuid(wsId)) return NextResponse.json({ error: 'Invalid ws_id' }, { status: 400 })

  const serverClient = await createServerClient()
  const { data: { user } } = await serverClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const limited = await rateLimit(`workspace-members:${user.id}`, 120, 60 * 1000)
  if (limited) return limited

  const [{ data: ownedWs }, { data: memberRow }] = await Promise.all([
    serverClient.from('workspaces').select('id').eq('id', wsId).eq('owner_id', user.id).single(),
    serverClient.from('workspace_members').select('id').eq('workspace_id', wsId).eq('user_id', user.id).single(),
  ])
  if (!ownedWs && !memberRow) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { data: members, error } = await admin.from('workspace_members')
    .select('id, user_id, role')
    .eq('workspace_id', wsId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const userIds = (members || []).map(m => m.user_id)
  const { data: profiles } = await admin.from('profiles').select('id, email, full_name').in('id', userIds)
  const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p]))

  return NextResponse.json((members || []).map(m => ({
    ...m,
    email: profileMap[m.user_id]?.email || '',
    full_name: profileMap[m.user_id]?.full_name || '',
  })))
}

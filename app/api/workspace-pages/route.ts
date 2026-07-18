import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { isUuid, rateLimit } from '@/lib/server/security'

export const dynamic = 'force-dynamic'

// Returns all non-deleted pages in a workspace.
// Uses the service role to bypass RLS, but only after verifying the requesting
// user is the workspace owner or a workspace member.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const wsId = searchParams.get('ws_id')
  if (!isUuid(wsId)) return NextResponse.json({ error: 'Invalid ws_id' }, { status: 400 })

  const serverClient = await createServerClient()
  const { data: { user } } = await serverClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const limited = rateLimit(`workspace-pages:${user.id}`, 120, 60 * 1000)
  if (limited) return limited

  // Verify user has access to this workspace (owner or member)
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
  const { data, error } = await admin.from('pages')
    .select('id, workspace_id, parent_id, title, icon, position, is_database, link_permission, owner_id')
    .eq('workspace_id', wsId)
    .is('deleted_at', null)
    .order('position')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}

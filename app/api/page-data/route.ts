import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Fetches a single page via service role (bypasses RLS) after verifying the
// requesting user has workspace-level access. Used as a fallback when the
// standard RLS-filtered query returns null for workspace owners reading pages
// created by other members.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const pageId = searchParams.get('id')
  if (!pageId) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const serverClient = await createServerClient()
  const { data: { user } } = await serverClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: page } = await admin.from('pages').select('*').eq('id', pageId).single()
  if (!page || page.deleted_at) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Verify access using the user's own client (respects auth)
  const [{ data: share }, { data: ownedWs }, { data: wsMem }] = await Promise.all([
    serverClient.from('page_shares').select('permission').eq('page_id', pageId).eq('user_id', user.id).single(),
    serverClient.from('workspaces').select('id').eq('id', page.workspace_id).eq('owner_id', user.id).single(),
    serverClient.from('workspace_members').select('role, workspace_id').eq('user_id', user.id),
  ])

  const isOwner = page.owner_id === user.id
  const isWsOwner = !!ownedWs
  const isMember = (wsMem || []).some((m: any) => m.workspace_id === page.workspace_id)
  const canView = isOwner || isWsOwner || !!share || page.link_permission !== 'none' || isMember
  if (!canView) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

  const canEdit = isOwner
    || isWsOwner
    || share?.permission === 'edit'
    || page.link_permission === 'edit'
    || (wsMem || []).some((m: any) => m.workspace_id === page.workspace_id && ['owner', 'member'].includes(m.role))

  return NextResponse.json({
    page,
    canEdit,
    isOwner,
    isWorkspaceMember: isWsOwner || isMember,
    userId: user.id,
  })
}

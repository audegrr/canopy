import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Moves a page (parent_id change) and/or reorders siblings (position updates)
// using the service role, bypassing the RLS UPDATE policy which only allows
// owner_id = auth.uid(). In a collaborative workspace, any member must be able
// to reorganise pages they don't personally own.
export async function POST(req: Request) {
  const serverClient = await createServerClient()
  const { data: { user } } = await serverClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { pageId, newParentId, positionUpdates } = await req.json()
  // positionUpdates: [{ id: string, position: number }] — optional

  if (!pageId) return NextResponse.json({ error: 'Missing pageId' }, { status: 400 })

  // Fetch the page to know which workspace it belongs to
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { data: page } = await admin.from('pages').select('workspace_id').eq('id', pageId).single()
  if (!page) return NextResponse.json({ error: 'Page not found' }, { status: 404 })

  // Verify user is workspace owner or member
  const [{ data: ownedWs }, { data: memberRow }] = await Promise.all([
    serverClient.from('workspaces').select('id').eq('id', page.workspace_id).eq('owner_id', user.id).single(),
    serverClient.from('workspace_members').select('id').eq('workspace_id', page.workspace_id).eq('user_id', user.id).single(),
  ])
  if (!ownedWs && !memberRow) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

  // Apply the parent_id change
  if (newParentId !== undefined) {
    const { error } = await admin.from('pages').update({ parent_id: newParentId }).eq('id', pageId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Apply any sibling position updates
  if (positionUpdates?.length) {
    await Promise.all(
      positionUpdates.map(({ id, position }: { id: string; position: number }) =>
        admin.from('pages').update({ position }).eq('id', id)
      )
    )
  }

  return NextResponse.json({ ok: true })
}

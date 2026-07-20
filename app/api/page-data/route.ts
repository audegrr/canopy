import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getPageAccess } from '@/lib/server/access'
import { isUuid, rateLimit } from '@/lib/server/security'

export const dynamic = 'force-dynamic'

// Fetches a single page via service role (bypasses RLS) after verifying the
// requesting user has workspace-level access. Used as a fallback when the
// standard RLS-filtered query returns null for workspace owners reading pages
// created by other members.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const pageId = searchParams.get('id')
  if (!isUuid(pageId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const serverClient = await createServerClient()
  const { data: { user } } = await serverClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const limited = await rateLimit(`page-data:${user.id}`, 300, 60 * 1000)
  if (limited) return limited

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: page } = await admin.from('pages').select('*').eq('id', pageId).single()
  if (!page || page.deleted_at) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const access = await getPageAccess(admin, user.id, page)
  const isOwner = page.owner_id === user.id
  if (!access.canView) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

  return NextResponse.json({
    page,
    canEdit: access.canEdit,
    canManage: access.canManage,
    isOwner,
    isWorkspaceMember: access.isWorkspaceMember,
    userId: user.id,
  })
}

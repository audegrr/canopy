import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getPageAccess } from '@/lib/server/access'
import { isRecord, isUuid, rateLimit, readJson } from '@/lib/server/security'

export const dynamic = 'force-dynamic'

// Moves a page (parent_id change) and/or reorders siblings (position updates)
// using the service role, bypassing the RLS UPDATE policy which only allows
// owner_id = auth.uid(). In a collaborative workspace, any member must be able
// to reorganise pages they don't personally own.
export async function POST(req: Request) {
  const serverClient = await createServerClient()
  const { data: { user } } = await serverClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await readJson(req, 64_000)
  const pageId = body?.pageId
  const newParentId = body?.newParentId
  const targetWorkspaceId = body?.targetWorkspaceId
  const rawUpdates = body?.positionUpdates
  if (!isUuid(pageId) || (newParentId !== null && newParentId !== undefined && !isUuid(newParentId))) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  if (targetWorkspaceId !== undefined && !isUuid(targetWorkspaceId)) {
    return NextResponse.json({ error: 'Invalid target workspace' }, { status: 400 })
  }
  const positionUpdates = Array.isArray(rawUpdates) ? rawUpdates.filter(isRecord).map(item => ({
    id: item.id,
    position: item.position,
  })) : []
  if (positionUpdates.length > 500 || positionUpdates.some(item => !isUuid(item.id) || typeof item.position !== 'number' || !Number.isFinite(item.position))) {
    return NextResponse.json({ error: 'Invalid position updates' }, { status: 400 })
  }
  const limited = await rateLimit(`move:${user.id}`, 120, 60 * 1000)
  if (limited) return limited

  // Fetch the page to know which workspace it belongs to
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { data: atomicDestination, error: atomicError } = await admin.rpc('move_page_tree_atomic', {
    p_user_id: user.id,
    p_page_id: pageId,
    p_new_parent_id: newParentId ?? null,
    p_target_workspace_id: targetWorkspaceId ?? null,
    p_position_updates: positionUpdates,
  })
  if (!atomicError) return NextResponse.json({ ok: true, workspaceId: atomicDestination })
  if (atomicError.code !== 'PGRST202' && !atomicError.message.includes('move_page_tree_atomic')) {
    const conflict = atomicError.message.includes('descendant')
    const denied = atomicError.code === '42501' || atomicError.message.includes('permission')
    return NextResponse.json({ error: atomicError.message }, { status: conflict ? 409 : denied ? 403 : 400 })
  }

  // Compatibility fallback while migration 016 is not yet deployed.
  const { data: page } = await admin.from('pages').select('id, owner_id, workspace_id, link_permission').eq('id', pageId).single()
  if (!page) return NextResponse.json({ error: 'Page not found' }, { status: 404 })

  const sourceAccess = await getPageAccess(admin, user.id, page)
  if (!sourceAccess.canManage) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

  let destinationWorkspaceId = typeof targetWorkspaceId === 'string' ? targetWorkspaceId : page.workspace_id
  if (typeof newParentId === 'string') {
    const { data: parent } = await admin.from('pages').select('id, owner_id, workspace_id, link_permission').eq('id', newParentId).is('deleted_at', null).single()
    if (!parent) return NextResponse.json({ error: 'Parent not found' }, { status: 404 })
    const parentAccess = await getPageAccess(admin, user.id, parent)
    if (!parentAccess.canManage) return NextResponse.json({ error: 'No edit access to destination' }, { status: 403 })
    destinationWorkspaceId = parent.workspace_id

    const { data: descendants } = await admin.rpc('get_all_subpage_ids', { page_id: pageId })
    if ((descendants || []).some((row: { id: string }) => row.id === newParentId)) {
      return NextResponse.json({ error: 'A page cannot be moved inside its own descendant' }, { status: 409 })
    }
  } else if (destinationWorkspaceId !== page.workspace_id) {
    const [{ data: workspace }, { data: membership }] = await Promise.all([
      admin.from('workspaces').select('owner_id').eq('id', destinationWorkspaceId).single(),
      admin.from('workspace_members').select('role').eq('workspace_id', destinationWorkspaceId).eq('user_id', user.id).maybeSingle(),
    ])
    const canEditDestination = workspace?.owner_id === user.id || membership?.role === 'owner' || membership?.role === 'member'
    if (!canEditDestination) return NextResponse.json({ error: 'No edit access to destination workspace' }, { status: 403 })
  }

  const updateIds = positionUpdates.map(item => item.id as string)
  if (updateIds.length) {
    const { data: updatePages } = await admin.from('pages').select('id, workspace_id').in('id', updateIds)
    if (!updatePages || updatePages.length !== new Set(updateIds).size || updatePages.some(item => item.workspace_id !== destinationWorkspaceId)) {
      return NextResponse.json({ error: 'Position updates must belong to the destination workspace' }, { status: 403 })
    }
  }

  // Apply the parent_id change
  if (newParentId !== undefined) {
    const { error } = await admin.from('pages').update({ parent_id: newParentId, workspace_id: destinationWorkspaceId }).eq('id', pageId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (destinationWorkspaceId !== page.workspace_id) {
    const { data: descendants } = await admin.rpc('get_all_subpage_ids', { page_id: pageId })
    const descendantIds = (descendants || []).map((row: { id: string }) => row.id)
    if (descendantIds.length) {
      const { error } = await admin.from('pages').update({ workspace_id: destinationWorkspaceId }).in('id', descendantIds)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  // Apply any sibling position updates
  if (positionUpdates?.length) {
    await Promise.all(
      positionUpdates.map(({ id, position }) =>
        admin.from('pages').update({ position }).eq('id', id)
      )
    )
  }

  return NextResponse.json({ ok: true })
}

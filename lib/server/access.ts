import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

export type PageAccess = {
  canView: boolean
  canEdit: boolean
  canManage: boolean
  isWorkspaceMember: boolean
}

export async function getPageAccess(
  client: SupabaseClient,
  userId: string,
  page: { id: string; owner_id: string; workspace_id: string; link_permission?: string | null },
): Promise<PageAccess> {
  const [{ data: workspace }, { data: membership }, { data: share }] = await Promise.all([
    client.from('workspaces').select('owner_id').eq('id', page.workspace_id).maybeSingle(),
    client.from('workspace_members').select('role').eq('workspace_id', page.workspace_id).eq('user_id', userId).maybeSingle(),
    client.from('page_shares').select('permission').eq('page_id', page.id).eq('user_id', userId).maybeSingle(),
  ])

  const ownsPage = page.owner_id === userId
  const ownsWorkspace = workspace?.owner_id === userId
  const memberCanEdit = membership?.role === 'owner' || membership?.role === 'member'
  const sharedCanEdit = share?.permission === 'edit'
  const canEdit = ownsPage || ownsWorkspace || memberCanEdit || sharedCanEdit || page.link_permission === 'edit'

  return {
    canView: canEdit || !!membership || !!share || page.link_permission === 'view',
    canEdit,
    canManage: ownsPage || ownsWorkspace || memberCanEdit || sharedCanEdit,
    isWorkspaceMember: ownsWorkspace || !!membership,
  }
}

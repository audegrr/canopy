import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { derivePageAccess, type PageAccess } from '@/lib/access-policy'

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

  return derivePageAccess({
    userId,
    pageOwnerId: page.owner_id,
    linkPermission: page.link_permission,
    workspaceOwnerId: workspace?.owner_id,
    membershipRole: membership?.role,
    sharePermission: share?.permission,
  })
}

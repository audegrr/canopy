export const dynamic = 'force-dynamic'
export const revalidate = 0
import type { ReactNode } from 'react'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AppShell from '@/components/AppShell'

export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [workspacesResult, pagesResult, sharedResult, membershipsResult] = await Promise.all([
    supabase.from('workspaces').select('*').eq('owner_id', user.id).order('created_at'),
    supabase.from('pages')
      .select('id, workspace_id, parent_id, title, icon, position, is_database, link_permission, owner_id')
      .eq('owner_id', user.id)
      .is('deleted_at', null)
      .order('position'),
    supabase.rpc('get_shared_pages', { user_uuid: user.id }),
    supabase.from('workspace_members').select('workspace_id, role').eq('user_id', user.id)
  ])

  let workspaces = workspacesResult.data || []
  if (workspaces.length === 0) {
    const { data: ws } = await supabase.from('workspaces')
      .insert({ name: 'My Workspace', icon: '🌿', owner_id: user.id })
      .select().single()
    if (ws) workspaces = [ws]
  }

  // Fetch shared workspace objects separately (avoids PostgREST join issues)
  let memberWorkspaces: any[] = []
  const memberships = membershipsResult.data || []
  if (memberships.length > 0) {
    const wsIds = memberships.map((m: any) => m.workspace_id)
    const { data: wsData } = await supabase.from('workspaces').select('*').in('id', wsIds)
    if (wsData) {
      memberWorkspaces = wsData.map((ws: any) => ({
        ...ws,
        _memberRole: memberships.find((m: any) => m.workspace_id === ws.id)?.role || 'member'
      }))
    }
  }

  const pages = (pagesResult.data || []).map((p: any) => ({
    ...p,
    content: [], cover_url: '', created_at: '', updated_at: '',
    icon: p.icon || '', parent_id: p.parent_id ?? null,
    link_permission: p.link_permission || 'none',
  }))

  // Fetch owner names for shared pages
  const ownerIds = [...new Set((sharedResult.data || []).map((p: any) => p.owner_id).filter(Boolean))]
  let ownerProfiles: Record<string, string> = {}
  if (ownerIds.length > 0) {
    const { data: profiles } = await supabase.from('profiles').select('id, full_name, email').in('id', ownerIds)
    ownerProfiles = Object.fromEntries((profiles || []).map((p: any) => [p.id, p.full_name || p.email?.split('@')[0] || 'Unknown']))
  }

  const sharedPages = (sharedResult.data || []).map((p: any) => ({
    id: p.id, title: p.title, icon: p.icon || '',
    owner_id: p.owner_id, owner_name: ownerProfiles[p.owner_id] ?? null,
    permission: p.permission, parent_id: p.parent_id ?? null,
    workspace_id: p.workspace_id ?? undefined,
    is_database: p.is_database ?? false
  }))

  return (
    <AppShell
      user={{ id: user.id, email: user.email || '', name: user.user_metadata?.full_name || user.email || '' }}
      workspaces={workspaces}
      memberWorkspaces={memberWorkspaces}
      currentWorkspace={workspaces[0] || { id: '', name: 'Workspace', icon: '🌿', owner_id: user.id, created_at: '' }}
      pages={pages}
      sharedPages={sharedPages}
    >
      {children}
    </AppShell>
  )
}

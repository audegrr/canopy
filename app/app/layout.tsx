// @ts-nocheck
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AppShell from '@/components/AppShell'

export default async function AppLayout({ children }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  let { data: workspaces } = await supabase
    .from('workspaces').select('*').eq('owner_id', user.id).order('created_at')
  if (!workspaces || workspaces.length === 0) {
    const { data: ws } = await supabase.from('workspaces')
      .insert({ name: 'My Workspace', icon: '🌿', owner_id: user.id }).select().single()
    workspaces = ws ? [ws] : []
  }

  // Load ALL pages across ALL workspaces — client will filter by active workspace
  const wsIds = (workspaces || []).map(w => w.id)
  const { data: rawPages } = await supabase
    .from('pages')
    .select('id, workspace_id, parent_id, title, icon, position, is_database, link_permission, owner_id')
    .in('workspace_id', wsIds.length > 0 ? wsIds : ['none'])
    .order('position')

  const pages = (rawPages || []).map((p) => ({
    ...p,
    content: [],
    cover_url: '',
    created_at: '',
    updated_at: '',
    icon: p.icon || '',
    parent_id: p.parent_id ?? null,
    link_permission: p.link_permission || 'none',
  }))

  const { data: sharedData } = await supabase.rpc('get_shared_pages', { user_uuid: user.id })
  const sharedPages = (sharedData || []).map((p) => ({
    id: p.id, title: p.title, icon: p.icon || '',
    owner_id: p.owner_id, permission: p.permission, parent_id: p.parent_id ?? null
  }))

  return (
    <AppShell
      user={{ id: user.id, email: user.email || '', name: user.user_metadata?.full_name || user.email || '' }}
      workspaces={workspaces || []}
      currentWorkspace={workspaces[0] || { id: '', name: 'Workspace', icon: '🌿', owner_id: user.id, created_at: '' }}
      pages={pages}
      sharedPages={sharedPages}
    >
      {children}
    </AppShell>
  )
}

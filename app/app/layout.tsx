// @ts-nocheck
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AppShell from '@/components/AppShell'

export default async function AppLayout({ children }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Get workspaces
  let { data: workspaces } = await supabase
    .from('workspaces')
    .select('*')
    .eq('owner_id', user.id)
    .order('created_at')

  if (!workspaces || workspaces.length === 0) {
    const { data: ws } = await supabase.from('workspaces')
      .insert({ name: 'My Workspace', icon: '🌿', owner_id: user.id })
      .select().single()
    workspaces = ws ? [ws] : []
  }

  // Load ALL pages for this user (across all their workspaces)
  const { data: rawPages, error: pagesError } = await supabase
    .from('pages')
    .select('id, workspace_id, parent_id, title, icon, position, is_database, link_permission, owner_id')
    .eq('owner_id', user.id)
    .order('position')

  if (pagesError) {
    console.error('Pages error:', pagesError)
  }

  const pages = (rawPages || []).map((p) => ({
    id: p.id,
    workspace_id: p.workspace_id,
    parent_id: p.parent_id ?? null,
    title: p.title || 'Untitled',
    icon: p.icon || '',
    position: p.position || 0,
    is_database: p.is_database || false,
    link_permission: p.link_permission || 'none',
    owner_id: p.owner_id,
    content: [],
    cover_url: '',
    created_at: '',
    updated_at: '',
  }))

  // Get shared pages
  let sharedPages: any[] = []
  try {
    const { data: sharedData } = await supabase
      .rpc('get_shared_pages', { user_uuid: user.id })
    sharedPages = (sharedData || []).map((p: any) => ({
      id: p.id,
      title: p.title || 'Untitled',
      icon: p.icon || '',
      owner_id: p.owner_id,
      permission: p.permission,
      parent_id: p.parent_id ?? null,
    }))
  } catch (e) {
    console.error('Shared pages error:', e)
  }

  const currentWorkspace = workspaces[0] || {
    id: '', name: 'Workspace', icon: '🌿', owner_id: user.id, created_at: ''
  }

  return (
    <AppShell
      user={{
        id: user.id,
        email: user.email || '',
        name: user.user_metadata?.full_name || user.email || '',
      }}
      workspaces={workspaces}
      currentWorkspace={currentWorkspace}
      pages={pages}
      sharedPages={sharedPages}
    >
      {children}
    </AppShell>
  )
}

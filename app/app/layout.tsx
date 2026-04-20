// @ts-nocheck
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Get or create default workspace
  let { data: workspaces } = await supabase.from('workspaces').select('*').eq('owner_id', user.id).order('created_at')
  if (!workspaces || workspaces.length === 0) {
    const { data: ws } = await supabase.from('workspaces').insert({ name: 'My Workspace', icon: '🌿', owner_id: user.id }).select().single()
    workspaces = ws ? [ws] : []
  }
  const currentWorkspace = workspaces[0]

  const { data: pages } = await supabase.from('pages').select('*').eq('workspace_id', currentWorkspace?.id).order('position')

  const { data: sharedData } = await supabase.rpc('get_shared_pages', { user_uuid: user.id })
  const sharedPages = (sharedData || []).map((p: any) => ({
    id: p.id, title: p.title, icon: p.icon || '',
    owner_id: p.owner_id, permission: p.permission, parent_id: p.parent_id
  }))

  const profile = { id: user.id, email: user.email || '', name: user.user_metadata?.full_name || user.email || '' }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar
        user={profile}
        workspaces={workspaces || []}
        currentWorkspace={currentWorkspace}
        pages={pages || []}
        sharedPages={sharedPages}
      />
      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {children}
      </main>
    </div>
  )
}

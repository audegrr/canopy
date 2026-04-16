// @ts-nocheck
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AppShell from '@/components/AppShell'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: folders } = await supabase
    .from('folders').select('*').eq('owner_id', user.id).order('created_at')

  const { data: rawDocs } = await supabase
    .from('documents')
    .select('id, title, folder_id, parent_id, link_permission')
    .eq('owner_id', user.id)
    .order('updated_at', { ascending: false })

  const docs = (rawDocs || []).map((d: any) => ({
    id: d.id, title: d.title,
    folder_id: d.folder_id ?? null,
    parent_id: d.parent_id ?? null,
    link_permission: d.link_permission ?? 'none',
  }))

  // Docs shared with this user — using security definer function to bypass RLS
  const { data: sharedDocsData } = await supabase
    .rpc('get_shared_documents', { user_uuid: user.id })
  console.log('sharedDocsData:', JSON.stringify(sharedDocsData))
  const sharedDocs = (sharedDocsData || []).map((d: any) => ({
    id: d.id,
    title: d.title,
    owner_id: d.owner_id,
    permission: d.permission
  }))

  const { data: databases } = await supabase
    .from('databases').select('id, title').eq('owner_id', user.id)
    .order('created_at', { ascending: false })

  return (
    <AppShell
      user={{ id: user.id, email: user.email, name: user.user_metadata?.full_name || user.email }}
      initialFolders={folders || []}
      initialDocs={docs}
      initialDatabases={databases || []}
      initialSharedDocs={sharedDocs}
    >
      {children}
    </AppShell>
  )
}

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AppShell from '@/components/AppShell'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: folders } = await supabase.from('folders').select('*').eq('owner_id', user.id).order('created_at')
  const { data: docs } = await supabase.from('documents').select('id, title, folder_id, created_at, updated_at, link_permission').eq('owner_id', user.id).order('updated_at', { ascending: false })
  const { data: databases } = await supabase.from('databases').select('id, title, created_at').eq('owner_id', user.id).order('created_at', { ascending: false })

  return (
    <AppShell
      user={{ id: user.id, email: user.email!, name: user.user_metadata?.full_name || user.email! }}
      initialFolders={folders || []}
      initialDocs={docs || []}
      initialDatabases={databases || []}
    >
      {children}
    </AppShell>
  )
}

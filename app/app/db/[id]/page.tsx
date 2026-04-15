import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import DatabaseView from '@/components/DatabaseView'

export default async function DbPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: db } = await supabase.from('databases').select('*').eq('id', id).single()
  if (!db) notFound()

  const isOwner = db.owner_id === user.id
  if (!isOwner) notFound()

  return <DatabaseView db={db} canEdit={isOwner} isOwner={isOwner} />
}

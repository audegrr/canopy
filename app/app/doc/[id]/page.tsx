import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import DocEditor from '@/components/DocEditor'

export default async function DocPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: doc } = await supabase
    .from('documents')
    .select('*')
    .eq('id', id)
    .single()

  if (!doc) notFound()

  // Check access: owner or shared
  const isOwner = doc.owner_id === user.id
  const { data: share } = await supabase
    .from('document_shares')
    .select('permission')
    .eq('document_id', id)
    .eq('user_id', user.id)
    .single()

  const canView = isOwner || !!share || doc.link_permission !== 'none'
  const canEdit = isOwner || share?.permission === 'edit'

  if (!canView) notFound()

  return <DocEditor doc={doc} canEdit={canEdit} isOwner={isOwner} userId={user.id} />
}

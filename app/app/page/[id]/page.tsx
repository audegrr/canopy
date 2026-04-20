// @ts-nocheck
import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import PageView from '@/components/PageView'

export default async function PageRoute({ params }: { params: any }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: page } = await supabase.from('pages').select('*').eq('id', id).single()
  if (!page) notFound()

  const isOwner = page.owner_id === user.id
  const { data: share } = await supabase.from('page_shares').select('permission').eq('page_id', id).eq('user_id', user.id).single()

  const canView = isOwner || !!share || page.link_permission !== 'none'
  if (!canView) notFound()
  const canEdit = isOwner || share?.permission === 'edit'

  return <PageView page={page} canEdit={canEdit} isOwner={isOwner} />
}

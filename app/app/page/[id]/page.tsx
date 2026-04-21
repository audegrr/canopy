// @ts-nocheck
import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { Suspense } from 'react'
import PageView from '@/components/PageView'

export default async function PageRoute({ params }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: page } = await supabase.from('pages').select('*').eq('id', id).single()

  if (!page) {
    // Check if shared with this user
    const { data: share } = await supabase
      .from('page_shares').select('permission').eq('page_id', id).eq('user_id', user.id).single()
    if (!share) notFound()
    redirect(`/share/${id}`)
  }

  const isOwner = page.owner_id === user.id
  const { data: share } = await supabase
    .from('page_shares').select('permission').eq('page_id', id).eq('user_id', user.id).single()

  const canView = isOwner || !!share || page.link_permission !== 'none'
  const canEdit = isOwner || share?.permission === 'edit' || page.link_permission === 'edit'
  if (!canView) notFound()

  // Dynamic title for browser tab
  return (
    <>
      <title>{(page.title || 'Untitled') + ' — Canopy'}</title>
      <Suspense fallback={null}>
        <PageView page={page} canEdit={canEdit} isOwner={isOwner} userId={user.id} />
      </Suspense>
    </>
  )
}

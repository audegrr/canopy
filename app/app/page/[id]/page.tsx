// @ts-nocheck
import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import PageView from '@/components/PageView'

// Tell Next.js to cache this route
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export default async function PageRoute({ params }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Run both queries in parallel instead of sequentially
  const [{ data: page }, { data: shareData }] = await Promise.all([
    supabase.from('pages').select('*').eq('id', id).single(),
    supabase.from('page_shares').select('permission').eq('page_id', id).eq('user_id', user.id).single()
  ])

  if (!page) {
    if (!shareData) notFound()
    redirect(`/share/${id}`)
  }

  const isOwner = page.owner_id === user.id
  const canView = isOwner || !!shareData || page.link_permission !== 'none'
  const canEdit = isOwner || shareData?.permission === 'edit' || page.link_permission === 'edit'
  if (!canView) notFound()

  return <PageView page={page} canEdit={canEdit} isOwner={isOwner} userId={user.id} />
}

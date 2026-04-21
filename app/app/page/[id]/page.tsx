// @ts-nocheck
import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import PageView from '@/components/PageView'

export default async function PageRoute({ params }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch page — use service role via RPC to bypass RLS for shared pages
  const { data: page, error } = await supabase
    .from('pages')
    .select('*')
    .eq('id', id)
    .single()

  // If not found via owner policy, check if shared
  if (!page) {
    // Try to get via share
    const { data: share } = await supabase
      .from('page_shares')
      .select('permission')
      .eq('page_id', id)
      .eq('user_id', user.id)
      .single()

    if (!share) {
      // Check link permission
      const { data: pagePublic } = await supabase
        .rpc('get_page_for_user', { p_id: id, u_id: user.id })
        .single()

      if (!pagePublic) notFound()
    }

    // Redirect to share page which handles this case
    redirect(`/share/${id}`)
  }

  const isOwner = page.owner_id === user.id

  // Check share permission
  const { data: share } = await supabase
    .from('page_shares')
    .select('permission')
    .eq('page_id', id)
    .eq('user_id', user.id)
    .single()

  const canView = isOwner || !!share || page.link_permission !== 'none'
  const canEdit = isOwner || share?.permission === 'edit' || page.link_permission === 'edit'

  if (!canView) notFound()

  return <PageView page={page} canEdit={canEdit} isOwner={isOwner} userId={user.id} />
}

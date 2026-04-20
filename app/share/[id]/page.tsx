// @ts-nocheck
import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import PageView from '@/components/PageView'

export default async function SharePage({ params }: { params: any }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: page } = await supabase.from('pages').select('*').eq('id', id).single()
  if (!page || page.link_permission === 'none') notFound()

  if (user && user.id !== page.owner_id) {
    await supabase.rpc('add_page_share', { p_id: id, perm: page.link_permission })
    const { data: subIds } = await supabase.rpc('get_all_subpage_ids', { page_id: id })
    if (subIds?.length) {
      for (const row of subIds) {
        await supabase.rpc('add_page_share', { p_id: row.id, perm: page.link_permission })
      }
    }
    redirect(`/app/page/${id}`)
  }

  return <PageView page={page} canEdit={page.link_permission === 'edit'} isOwner={false} />
}

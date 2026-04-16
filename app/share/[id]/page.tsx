// @ts-nocheck
import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import SharedDocView from '@/components/SharedDocView'

export default async function SharedDocPage({ params }: { params: any }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  const { data: doc } = await supabase
    .from('documents')
    .select('*')
    .eq('id', id)
    .single()

  if (!doc || doc.link_permission === 'none') notFound()

  // If logged in and not the owner, auto-add to "Shared with me"
  if (user && user.id !== doc.owner_id) {
    // Share the parent doc
    await supabase.from('document_shares').upsert({
      document_id: id,
      user_id: user.id,
      permission: doc.link_permission
    })
    // Share all sub-docs recursively via SQL function
    const { data: subIds } = await supabase.rpc('get_all_subdoc_ids', { doc_id: id })
    if (subIds && subIds.length > 0) {
      for (const row of subIds) {
        await supabase.from('document_shares').upsert({
          document_id: row.id,
          user_id: user.id,
          permission: doc.link_permission
        })
      }
    }
    redirect(`/app/doc/${id}`)
  }

  return <SharedDocView doc={doc} />
}

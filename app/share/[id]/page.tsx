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

  // If logged in and not the owner, add to "Shared with me" then redirect
  if (user && user.id !== doc.owner_id) {
    // Use security definer function to bypass RLS
    await supabase.rpc('add_document_share', {
      doc_id: id,
      perm: doc.link_permission
    })

    // Share all sub-docs recursively
    const { data: subIds } = await supabase.rpc('get_all_subdoc_ids', { doc_id: id })
    if (subIds && subIds.length > 0) {
      for (const row of subIds) {
        await supabase.rpc('add_document_share', {
          doc_id: row.id,
          perm: doc.link_permission
        })
      }
    }

    // Redirect to app with full permissions
    redirect(`/app/doc/${id}`)
  }

  // Not logged in — show public read-only view
  return <SharedDocView doc={doc} />
}

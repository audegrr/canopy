// @ts-nocheck
import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import SharedDocView from '@/components/SharedDocView'

export default async function SharedDocPage({ params }: { params: any }) {
  const { id } = await params
  const supabase = await createClient()

  // Check if user is logged in
  const { data: { user } } = await supabase.auth.getUser()

  // Fetch the doc (public read allowed by RLS for link-shared docs)
  const { data: doc } = await supabase
    .from('documents')
    .select('*')
    .eq('id', id)
    .single()

  if (!doc || doc.link_permission === 'none') notFound()

  // If logged in and not the owner, auto-add to their "Shared with me"
  if (user && user.id !== doc.owner_id) {
    await supabase.from('document_shares').upsert({
      document_id: id,
      user_id: user.id,
      permission: doc.link_permission
    })
    // Redirect to app so they get the full editor experience
    redirect(`/app/doc/${id}`)
  }

  // Not logged in — show public read-only view
  return <SharedDocView doc={doc} />
}

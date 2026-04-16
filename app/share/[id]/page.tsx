// @ts-nocheck
import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import SharedDocView from '@/components/SharedDocView'

export default async function SharedDocPage({ params }: { params: any }) {
  const { id } = await params
  const supabase = await createClient()

  // Check if user is logged in
  const { data: { user } } = await supabase.auth.getUser()

  // If logged in, redirect to the app version
  if (user) redirect(`/app/doc/${id}`)

  const { data: doc } = await supabase
    .from('documents')
    .select('*')
    .eq('id', id)
    .single()

  if (!doc || doc.link_permission === 'none') notFound()

  return <SharedDocView doc={doc} />
}

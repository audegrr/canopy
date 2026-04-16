// @ts-nocheck
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import SharedDocView from '@/components/SharedDocView'

export default async function SharedDocPage({ params }: { params: any }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: doc } = await supabase
    .from('documents')
    .select('*')
    .eq('id', id)
    .single()

  if (!doc || doc.link_permission === 'none') notFound()

  return <SharedDocView doc={doc} />
}

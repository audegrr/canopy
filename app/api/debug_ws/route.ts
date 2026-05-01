// @ts-nocheck
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'not authenticated' })

  const url = new URL(req.url)
  const pageId = url.searchParams.get('page')

  const { data: wsMember } = await supabase
    .from('workspace_members')
    .select('role, workspace_id')
    .eq('user_id', user.id)

  let pageInfo = null
  if (pageId) {
    const { data: page } = await supabase.from('pages').select('id, title, workspace_id, owner_id').eq('id', pageId).single()
    const isOwner = page?.owner_id === user.id
    const isMember = (wsMember || []).some((m: any) => m.workspace_id === page?.workspace_id)
    const canEdit = isOwner || (wsMember || []).some((m: any) => m.workspace_id === page?.workspace_id && ['owner','member'].includes(m.role))
    pageInfo = { page, isOwner, isMember, canEdit, wsMemberForWs: (wsMember || []).find((m: any) => m.workspace_id === page?.workspace_id) }
  }

  return NextResponse.json({ user: { id: user.id, email: user.email }, wsMember, pageInfo })
}

// @ts-nocheck
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'not authenticated' })

  const { data: memberships, error: e1 } = await supabase
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', user.id)

  let wsData: any[] = []
  if (memberships && memberships.length > 0) {
    const { data } = await supabase
      .from('workspaces')
      .select('id, name, icon')
      .in('id', memberships.map((m: any) => m.workspace_id))
    wsData = data || []
  }

  return NextResponse.json({
    user: { id: user.id, email: user.email },
    memberships: memberships || [],
    memberWorkspaces: wsData,
    e1: e1?.message
  })
}

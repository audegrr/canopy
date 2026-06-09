import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const serverClient = await createServerClient()
  const { data: { user } } = await serverClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { email, workspace_id, role } = await req.json()
  if (!email || !workspace_id || !role) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  })

  // Verify caller is owner of this workspace
  const { data: workspace } = await admin.from('workspaces').select('owner_id, name').eq('id', workspace_id).single()
  if (!workspace || workspace.owner_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Create an invite token in the DB
  const { data: invite, error: inviteError } = await admin
    .from('workspace_invites')
    .insert({ workspace_id, role, created_by: user.id })
    .select('token')
    .single()

  if (inviteError || !invite) {
    return NextResponse.json({ error: inviteError?.message ?? 'Failed to create invite' }, { status: 500 })
  }

  const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL ?? req.headers.get('origin')}/invite/${invite.token}`

  const { error: authError } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo })

  if (authError) return NextResponse.json({ error: authError.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

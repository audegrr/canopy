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

  // Delete stale pending workspace_invites for this email
  await admin
    .from('workspace_invites')
    .delete()
    .eq('workspace_id', workspace_id)
    .eq('invited_email', email)

  // Delete the unconfirmed auth user if they exist so inviteUserByEmail sends a fresh email
  const { data: unconfirmedId, error: rpcError } = await admin.rpc('get_unconfirmed_auth_user_id', { p_email: email })
  if (rpcError) {
    console.error('[invite] RPC get_unconfirmed_auth_user_id failed:', rpcError.message, '— SQL function may not be applied yet')
  } else if (unconfirmedId) {
    const { error: deleteError } = await admin.auth.admin.deleteUser(unconfirmedId)
    if (deleteError) console.error('[invite] deleteUser failed:', deleteError.message)
    else console.log('[invite] deleted unconfirmed auth user for', email)
  } else {
    console.log('[invite] no unconfirmed auth user found for', email)
  }

  // Create a new invite token
  const { data: invite, error: inviteError } = await admin
    .from('workspace_invites')
    .insert({ workspace_id, role, created_by: user.id, invited_email: email })
    .select('token')
    .single()

  if (inviteError || !invite) {
    console.error('[invite] failed to create workspace_invites record:', inviteError?.message)
    return NextResponse.json({ error: inviteError?.message ?? 'Failed to create invite' }, { status: 500 })
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? req.headers.get('origin')
  const next = encodeURIComponent(`/invite/${invite.token}`)
  const redirectTo = `${origin}/auth/callback?next=${next}`

  console.log('[invite] calling inviteUserByEmail for', email, 'redirectTo:', redirectTo)
  const { error: authError } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo })

  if (authError) {
    console.error('[invite] inviteUserByEmail error:', authError.message)
    const inviteLink = `${origin}/invite/${invite.token}`
    return NextResponse.json({ ok: true, alreadyInvited: true, inviteLink })
  }

  console.log('[invite] invitation email sent to', email)
  return NextResponse.json({ ok: true })
}

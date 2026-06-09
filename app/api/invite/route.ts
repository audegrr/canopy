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

  // Check if the email has an auth account and whether it is confirmed
  const { data: authRows } = await admin.rpc('get_auth_user_by_email', { p_email: email })
  const authUser = authRows?.[0] as { id: string; confirmed: boolean } | undefined

  // ── Case 1: confirmed account → add directly as workspace member ──────────
  if (authUser?.confirmed) {
    const { data: profile } = await admin.from('profiles').select('id').eq('email', email).single()
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

    const { data: existing } = await admin
      .from('workspace_members').select('id').eq('workspace_id', workspace_id).eq('user_id', profile.id).single()
    if (existing) return NextResponse.json({ ok: true, addedDirectly: true, alreadyMember: true })

    await admin.from('workspace_members').insert({ workspace_id, user_id: profile.id, role })
    return NextResponse.json({ ok: true, addedDirectly: true, userId: profile.id })
  }

  // ── Case 2: unconfirmed account (invite accepted email but not finished) ──
  // Clean up everything so we can start fresh
  if (authUser && !authUser.confirmed) {
    console.log('[invite] cleaning up unconfirmed account for', email)
    // Remove from workspace_members if added by mistake
    const { data: profile } = await admin.from('profiles').select('id').eq('email', email).single()
    if (profile) {
      await admin.from('workspace_members').delete().eq('workspace_id', workspace_id).eq('user_id', profile.id)
      await admin.from('profiles').delete().eq('id', profile.id)
    }
    await admin.auth.admin.deleteUser(authUser.id)
  }

  // ── Case 3 (and after Case 2 cleanup): no confirmed account → send invite ─
  // Delete stale pending workspace_invites for this email
  await admin.from('workspace_invites').delete().eq('workspace_id', workspace_id).eq('invited_email', email)

  const { data: invite, error: inviteError } = await admin
    .from('workspace_invites')
    .insert({ workspace_id, role, created_by: user.id, invited_email: email })
    .select('token')
    .single()

  if (inviteError || !invite) {
    console.error('[invite] failed to create invite record:', inviteError?.message)
    return NextResponse.json({ error: inviteError?.message ?? 'Failed to create invite' }, { status: 500 })
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? req.headers.get('origin')
  const next = encodeURIComponent(`/invite/${invite.token}`)
  const redirectTo = `${origin}/auth/callback?next=${next}`

  console.log('[invite] calling inviteUserByEmail for', email)
  const { error: authError } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo })

  if (authError) {
    console.error('[invite] inviteUserByEmail error:', authError.message)
    const inviteLink = `${origin}/invite/${invite.token}`
    return NextResponse.json({ ok: true, alreadyInvited: true, inviteLink })
  }

  console.log('[invite] invitation email sent to', email)
  return NextResponse.json({ ok: true })
}

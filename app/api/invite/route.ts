import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isUuid, normalizeEmail, rateLimit, readJson, safePublicOrigin } from '@/lib/server/security'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const serverClient = await createServerClient()
  const { data: { user } } = await serverClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await readJson(req, 16_000)
  const email = normalizeEmail(body?.email)
  const workspace_id = body?.workspace_id
  const role = body?.role === 'member' ? 'member' : body?.role === 'viewer' ? 'viewer' : null
  if (!email || !isUuid(workspace_id) || !role) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const limited = await rateLimit(`invite:${user.id}`, 20, 60 * 60 * 1000)
  if (limited) return limited

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  })

  // Verify caller is owner of this workspace
  const { data: workspace, error: workspaceError } = await admin.from('workspaces').select('owner_id, name').eq('id', workspace_id).single()
  if (workspaceError) {
    console.error('[invite] failed to load workspace:', workspaceError.message)
    return NextResponse.json({ error: 'Unable to load workspace' }, { status: 500 })
  }
  if (!workspace || workspace.owner_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Check if the email has an auth account and whether it is confirmed
  const { data: authRows } = await admin.rpc('get_auth_user_by_email', { p_email: email })
  const authUser = authRows?.[0] as { id: string; has_account: boolean } | undefined

  // ── Case 1: real account → add directly using the auth user ID ──────────
  if (authUser?.has_account) {
    if (authUser.id === user.id) {
      return NextResponse.json({ ok: true, addedDirectly: true, alreadyMember: true })
    }
    const { data: existing } = await admin
      .from('workspace_members').select('id').eq('workspace_id', workspace_id).eq('user_id', authUser.id).maybeSingle()
    if (existing) return NextResponse.json({ ok: true, addedDirectly: true, alreadyMember: true })

    const { error: memberError } = await admin
      .from('workspace_members')
      .insert({ workspace_id, user_id: authUser.id, role })
    if (memberError) {
      console.error('[invite] failed to add existing user:', memberError.message)
      return NextResponse.json({ error: 'Unable to add member' }, { status: 500 })
    }
    await admin.from('workspace_invites').delete().eq('workspace_id', workspace_id).eq('invited_email', email)
    return NextResponse.json({ ok: true, addedDirectly: true, userId: authUser.id })
  }

  const origin = safePublicOrigin(req)
  if (!origin) return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })

  // Keep an active workspace token stable. Rotating it before sending the
  // email made links already delivered to the recipient stop working.
  const { data: activeInvite, error: activeInviteError } = await admin
    .from('workspace_invites')
    .select('id, token, role, created_at')
    .eq('workspace_id', workspace_id)
    .eq('invited_email', email)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (activeInviteError) {
    console.error('[invite] failed to load pending invite:', activeInviteError.message)
    return NextResponse.json({ error: 'Unable to load pending invitation' }, { status: 500 })
  }

  let invite = activeInvite
  let createdInvite = false
  if (invite) {
    if (invite.role !== role) {
      const { error: roleError } = await admin.from('workspace_invites').update({ role }).eq('id', invite.id)
      if (roleError) {
        console.error('[invite] failed to update pending invite:', roleError.message)
        return NextResponse.json({ error: 'Unable to update pending invitation' }, { status: 500 })
      }
    }
  } else {
    await admin.from('workspace_invites').delete().eq('workspace_id', workspace_id).eq('invited_email', email)
    const { data, error: inviteError } = await admin
      .from('workspace_invites')
      .insert({ workspace_id, role, created_by: user.id, invited_email: email })
      .select('id, token, role, created_at')
      .single()
    if (inviteError || !data) {
      console.error('[invite] failed to create invite record:', inviteError?.message)
      return NextResponse.json({ error: inviteError?.message ?? 'Failed to create invite' }, { status: 500 })
    }
    invite = data
    createdInvite = true
  }

  // Avoid Supabase's per-address email throttle while keeping the original
  // invitation usable.
  if (activeInvite && Date.now() - new Date(activeInvite.created_at).getTime() < 60_000) {
    return NextResponse.json({ ok: true, alreadyInvited: true })
  }

  const next = encodeURIComponent(`/invite/${invite.token}`)
  const redirectTo = `${origin}/auth/callback?next=${next}`

  // Supabase cannot call inviteUserByEmail twice for an address that already
  // has an Auth user. For a pending account, send a non-creating magic link
  // instead; it establishes the same session and continues through our invite
  // acceptance page.
  const { error: authError } = authUser
    ? await admin.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false, emailRedirectTo: redirectTo },
      })
    : await admin.auth.admin.inviteUserByEmail(email, { redirectTo })

  if (authError) {
    console.error('[invite] failed to send auth email:', authError.message)
    if (createdInvite) await admin.from('workspace_invites').delete().eq('id', invite.id)
    return NextResponse.json({ error: `Failed to send invitation: ${authError.message}` }, { status: 500 })
  }

  return NextResponse.json({ ok: true, resent: !!authUser })
}

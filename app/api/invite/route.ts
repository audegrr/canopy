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

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  })

  // These checks are independent. Running them concurrently removes several
  // sequential network round trips from the invite button's critical path.
  const now = new Date().toISOString()
  const [limited, workspaceResult, authResult, activeInviteResult] = await Promise.all([
    rateLimit(`invite:${user.id}`, 20, 60 * 60 * 1000),
    admin.from('workspaces').select('owner_id, name').eq('id', workspace_id).single(),
    admin.rpc('get_auth_user_by_email', { p_email: email }),
    admin
      .from('workspace_invites')
      .select('id, token, role, created_at')
      .eq('workspace_id', workspace_id)
      .eq('invited_email', email)
      .gt('expires_at', now)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  if (limited) return limited

  // Verify caller is owner of this workspace
  const { data: workspace, error: workspaceError } = workspaceResult
  if (workspaceError) {
    console.error('[invite] failed to load workspace:', workspaceError.message)
    return NextResponse.json({ error: 'Unable to load workspace' }, { status: 500 })
  }
  if (!workspace || workspace.owner_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Check if the email has an auth account and whether it is confirmed
  const { data: authRows } = authResult
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
  const emailInvitesEnabled = process.env.SUPABASE_EMAIL_INVITES_ENABLED === 'true'

  // Keep an active workspace token stable. Rotating it before sending the
  // email made links already delivered to the recipient stop working.
  const { data: activeInvite, error: activeInviteError } = activeInviteResult
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
    // Expired-row cleanup does not have to finish before the replacement is
    // created (there is no workspace/email uniqueness constraint).
    const [cleanupResult, insertResult] = await Promise.all([
      admin
        .from('workspace_invites')
        .delete()
        .eq('workspace_id', workspace_id)
        .eq('invited_email', email)
        .lte('expires_at', now),
      admin
        .from('workspace_invites')
        .insert({ workspace_id, role, created_by: user.id, invited_email: email })
        .select('id, token, role, created_at')
        .single(),
    ])
    if (cleanupResult.error) {
      console.error('[invite] failed to clean up expired invites:', cleanupResult.error.message)
    }
    const { data, error: inviteError } = insertResult
    if (inviteError || !data) {
      console.error('[invite] failed to create invite record:', inviteError?.message)
      return NextResponse.json({ error: inviteError?.message ?? 'Failed to create invite' }, { status: 500 })
    }
    invite = data
    createdInvite = true
  }

  // Avoid Supabase's per-address email throttle while keeping the original
  // invitation usable.
  if (emailInvitesEnabled && activeInvite && Date.now() - new Date(activeInvite.created_at).getTime() < 60_000) {
    return NextResponse.json({ ok: true, alreadyInvited: true })
  }

  const next = encodeURIComponent(`/invite/${invite.token}`)
  const redirectTo = `${origin}/auth/callback?next=${next}`
  const inviteEmail = email
  const publicOrigin = origin
  const pendingInvite = invite

  // A person without a completed account does not need an Auth link yet. Old
  // invite attempts may have left an empty Auth placeholder behind; remove it
  // so the recipient can complete normal sign-up from the workspace URL.
  if (!emailInvitesEnabled && !authUser?.has_account) {
    if (authUser) {
      const { error: cleanupAuthError } = await admin.auth.admin.deleteUser(authUser.id)
      if (cleanupAuthError) {
        console.error('[invite] failed to remove incomplete Auth user:', authErrorDetails(cleanupAuthError))
        return createManualInviteLink()
      }
    }
    return NextResponse.json({
      ok: true,
      accountNotFound: true,
      emailSent: false,
      inviteLink: `${origin}/invite/${invite.token}`,
    })
  }

  async function createManualInviteLink() {
    let authUserExists = !!authUser
    if (!authUserExists) {
      const { data: refreshedRows } = await admin.rpc('get_auth_user_by_email', { p_email: inviteEmail })
      authUserExists = !!refreshedRows?.[0]
    }

    let generated = await admin.auth.admin.generateLink({
      type: authUserExists ? 'magiclink' : 'invite',
      email: inviteEmail,
      options: { redirectTo },
    })

    // Some mailer failures create the Auth user before returning an error.
    // Retry as a magic link if the initial invite-link generation detects it.
    if (generated.error && !authUserExists) {
      generated = await admin.auth.admin.generateLink({
        type: 'magiclink',
        email: inviteEmail,
        options: { redirectTo },
      })
    }

    const properties = generated.data.properties
    if (generated.error || !properties?.hashed_token || !properties.verification_type) {
      console.error('[invite] failed to generate fallback link:', authErrorDetails(generated.error))
      if (createdInvite) await admin.from('workspace_invites').delete().eq('id', pendingInvite.id)
      return NextResponse.json(
        { error: 'The email service is unavailable and a fallback link could not be created.' },
        { status: 502 },
      )
    }

    const confirmUrl = new URL('/auth/confirm', publicOrigin)
    confirmUrl.searchParams.set('token_hash', properties.hashed_token)
    confirmUrl.searchParams.set('type', properties.verification_type)
    confirmUrl.searchParams.set('next', `/invite/${pendingInvite.token}`)

    return NextResponse.json({
      ok: true,
      emailSent: false,
      inviteLink: confirmUrl.toString(),
    })
  }

  // Email delivery is opt-in because this project's Supabase mailer currently
  // times out before returning an empty error. Skip that known-slow failure and
  // generate the signed manual link immediately.
  if (!emailInvitesEnabled) return createManualInviteLink()

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
    console.error('[invite] failed to send auth email:', authErrorDetails(authError))
    return createManualInviteLink()
  }

  return NextResponse.json({ ok: true, emailSent: true, resent: !!authUser })
}

function authErrorDetails(error: unknown) {
  if (!error || typeof error !== 'object') return { message: String(error ?? 'Unknown error') }
  const value = error as Record<string, unknown>
  return {
    name: typeof value.name === 'string' ? value.name : undefined,
    message: typeof value.message === 'string' ? value.message : undefined,
    code: typeof value.code === 'string' ? value.code : undefined,
    status: typeof value.status === 'number' ? value.status : undefined,
  }
}

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
  const authUser = authRows?.[0] as { id: string; has_account: boolean } | undefined

  // ── Case 1: real account → add directly using the auth user ID ──────────
  if (authUser?.has_account) {
    const { data: existing } = await admin
      .from('workspace_members').select('id').eq('workspace_id', workspace_id).eq('user_id', authUser.id).maybeSingle()
    if (existing) return NextResponse.json({ ok: true, addedDirectly: true, alreadyMember: true })

    await admin.from('workspace_members').insert({ workspace_id, user_id: authUser.id, role })
    return NextResponse.json({ ok: true, addedDirectly: true, userId: authUser.id })
  }

  // ── Case 2 + 3: pending or brand-new → (re)send invite ─────────────────
  // Do NOT delete the existing auth user before re-inviting: Supabase rate-
  // limits emails per address (~60 s), so delete+immediate-recreate always
  // fails. inviteUserByEmail on an existing pending user just re-sends the
  // email with the new redirectTo, which is exactly what we want.

  // Rotate the invite token so old links stop working.
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

  const { error: authError } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo })

  if (authError) {
    console.error('[invite] inviteUserByEmail error:', authError.message)
    return NextResponse.json({ error: `Failed to send invitation: ${authError.message}` }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

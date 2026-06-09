import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

function adminClient() {
  return createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const admin = adminClient()

  // Use admin client for all DB lookups — bypasses any RLS edge cases.
  const { data: inviteByToken } = await admin
    .from('workspace_invites')
    .select('id, workspace_id, role, expires_at, invited_email')
    .eq('token', token)
    .maybeSingle()

  let invite = inviteByToken

  // Fallback: if the user is authenticated, look them up by email.
  // This covers old email links where the token was rotated on re-invite.
  if (!invite && user?.email) {
    const { data } = await admin
      .from('workspace_invites')
      .select('id, workspace_id, role, expires_at, invited_email')
      .eq('invited_email', user.email.toLowerCase())
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .maybeSingle()
    if (data) invite = data
  }

  // Not authenticated — redirect to signup with invite context pre-filled.
  if (!user) {
    const emailParam = invite?.invited_email
      ? `&email=${encodeURIComponent(invite.invited_email)}`
      : ''
    redirect(`/signup?invite=${token}${emailParam}`)
  }

  // Invite not found even with admin client + email fallback.
  if (!invite) {
    // Maybe it was already accepted — check workspace membership.
    const { data: anyMembership } = await admin
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()
    if (anyMembership) redirect('/app')
    return <InviteError message="This invite link is invalid or has already been used." />
  }

  if (new Date(invite.expires_at) < new Date()) {
    return <InviteError message="This invite link has expired. Ask the workspace owner to send a new one." />
  }

  // Check if user is already a member of this workspace.
  const { data: existing } = await admin
    .from('workspace_members')
    .select('id')
    .eq('workspace_id', invite.workspace_id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!existing) {
    await admin.from('workspace_members').insert({
      workspace_id: invite.workspace_id,
      user_id: user.id,
      role: invite.role,
    })
  }

  // Mark invite as used.
  await admin.from('workspace_invites').delete().eq('id', invite.id)

  // If user has no display name they came through the invite-only path
  // and need to complete their profile before using the app.
  const { data: profile } = await admin
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.full_name) {
    redirect('/welcome')
  }

  redirect('/app')
}

function InviteError({ message }: { message: string }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🔗</div>
        <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Invite unavailable</h1>
        <p style={{ color: '#787774', marginBottom: 24 }}>{message}</p>
        <a href="/app" style={{ background: '#0b6e99', color: '#fff', padding: '8px 20px', borderRadius: 6, textDecoration: 'none', fontSize: 14 }}>Go to app</a>
      </div>
    </div>
  )
}

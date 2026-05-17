import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function InvitePage({ params }: { params: { token: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect(`/login?redirect=/invite/${params.token}`)

  const { data: invite } = await supabase
    .from('workspace_invites')
    .select('id, workspace_id, role, expires_at')
    .eq('token', params.token)
    .single()

  if (!invite) return <InviteError message="This invite link is invalid or has already been used." />
  if (new Date(invite.expires_at) < new Date()) return <InviteError message="This invite link has expired." />

  // Check if already a member
  const { data: existing } = await supabase
    .from('workspace_members')
    .select('id')
    .eq('workspace_id', invite.workspace_id)
    .eq('user_id', user.id)
    .single()

  if (!existing) {
    await supabase.from('workspace_members').insert({ workspace_id: invite.workspace_id, user_id: user.id, role: invite.role })
  }

  // Delete used invite
  await supabase.from('workspace_invites').delete().eq('id', invite.id)

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

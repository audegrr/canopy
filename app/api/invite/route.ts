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

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? req.headers.get('origin')

  // Check if there's already a pending invite for this email in this workspace
  const { data: existingInvite } = await admin
    .from('workspace_invites')
    .select('token')
    .eq('workspace_id', workspace_id)
    .eq('invited_email', email)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (existingInvite) {
    // User was already invited — return the existing invite link so the owner can share it manually
    const inviteLink = `${origin}/invite/${existingInvite.token}`
    return NextResponse.json({ ok: true, alreadyInvited: true, inviteLink })
  }

  // Create a new invite token
  const { data: invite, error: inviteError } = await admin
    .from('workspace_invites')
    .insert({ workspace_id, role, created_by: user.id, invited_email: email })
    .select('token')
    .single()

  if (inviteError || !invite) {
    return NextResponse.json({ error: inviteError?.message ?? 'Failed to create invite' }, { status: 500 })
  }

  const next = encodeURIComponent(`/invite/${invite.token}`)
  const redirectTo = `${origin}/auth/callback?next=${next}`

  const { error: authError } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo })

  // inviteUserByEmail can silently succeed without sending when the user already exists in auth.
  // In that case we fall back to the shareable link.
  if (authError) {
    const inviteLink = `${origin}/invite/${invite.token}`
    return NextResponse.json({ ok: true, alreadyInvited: true, inviteLink })
  }

  return NextResponse.json({ ok: true })
}

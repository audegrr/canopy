import { describe, expect, it, vi } from 'vitest'
import { createFakeClient } from '@/lib/server/testing/fake-supabase'

process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'

const state: { admin: ReturnType<typeof createFakeClient> | null; user: { id: string } | null } = { admin: null, user: null }

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => state.admin,
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.user } }) } }),
}))

const { POST } = await import('./route')

function request(body: unknown) {
  return new Request('http://localhost/api/invite', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const workspaceId = '11111111-1111-4111-8111-111111111111'
const owner = { id: 'owner-1' }
const validBody = { email: 'friend@example.com', workspace_id: workspaceId, role: 'member' }
const noActiveInvite = { data: null, error: null }

describe('POST /api/invite', () => {
  it('rejects unauthenticated requests', async () => {
    state.user = null
    state.admin = createFakeClient({})
    const res = await POST(request(validBody))
    expect(res.status).toBe(401)
  })

  it('rejects an invalid request body', async () => {
    state.user = owner
    state.admin = createFakeClient({})
    const res = await POST(request({ email: 'nope', workspace_id: workspaceId, role: 'member' }))
    expect(res.status).toBe(400)
  })

  it('rejects inviting to a workspace the caller does not own', async () => {
    state.user = { id: 'not-the-owner' }
    state.admin = createFakeClient({
      tables: {
        workspaces: [{ data: { owner_id: owner.id, name: 'Acme' }, error: null }],
        workspace_invites: [noActiveInvite],
      },
      rpc: { get_auth_user_by_email: [{ data: [], error: null }] },
    })
    const res = await POST(request(validBody))
    expect(res.status).toBe(403)
  })

  it('adds an existing account directly without sending an email', async () => {
    state.user = owner
    const invitedUserId = 'existing-user-1'
    state.admin = createFakeClient({
      tables: {
        workspaces: [{ data: { owner_id: owner.id, name: 'Acme' }, error: null }],
        workspace_invites: [noActiveInvite, { data: null, error: null }], // Promise.all lookup, then the cleanup delete
        workspace_members: [{ data: null, error: null }, { data: null, error: null }], // "already a member?" check, then the insert
      },
      rpc: { get_auth_user_by_email: [{ data: [{ id: invitedUserId, has_account: true }], error: null }] },
    })
    const res = await POST(request(validBody))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toEqual({ ok: true, addedDirectly: true, userId: invitedUserId })
  })

  it('treats an existing member as already invited instead of re-adding them', async () => {
    state.user = owner
    const invitedUserId = 'existing-user-2'
    state.admin = createFakeClient({
      tables: {
        workspaces: [{ data: { owner_id: owner.id, name: 'Acme' }, error: null }],
        workspace_invites: [noActiveInvite],
        workspace_members: [{ data: { id: 'membership-1' }, error: null }], // already a member
      },
      rpc: { get_auth_user_by_email: [{ data: [{ id: invitedUserId, has_account: true }], error: null }] },
    })
    const res = await POST(request(validBody))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toEqual({ ok: true, addedDirectly: true, alreadyMember: true })
  })
})

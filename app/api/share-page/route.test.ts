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
  return new Request('http://localhost/api/share-page', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const pageId = '11111111-1111-4111-8111-111111111111'
const owner = { id: 'owner-1' }
const validBody = { email: 'friend@example.com', page_id: pageId, role: 'view' }

function pageRow(overrides: Partial<{ owner_id: string; link_permission: string | null }> = {}) {
  return {
    data: { id: pageId, owner_id: owner.id, workspace_id: 'ws-1', link_permission: overrides.link_permission ?? 'none', title: 'My page' },
    error: null,
  }
}

describe('POST /api/share-page', () => {
  it('rejects unauthenticated requests', async () => {
    state.user = null
    state.admin = createFakeClient({})
    const res = await POST(request(validBody))
    expect(res.status).toBe(401)
  })

  it('rejects an invalid request body', async () => {
    state.user = owner
    state.admin = createFakeClient({})
    const res = await POST(request({ email: 'not-an-email', page_id: pageId, role: 'view' }))
    expect(res.status).toBe(400)
  })

  it('rejects sharing a page the caller cannot manage', async () => {
    state.user = { id: 'stranger' }
    state.admin = createFakeClient({
      tables: {
        profiles: [{ data: { full_name: 'Stranger' }, error: null }],
        pages: [pageRow()],
        workspaces: [{ data: null, error: null }],
        workspace_members: [{ data: null, error: null }],
        page_shares: [{ data: null, error: null }],
      },
    })
    const res = await POST(request(validBody))
    expect(res.status).toBe(403)
  })

  it('upgrades link permission when the owner shares view access on a locked page', async () => {
    state.user = owner
    state.admin = createFakeClient({
      tables: {
        profiles: [{ data: { full_name: 'Owner' }, error: null }],
        pages: [pageRow({ link_permission: 'none' })],
        workspaces: [{ data: null, error: null }],
        workspace_members: [{ data: null, error: null }],
        page_shares: [{ data: null, error: null }],
      },
      rpc: { set_page_link_permission_atomic: [{ data: null, error: null }] },
    })
    const res = await POST(request(validBody))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.ok).toBe(true)
    expect(state.admin!.rpc).toHaveBeenCalledWith('set_page_link_permission_atomic', expect.objectContaining({ p_permission: 'view', p_only_upgrade: true }))
  })

  it('never attempts to downgrade an existing edit link when sharing view access', async () => {
    state.user = owner
    state.admin = createFakeClient({
      tables: {
        profiles: [{ data: { full_name: 'Owner' }, error: null }],
        pages: [pageRow({ link_permission: 'edit' })],
        workspaces: [{ data: null, error: null }],
        workspace_members: [{ data: null, error: null }],
        page_shares: [{ data: null, error: null }],
      },
    })
    const res = await POST(request(validBody))
    expect(res.status).toBe(200)
    expect(state.admin!.rpc).not.toHaveBeenCalled()
  })
})

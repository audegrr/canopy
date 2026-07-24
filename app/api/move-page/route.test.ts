import { describe, expect, it, vi } from 'vitest'
import { createFakeClient } from '@/lib/server/testing/fake-supabase'

const state: { admin: ReturnType<typeof createFakeClient> | null; user: { id: string } | null } = { admin: null, user: null }

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => state.admin,
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.user } }) } }),
}))

const { POST } = await import('./route')

function request(body: unknown) {
  return new Request('http://localhost/api/move-page', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const validBody = { pageId: '11111111-1111-4111-8111-111111111111' }

describe('POST /api/move-page', () => {
  it('rejects unauthenticated requests', async () => {
    state.user = null
    state.admin = createFakeClient({})
    const res = await POST(request(validBody))
    expect(res.status).toBe(401)
  })

  it('rejects an invalid pageId', async () => {
    state.user = { id: 'u1' }
    state.admin = createFakeClient({})
    const res = await POST(request({ pageId: 'not-a-uuid' }))
    expect(res.status).toBe(400)
  })

  it('succeeds when the atomic RPC succeeds', async () => {
    state.user = { id: 'u1' }
    state.admin = createFakeClient({
      rpc: { move_page_tree_atomic: [{ data: 'workspace-1', error: null }] },
    })
    const res = await POST(request(validBody))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toEqual({ ok: true, workspaceId: 'workspace-1' })
  })

  it('rejects moving a page into its own descendant with 409', async () => {
    state.user = { id: 'u1' }
    state.admin = createFakeClient({
      rpc: { move_page_tree_atomic: [{ data: null, error: { message: 'target is a descendant of the page being moved' } }] },
    })
    const res = await POST(request(validBody))
    expect(res.status).toBe(409)
  })

  it('maps a permission-denied RPC error to 403', async () => {
    state.user = { id: 'u1' }
    state.admin = createFakeClient({
      rpc: { move_page_tree_atomic: [{ data: null, error: { code: '42501', message: 'permission denied' } }] },
    })
    const res = await POST(request(validBody))
    expect(res.status).toBe(403)
  })
})

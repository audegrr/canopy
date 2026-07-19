import { describe, expect, it } from 'vitest'
import { cachePageForOffline, getCachedPage, readCachedPages } from './offline-page-cache'

function memoryStorage() { let value: string | null = null; return { getItem: () => value, setItem: (_key: string, next: string) => { value = next }, removeItem: () => { value = null } } }
const page = { id: 'p', workspace_id: 'w', parent_id: null, title: 'Cached', icon: '', cover_url: '', content: [], position: 1, is_database: false, owner_id: 'u', link_permission: 'none' as const, created_at: '', updated_at: '' }

describe('offline page cache', () => {
  it('stores and replaces the latest copy of a page', () => {
    const storage = memoryStorage()
    cachePageForOffline({ page, canEdit: true, isOwner: true, isWorkspaceMember: true, userId: 'u' }, storage)
    cachePageForOffline({ page: { ...page, title: 'Updated' }, canEdit: true, isOwner: true, isWorkspaceMember: true, userId: 'u' }, storage)
    expect(readCachedPages('u', storage)).toHaveLength(1)
    expect(getCachedPage('u', 'p', storage)?.page.title).toBe('Updated')
  })
})

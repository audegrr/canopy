import type { Page } from './types'

const PREFIX = 'canopy:offline-pages:v1:'
const MAX_PAGES = 20
const MAX_BYTES = 5 * 1024 * 1024

export type CachedPageAccess = { page: Page; canEdit: boolean; canManage: boolean; isOwner: boolean; isWorkspaceMember: boolean; userId: string }
type Entry = CachedPageAccess & { cachedAt: string }

function key(userId: string) { return PREFIX + userId }

export function readCachedPages(userId: string, storage: Pick<Storage, 'getItem'> = localStorage): Entry[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(key(userId)) || '[]')
    return Array.isArray(parsed) ? parsed.filter((item): item is Entry => !!item && typeof item === 'object' && typeof item.cachedAt === 'string' && typeof item.userId === 'string' && !!item.page) : []
  } catch { return [] }
}

export function cachePageForOffline(value: CachedPageAccess, storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage) {
  const entry: Entry = { ...value, cachedAt: new Date().toISOString() }
  const entries = [entry, ...readCachedPages(value.userId, storage).filter(item => item.page.id !== value.page.id)].slice(0, MAX_PAGES)
  while (entries.length && new TextEncoder().encode(JSON.stringify(entries)).byteLength > MAX_BYTES) entries.pop()
  storage.setItem(key(value.userId), JSON.stringify(entries))
}

export function getCachedPage(userId: string, pageId: string, storage: Pick<Storage, 'getItem'> = localStorage): CachedPageAccess | null {
  const entry = readCachedPages(userId, storage).find(item => item.page.id === pageId)
  if (!entry) return null
  // Entries cached before canManage existed won't have it — fall back to isOwner,
  // which was the only way to reach management UI at the time they were cached.
  return { page: entry.page, canEdit: entry.canEdit, canManage: entry.canManage ?? entry.isOwner, isOwner: entry.isOwner, isWorkspaceMember: entry.isWorkspaceMember, userId: entry.userId }
}

export function clearOfflinePages(userId: string, storage: Pick<Storage, 'removeItem'> = localStorage) { storage.removeItem(key(userId)) }

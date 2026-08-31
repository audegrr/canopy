import type { Page } from './types'

const PREFIX = 'canopy:offline-saves:v1:'
const MAX_ITEMS = 50
const MAX_BYTES = 2 * 1024 * 1024

function key(userId: string) { return PREFIX + userId }

export type OfflineSave = {
  pageId: string
  workspaceId: string
  updates: Partial<Page>
  queuedAt: string
}

// Scoped per userId (like offline-page-cache.ts) so that queued edits from one
// account on a shared device never get replayed under a different account that
// signs in afterwards.
export function readOfflineSaves(userId: string, storage: Pick<Storage, 'getItem'> = localStorage): OfflineSave[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(key(userId)) || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is OfflineSave => !!item && typeof item === 'object' && typeof item.pageId === 'string' && typeof item.workspaceId === 'string' && typeof item.queuedAt === 'string' && !!item.updates && typeof item.updates === 'object')
  } catch { return [] }
}

export function queueOfflineSave(userId: string, save: OfflineSave, storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage) {
  const current = readOfflineSaves(userId, storage)
  const previous = current.find(item => item.pageId === save.pageId)
  const merged: OfflineSave = previous ? { ...save, updates: { ...previous.updates, ...save.updates } } : save
  let next = [...current.filter(item => item.pageId !== save.pageId), merged].slice(-MAX_ITEMS)
  while (next.length && new TextEncoder().encode(JSON.stringify(next)).byteLength > MAX_BYTES) next = next.slice(1)
  storage.setItem(key(userId), JSON.stringify(next))
}

export function removeOfflineSave(userId: string, pageId: string, storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage) {
  storage.setItem(key(userId), JSON.stringify(readOfflineSaves(userId, storage).filter(item => item.pageId !== pageId)))
}

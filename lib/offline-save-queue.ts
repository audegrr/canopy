import type { Page } from './types'

const STORAGE_KEY = 'canopy:offline-saves:v1'
const MAX_ITEMS = 50
const MAX_BYTES = 2 * 1024 * 1024

export type OfflineSave = {
  pageId: string
  workspaceId: string
  updates: Partial<Page>
  queuedAt: string
}

export function readOfflineSaves(storage: Pick<Storage, 'getItem'> = localStorage): OfflineSave[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(STORAGE_KEY) || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is OfflineSave => !!item && typeof item === 'object' && typeof item.pageId === 'string' && typeof item.workspaceId === 'string' && typeof item.queuedAt === 'string' && !!item.updates && typeof item.updates === 'object')
  } catch { return [] }
}

export function queueOfflineSave(save: OfflineSave, storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage) {
  const current = readOfflineSaves(storage)
  const previous = current.find(item => item.pageId === save.pageId)
  const merged: OfflineSave = previous ? { ...save, updates: { ...previous.updates, ...save.updates } } : save
  let next = [...current.filter(item => item.pageId !== save.pageId), merged].slice(-MAX_ITEMS)
  while (next.length && new TextEncoder().encode(JSON.stringify(next)).byteLength > MAX_BYTES) next = next.slice(1)
  storage.setItem(STORAGE_KEY, JSON.stringify(next))
}

export function removeOfflineSave(pageId: string, storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage) {
  storage.setItem(STORAGE_KEY, JSON.stringify(readOfflineSaves(storage).filter(item => item.pageId !== pageId)))
}

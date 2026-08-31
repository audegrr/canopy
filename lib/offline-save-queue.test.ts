import { describe, expect, it } from 'vitest'
import { queueOfflineSave, readOfflineSaves, removeOfflineSave } from './offline-save-queue'

function memoryStorage() {
  const values = new Map<string, string>()
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, next: string) => { values.set(key, next) } }
}

describe('offline save queue', () => {
  it('merges successive edits for one page', () => {
    const storage = memoryStorage()
    queueOfflineSave('u1', { pageId: 'p', workspaceId: 'w', updates: { title: 'Title' }, queuedAt: '1' }, storage)
    queueOfflineSave('u1', { pageId: 'p', workspaceId: 'w', updates: { icon: '🌿' }, queuedAt: '2' }, storage)
    expect(readOfflineSaves('u1', storage)).toEqual([{ pageId: 'p', workspaceId: 'w', updates: { title: 'Title', icon: '🌿' }, queuedAt: '2' }])
  })

  it('removes a successfully replayed edit', () => {
    const storage = memoryStorage()
    queueOfflineSave('u1', { pageId: 'p', workspaceId: 'w', updates: {}, queuedAt: '1' }, storage)
    removeOfflineSave('u1', 'p', storage)
    expect(readOfflineSaves('u1', storage)).toEqual([])
  })

  it('keeps queued edits isolated between accounts on the same device', () => {
    const storage = memoryStorage()
    queueOfflineSave('u1', { pageId: 'p', workspaceId: 'w', updates: { title: 'From account 1' }, queuedAt: '1' }, storage)
    expect(readOfflineSaves('u2', storage)).toEqual([])
    expect(readOfflineSaves('u1', storage)).toHaveLength(1)
  })
})

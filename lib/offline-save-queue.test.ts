import { describe, expect, it } from 'vitest'
import { queueOfflineSave, readOfflineSaves, removeOfflineSave } from './offline-save-queue'

function memoryStorage() {
  let value: string | null = null
  return { getItem: () => value, setItem: (_key: string, next: string) => { value = next } }
}

describe('offline save queue', () => {
  it('merges successive edits for one page', () => {
    const storage = memoryStorage()
    queueOfflineSave({ pageId: 'p', workspaceId: 'w', updates: { title: 'Title' }, queuedAt: '1' }, storage)
    queueOfflineSave({ pageId: 'p', workspaceId: 'w', updates: { icon: '🌿' }, queuedAt: '2' }, storage)
    expect(readOfflineSaves(storage)).toEqual([{ pageId: 'p', workspaceId: 'w', updates: { title: 'Title', icon: '🌿' }, queuedAt: '2' }])
  })

  it('removes a successfully replayed edit', () => {
    const storage = memoryStorage()
    queueOfflineSave({ pageId: 'p', workspaceId: 'w', updates: {}, queuedAt: '1' }, storage)
    removeOfflineSave('p', storage)
    expect(readOfflineSaves(storage)).toEqual([])
  })
})

import { describe, expect, it } from 'vitest'
import { backupFilename, parseWorkspaceBackup } from './workspace-backup'

const valid = {
  format: 'canopy-workspace', version: 1, exported_at: '2026-01-01T00:00:00.000Z',
  workspace: { name: 'Demo', icon: '🌿', accent_color: '#123456' },
  pages: [{ source_id: 'page-1', parent_source_id: null, title: 'Home', icon: '', cover_url: '', cover_position: null, toc_max_level: null, content: [], position: 1, is_database: false, is_locked: false }],
  database_fields: [], database_records: [],
}

describe('workspace backups', () => {
  it('accepts a valid backup', () => expect(parseWorkspaceBackup(JSON.stringify(valid)).pages).toHaveLength(1))
  it('rejects a broken hierarchy', () => expect(() => parseWorkspaceBackup(JSON.stringify({ ...valid, pages: [{ ...valid.pages[0], parent_source_id: 'missing' }] }))).toThrow(/hierarchy/))
  it('creates a filesystem-safe filename', () => expect(backupFilename('Équipe Produit', new Date('2026-07-19'))).toBe('canopy-equipe-produit-2026-07-19.json'))
})

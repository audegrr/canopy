import type { TiptapContent } from './types'

export const WORKSPACE_BACKUP_VERSION = 1
export const MAX_BACKUP_BYTES = 15 * 1024 * 1024
export const MAX_BACKUP_PAGES = 2_000
export const MAX_BACKUP_FIELDS = 10_000
export const MAX_BACKUP_RECORDS = 50_000
export const MAX_BACKUP_COMMENTS = 50_000
export const MAX_BACKUP_SNAPSHOTS = 20_000

export type BackupPage = {
  source_id: string
  parent_source_id: string | null
  title: string
  icon: string
  cover_url: string
  cover_position: string | null
  toc_max_level: number | null
  content: TiptapContent
  position: number
  is_database: boolean
  is_locked: boolean
}

export type BackupField = {
  source_id: string
  page_source_id: string
  name: string
  type: string
  options: unknown[]
  relation_page_source_id: string | null
  rollup_field_source_id: string | null
  rollup_relation: string | null
  rollup_field: string | null
  rollup_fn: string | null
  relation_column_source_id: string | null
  position: number
  hidden_from_viewers: boolean
}

export type BackupRecord = {
  page_source_id: string
  data: Record<string, unknown>
  position: number
}

export type BackupComment = { page_source_id: string; body: string; anchor_id: string | null; created_at: string }
export type BackupSnapshot = { page_source_id: string; title: string; content: TiptapContent; created_at: string }

export type WorkspaceBackup = {
  format: 'canopy-workspace'
  version: typeof WORKSPACE_BACKUP_VERSION
  exported_at: string
  workspace: { name: string; icon: string; accent_color: string | null }
  pages: BackupPage[]
  database_fields: BackupField[]
  database_records: BackupRecord[]
  comments: BackupComment[]
  snapshots: BackupSnapshot[]
  asset_urls: string[]
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseWorkspaceBackup(text: string): WorkspaceBackup {
  if (new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES) throw new Error('Backup exceeds the 15 MB import limit.')
  let value: unknown
  try { value = JSON.parse(text) } catch { throw new Error('This file is not valid JSON.') }
  if (!isObject(value) || value.format !== 'canopy-workspace' || value.version !== WORKSPACE_BACKUP_VERSION) {
    throw new Error('This is not a supported Canopy workspace backup.')
  }
  if (!isObject(value.workspace) || !Array.isArray(value.pages) || !Array.isArray(value.database_fields) || !Array.isArray(value.database_records)) {
    throw new Error('The backup is incomplete.')
  }
  if (value.pages.length > MAX_BACKUP_PAGES || value.database_fields.length > MAX_BACKUP_FIELDS || value.database_records.length > MAX_BACKUP_RECORDS) {
    throw new Error('The backup contains too many items for a safe import.')
  }
  const comments = Array.isArray(value.comments) ? value.comments : []
  const snapshots = Array.isArray(value.snapshots) ? value.snapshots : []
  const assetUrls = Array.isArray(value.asset_urls) ? value.asset_urls : []
  if (comments.length > MAX_BACKUP_COMMENTS || snapshots.length > MAX_BACKUP_SNAPSHOTS || assetUrls.length > 20_000) throw new Error('The backup contains too many supplemental items for a safe import.')
  const pages = value.pages as unknown[]
  const ids = new Set<string>()
  for (const page of pages) {
    if (!isObject(page) || typeof page.source_id !== 'string' || typeof page.title !== 'string' || typeof page.position !== 'number') {
      throw new Error('The backup contains an invalid page.')
    }
    if (ids.has(page.source_id)) throw new Error('The backup contains duplicate page identifiers.')
    ids.add(page.source_id)
  }
  for (const page of pages) {
    const parent = (page as Record<string, unknown>).parent_source_id
    if (parent !== null && (typeof parent !== 'string' || !ids.has(parent))) throw new Error('The backup contains a broken page hierarchy.')
  }
  for (const field of value.database_fields as unknown[]) {
    if (!isObject(field) || typeof field.source_id !== 'string' || typeof field.page_source_id !== 'string' || !ids.has(field.page_source_id)) {
      throw new Error('The backup contains an invalid database field.')
    }
  }
  for (const record of value.database_records as unknown[]) {
    if (!isObject(record) || typeof record.page_source_id !== 'string' || !ids.has(record.page_source_id) || !isObject(record.data)) {
      throw new Error('The backup contains an invalid database record.')
    }
  }
  for (const comment of comments) {
    if (!isObject(comment) || typeof comment.page_source_id !== 'string' || !ids.has(comment.page_source_id) || typeof comment.body !== 'string') throw new Error('The backup contains an invalid comment.')
  }
  for (const snapshot of snapshots) {
    if (!isObject(snapshot) || typeof snapshot.page_source_id !== 'string' || !ids.has(snapshot.page_source_id) || typeof snapshot.title !== 'string') throw new Error('The backup contains an invalid snapshot.')
  }
  if (!assetUrls.every(url => typeof url === 'string' && /^https?:\/\//.test(url))) throw new Error('The backup contains an invalid asset URL.')
  return { ...value, comments, snapshots, asset_urls: assetUrls } as WorkspaceBackup
}

export function collectAssetUrls(value: unknown): string[] {
  const urls = new Set<string>()
  function visit(item: unknown) {
    if (typeof item === 'string' && /^https?:\/\//.test(item)) urls.add(item)
    else if (Array.isArray(item)) item.forEach(visit)
    else if (isObject(item)) Object.values(item).forEach(visit)
  }
  visit(value)
  return [...urls].sort()
}

export function backupFilename(name: string, date = new Date()): string {
  const safe = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'workspace'
  return `canopy-${safe}-${date.toISOString().slice(0, 10)}.json`
}

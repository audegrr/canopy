'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { backupFilename, parseWorkspaceBackup, type WorkspaceBackup } from '@/lib/workspace-backup'
import type { Workspace } from '@/lib/types'

export default function WorkspaceBackupSection({ workspace }: { workspace: Workspace }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<'export' | 'import' | null>(null)
  const [message, setMessage] = useState('')

  async function exportWorkspace() {
    setBusy('export'); setMessage('')
    const supabase = createClient()
    const { data: pages, error } = await supabase.from('pages').select('*').eq('workspace_id', workspace.id).is('deleted_at', null).order('position')
    if (error || !pages) { setMessage('Export failed. Please try again.'); setBusy(null); return }
    const pageIds = pages.map(page => page.id)
    const [{ data: fields }, { data: records }] = pageIds.length ? await Promise.all([
      supabase.from('db_fields').select('*').in('page_id', pageIds).order('position'),
      supabase.from('db_records').select('*').in('page_id', pageIds).order('position'),
    ]) : [{ data: [] }, { data: [] }]
    const backup: WorkspaceBackup = {
      format: 'canopy-workspace', version: 1, exported_at: new Date().toISOString(),
      workspace: { name: workspace.name, icon: workspace.icon, accent_color: workspace.accent_color ?? null },
      pages: pages.map(page => ({ source_id: page.id, parent_source_id: page.parent_id, title: page.title || '', icon: page.icon || '', cover_url: page.cover_url || '', cover_position: page.cover_position ?? null, toc_max_level: page.toc_max_level ?? null, content: page.content || [], position: page.position || 0, is_database: !!page.is_database, is_locked: !!page.is_locked })),
      database_fields: (fields || []).map(field => ({ source_id: field.id, page_source_id: field.page_id, name: field.name, type: field.type, options: field.options || [], relation_page_source_id: field.relation_page_id, rollup_field_source_id: field.rollup_field_id, rollup_relation: field.rollup_relation, rollup_field: field.rollup_field, rollup_fn: field.rollup_fn, relation_column_source_id: field.relation_column_id, position: field.position || 0, hidden_from_viewers: !!field.hidden_from_viewers })),
      database_records: (records || []).map(record => ({ page_source_id: record.page_id, data: record.data || {}, position: record.position || 0 })),
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = backupFilename(workspace.name); link.click(); URL.revokeObjectURL(url)
    setMessage(`${pages.length} page${pages.length === 1 ? '' : 's'} exported.`); setBusy(null)
  }

  async function importWorkspace(file: File) {
    setBusy('import'); setMessage('')
    try {
      const backup = parseWorkspaceBackup(await file.text())
      const supabase = createClient()
      const pageMap = new Map<string, string>()
      const pending = [...backup.pages]
      while (pending.length) {
        const index = pending.findIndex(page => !page.parent_source_id || pageMap.has(page.parent_source_id))
        if (index < 0) throw new Error('The page hierarchy cannot be imported.')
        const [page] = pending.splice(index, 1)
        const { data, error } = await supabase.from('pages').insert({ workspace_id: workspace.id, parent_id: page.parent_source_id ? pageMap.get(page.parent_source_id) : null, title: page.title, icon: page.icon, cover_url: page.cover_url, cover_position: page.cover_position, toc_max_level: page.toc_max_level, content: page.content, position: page.position, is_database: page.is_database, is_locked: page.is_locked, link_permission: 'none' }).select('id').single()
        if (error || !data) throw new Error(error?.message || 'A page could not be imported.')
        pageMap.set(page.source_id, data.id)
      }
      const fieldMap = new Map<string, string>()
      for (const field of backup.database_fields) {
        const { data, error } = await supabase.from('db_fields').insert({ page_id: pageMap.get(field.page_source_id), name: field.name, type: field.type, options: field.options, relation_page_id: field.relation_page_source_id ? pageMap.get(field.relation_page_source_id) ?? null : null, rollup_relation: field.rollup_relation, rollup_field: field.rollup_field, rollup_fn: field.rollup_fn, position: field.position, hidden_from_viewers: field.hidden_from_viewers }).select('id').single()
        if (error || !data) throw new Error(error?.message || 'A database field could not be imported.')
        fieldMap.set(field.source_id, data.id)
      }
      for (const field of backup.database_fields) {
        const patch: Record<string, string> = {}
        if (field.rollup_field_source_id && fieldMap.has(field.rollup_field_source_id)) patch.rollup_field_id = fieldMap.get(field.rollup_field_source_id)!
        if (field.relation_column_source_id && fieldMap.has(field.relation_column_source_id)) patch.relation_column_id = fieldMap.get(field.relation_column_source_id)!
        if (Object.keys(patch).length) await supabase.from('db_fields').update(patch).eq('id', fieldMap.get(field.source_id))
      }
      if (backup.database_records.length) {
        const rows = backup.database_records.map(record => ({ page_id: pageMap.get(record.page_source_id), data: record.data, position: record.position }))
        for (let index = 0; index < rows.length; index += 500) {
          const { error } = await supabase.from('db_records').insert(rows.slice(index, index + 500))
          if (error) throw new Error(error.message)
        }
      }
      setMessage(`${backup.pages.length} page${backup.pages.length === 1 ? '' : 's'} imported. Reloading…`)
      window.setTimeout(() => window.location.reload(), 700)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Import failed.')
      setBusy(null)
    } finally { if (inputRef.current) inputRef.current.value = '' }
  }

  return <div style={{ marginTop: 22, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Portable backup</div>
    <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 10 }}>Export pages and databases to a local JSON file, or add content from a previous Canopy backup. Existing content is never replaced.</div>
    <input ref={inputRef} type="file" accept="application/json,.json" hidden onChange={event => { const file = event.target.files?.[0]; if (file) void importWorkspace(file) }} />
    <div style={{ display: 'flex', gap: 8 }}>
      <button disabled={busy !== null} onClick={() => void exportWorkspace()} style={buttonStyle}>{busy === 'export' ? 'Exporting…' : 'Export workspace'}</button>
      <button disabled={busy !== null} onClick={() => inputRef.current?.click()} style={buttonStyle}>{busy === 'import' ? 'Importing…' : 'Import backup'}</button>
    </div>
    {message && <div role="status" style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 8 }}>{message}</div>}
  </div>
}

const buttonStyle: React.CSSProperties = { border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', borderRadius: 5, padding: '6px 10px', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-sans)' }

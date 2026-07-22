'use client'
import { useState, useEffect, useEffectEvent, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Page, DbField, DbRecord } from '@/lib/types'
import { downloadXlsx } from '@/lib/spreadsheet-xlsx'
import { FieldMenu, RelationPagePicker, SelectEditor } from './DatabaseFieldControls'
import DatabaseImportModal from './DatabaseImportModal'
import { Icon } from './Icons'

type View = 'table' | 'board' | 'gallery' | 'calendar'

type Props = { page: Page; canEdit: boolean }

const FIELD_ICONS: Record<string, string> = {
  text: 'Aa', number: '#', currency: '$', select: '◉', multiselect: '◈',
  date: '▦', checkbox: '☐', relation: '⤴', rollup: 'Σ',
  url: '⊕', email: '@', phone: '℡'
}

const SELECT_COLORS = [
  '#fde68a','#bbf7d0','#bfdbfe','#fecaca','#e9d5ff',
  '#fed7aa','#cffafe','#fbcfe8','#d1fae5','#ddd6fe'
]

const FIELD_TYPES: DbField['type'][] = ['text','number','currency','select','multiselect','date','checkbox','relation','rollup','url','email','phone']

// Module-level cache, keyed by page.id — persists across navigations within
// the same client session (unlike page content, fields/records live in their
// own tables and would otherwise re-fetch from empty on every visit, unlike
// a regular doc page whose content ships with the cached page row).
const dbCache = new Map<string, { fields: DbField[]; records: DbRecord[]; relations: any[] }>()

export default function DatabaseView({ page, canEdit }: Props) {
  const [fields, setFields] = useState<DbField[]>(() => dbCache.get(page.id)?.fields ?? [])
  const [records, setRecords] = useState<DbRecord[]>(() => dbCache.get(page.id)?.records ?? [])
  const [view, setView] = useState<View>('table')
  const [filters, setFilters] = useState<{ id: number; field: string; op: string; value: string }[]>([])
  const [sort, setSort] = useState({ field: '', dir: 'asc' as 'asc' | 'desc' })
  const [editingCell, setEditingCell] = useState<{ recId: string; fieldId: string } | null>(null)
  const [addingField, setAddingField] = useState(false)
  const [newField, setNewField] = useState({ name: '', type: 'text' as DbField['type'] })
  const [showFilters, setShowFilters] = useState(false)
  const [relatedPages, setRelatedPages] = useState<{id: string; title: string; icon: string}[]>([])
  const [relatedRecords, setRelatedRecords] = useState<Record<string, DbRecord[]>>({})
  const [relations, setRelations] = useState<any[]>(() => dbCache.get(page.id)?.relations ?? [])
  const [toast, setToast] = useState('')
  const [dragColIdx, setDragColIdx] = useState<number | null>(null)
  const [dragOverColIdx, setDragOverColIdx] = useState<number | null>(null)
  const [renamingFieldId, setRenamingFieldId] = useState<string | null>(null)
  const [detailRecId, setDetailRecId] = useState<string | null>(null)
  const [crossDbDetail, setCrossDbDetail] = useState<{ rec: DbRecord; fields: DbField[]; pageTitle: string } | null>(null)
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null)
  const [dragOverGroup, setDragOverGroup] = useState<string | null>(null)
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() } })
  const [showImport, setShowImport] = useState(false)
  const [dbSearch, setDbSearch] = useState('')
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set())
  const [visibleRowLimit, setVisibleRowLimit] = useState(200)
  const relatedFieldsRef = useRef<Record<string, DbField[]>>({})
  const supabase = useMemo(() => createClient(), [])
  const [realtimeStatus, setRealtimeStatus] = useState<'connecting' | 'live' | 'offline'>('connecting')

  async function loadData() {
    try {
      const [{ data: f, error: fErr }, { data: r, error: rErr }, { data: rel }] = await Promise.all([
        supabase.from('db_fields').select('*').eq('page_id', page.id).order('position'),
        supabase.from('db_records').select('*').eq('page_id', page.id).order('position'),
        supabase.from('db_relations').select('*')
      ])
      if (fErr || rErr) { setToast('Failed to load database'); return }
      const fieldsData = f || []
      setFields(fieldsData)
      setRecords(r || [])
      setRelations(rel || [])

      const relFields = fieldsData.filter((x: DbField) => x.type === 'relation' && x.relation_page_id)
      // Also include current page if any relation points to itself
      const pageIds = relFields.length > 0
        ? [...new Set(relFields.map((x: DbField) => x.relation_page_id!))]
        : []
      if (pageIds.length > 0) {
        const { data: rPages } = await supabase.from('pages').select('id, title, icon').in('id', pageIds)
        setRelatedPages(rPages || [])
        const rRecs: Record<string, DbRecord[]> = {}
        const rFields: Record<string, DbField[]> = {}
        for (const pid of pageIds) {
          // Use current records if linking to self
          if (pid === page.id) {
            rRecs[pid] = r || []
            rFields[pid] = fieldsData
          } else {
            const [{ data: rr }, { data: rf }] = await Promise.all([
              supabase.from('db_records').select('*').eq('page_id', pid),
              supabase.from('db_fields').select('*').eq('page_id', pid).order('position')
            ])
            rRecs[pid] = rr || []
            rFields[pid] = rf || []
          }
        }
        setRelatedRecords(rRecs)
        // Store related fields for first-column lookup (include self)
        rFields[page.id] = fieldsData
        relatedFieldsRef.current = rFields
      }
    } catch {
      setToast('Failed to load database')
    }
  }

  const loadDataEvent = useEffectEvent(() => loadData())
  useEffect(() => { loadDataEvent() }, [page.id])

  // Keep the cross-mount cache in sync with whatever is on screen, regardless
  // of whether it changed via the initial load, realtime, or a local edit.
  useEffect(() => { dbCache.set(page.id, { fields, records, relations }) }, [page.id, fields, records, relations])

  useEffect(() => {
    const channel = supabase.channel(`database:${page.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'db_records', filter: `page_id=eq.${page.id}` }, payload => {
        if (payload.eventType === 'DELETE') setRecords(rows => rows.filter(row => row.id !== (payload.old as { id: string }).id))
        else {
          const row = payload.new as DbRecord
          setRecords(rows => rows.some(item => item.id === row.id) ? rows.map(item => item.id === row.id ? row : item) : [...rows, row].sort((a, b) => a.position - b.position))
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'db_fields', filter: `page_id=eq.${page.id}` }, payload => {
        if (payload.eventType === 'DELETE') setFields(items => items.filter(item => item.id !== (payload.old as { id: string }).id))
        else {
          const field = payload.new as DbField
          setFields(items => items.some(item => item.id === field.id) ? items.map(item => item.id === field.id ? field : item) : [...items, field].sort((a, b) => a.position - b.position))
        }
      })
      .subscribe(status => setRealtimeStatus(status === 'SUBSCRIBED' ? 'live' : status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' ? 'offline' : 'connecting'))
    return () => { void supabase.removeChannel(channel) }
  }, [page.id, supabase])

  async function addRecord() {
    const maxPos = records.reduce((m, r) => Math.max(m, r.position), 0)
    const { data } = await supabase.from('db_records').insert({ page_id: page.id, data: {}, position: maxPos + 1 }).select().single()
    if (data) setRecords(r => [...r, data])
  }

  async function deleteRecord(id: string) {
    await supabase.from('db_records').delete().eq('id', id)
    setRecords(r => r.filter(x => x.id !== id))
  }

  async function updateCell(recId: string, fieldId: string, value: any) {
    const rec = records.find(r => r.id === recId)
    if (!rec) return
    const newData = { ...rec.data, [fieldId]: value }
    await supabase.from('db_records').update({ data: newData }).eq('id', recId)
    setRecords(r => r.map(x => x.id === recId ? { ...x, data: newData } : x))
    setEditingCell(prev => (prev?.recId === recId && prev?.fieldId === fieldId) ? null : prev)
  }

  async function addField() {
    if (!newField.name.trim()) return
    const maxPos = fields.reduce((m, f) => Math.max(m, f.position), 0)
    const { data } = await supabase.from('db_fields').insert({
      page_id: page.id, name: newField.name.trim(), type: newField.type,
      options: [], position: maxPos + 1
    }).select().single()
    if (data) { setFields(f => [...f, data]); setNewField({ name: '', type: 'text' }); setAddingField(false) }
  }

  async function deleteField(id: string) {
    await supabase.from('db_fields').delete().eq('id', id)
    setFields(f => f.filter(x => x.id !== id))
  }

  async function updateField(id: string, updates: Partial<DbField>) {
    await supabase.from('db_fields').update(updates).eq('id', id)
    setFields(f => f.map(x => x.id === id ? { ...x, ...updates } as DbField : x))
  }

  async function addSelectOption(fieldId: string, option: string, color?: string) {
    const field = fields.find(f => f.id === fieldId)
    if (!field || !option.trim()) return
    const autoColor = SELECT_COLORS[(field.options?.length || 0) % SELECT_COLORS.length]
    const newOptions = [...(field.options || []), { label: option.trim(), color: color || autoColor }]
    await updateField(fieldId, { options: newOptions })
  }

  async function toggleRelation(fieldId: string, recId: string, relatedRecId: string) {
    const existing = relations.find(r => r.field_id === fieldId && r.from_record_id === recId && r.to_record_id === relatedRecId)
    if (existing) {
      await supabase.from('db_relations').delete().eq('id', existing.id)
      setRelations(r => r.filter(x => x.id !== existing.id))
    } else {
      const { data } = await supabase.from('db_relations').insert({ field_id: fieldId, from_record_id: recId, to_record_id: relatedRecId }).select().single()
      if (data) setRelations(r => [...r, data])
    }
  }

  async function createLinkedRecord(field: DbField, fromRecId: string, name: string) {
    const targetPageId = field.relation_page_id
    if (!targetPageId) return
    const isSelf = targetPageId === page.id
    const targetFields: DbField[] = isSelf ? fields : (relatedFieldsRef.current[targetPageId] || [])
    const firstField = targetFields[0]
    const newData = firstField ? { [firstField.id]: name } : {}
    const allTargetRecs = isSelf ? records : (relatedRecords[targetPageId] || [])
    const maxPos = allTargetRecs.reduce((m, r) => Math.max(m, r.position), 0)
    const { data: newRec } = await supabase.from('db_records').insert({
      page_id: targetPageId, data: newData, position: maxPos + 1
    }).select().single()
    if (!newRec) return
    if (isSelf) setRecords(r => [...r, newRec as DbRecord])
    else setRelatedRecords(r => ({ ...r, [targetPageId]: [...(r[targetPageId] || []), newRec as DbRecord] }))
    await toggleRelation(field.id, fromRecId, newRec.id)
  }

  // Column drag & drop
  function handleColDragStart(idx: number) { setDragColIdx(idx) }
  function handleColDragOver(idx: number) { setDragOverColIdx(idx) }
  async function handleColDrop() {
    if (dragColIdx === null || dragOverColIdx === null || dragColIdx === dragOverColIdx || dragOverColIdx === 0) {
      setDragColIdx(null); setDragOverColIdx(null); return
    }
    const reordered = [...fields]
    const [moved] = reordered.splice(dragColIdx, 1)
    reordered.splice(dragOverColIdx, 0, moved)
    // Update positions
    const updated = reordered.map((f, i) => ({ ...f, position: i + 1 }))
    setFields(updated)
    for (const f of updated) await supabase.from('db_fields').update({ position: f.position }).eq('id', f.id)
    setDragColIdx(null); setDragOverColIdx(null)
  }

  function showToastMsg(msg: string) { setToast(msg); setTimeout(() => setToast(''), 2000) }

  function getExportRecords() {
    return selectedRows.size > 0 ? records.filter(r => selectedRows.has(r.id)) : displayRecords
  }

  function exportCSV() {
    const exportRecs = getExportRecords()
    const header = fields.map(f => `"${f.name.replace(/"/g, '""')}"`).join(',')
    const rows = exportRecs.map(rec =>
      fields.map(f => `"${String(rec.data?.[f.id] ?? '').replace(/"/g, '""')}"`)
        .join(',')
    )
    const csv = [header, ...rows].join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = (page.title || 'database') + '.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function exportXLSX() {
    const exportRecs = getExportRecords()
    const header = fields.map(f => f.name)
    const rows = exportRecs.map(rec => fields.map(f => {
      const v = rec.data?.[f.id]
      if (f.type === 'checkbox') return v ? 'Yes' : 'No'
      if (f.type === 'number') return v !== undefined && v !== '' ? Number(v) : ''
      return String(v ?? '')
    }))
    await downloadXlsx((page.title || 'database') + '.xlsx', page.title || 'Database', [header, ...rows])
  }

  async function deleteSelectedRows() {
    if (selectedRows.size === 0) return
    const ids = [...selectedRows]
    await supabase.from('db_records').delete().in('id', ids)
    setRecords(r => r.filter(x => !selectedRows.has(x.id)))
    setSelectedRows(new Set())
    showToastMsg(`Deleted ${ids.length} record${ids.length !== 1 ? 's' : ''}`)
  }

  // Filter & sort
  let displayRecords = [...records]

  // Free-text search across all field values
  if (dbSearch.trim()) {
    const q = dbSearch.trim().toLowerCase()
    displayRecords = displayRecords.filter(r =>
      fields.some(f => String(r.data?.[f.id] ?? '').toLowerCase().includes(q))
    )
  }

  const activeFilters = filters.filter(f => f.field && (f.op === 'not_empty' || f.value))
  if (activeFilters.length > 0) {
    displayRecords = displayRecords.filter(r =>
      activeFilters.every(f => {
        const val = String(r.data?.[f.field] ?? '')
        if (f.op === 'contains') return val.toLowerCase().includes(f.value.toLowerCase())
        if (f.op === 'equals') return val === f.value
        if (f.op === 'not_equals') return val !== f.value
        if (f.op === 'not_empty') return !!val
        if (f.op === 'is_empty') return !val
        return true
      })
    )
  }
  if (sort.field) {
    const sortFieldType = fields.find(f => f.id === sort.field)?.type
    const isNumeric = sortFieldType === 'number' || sortFieldType === 'currency'
    displayRecords.sort((a, b) => {
      const rawA = a.data?.[sort.field], rawB = b.data?.[sort.field]
      if (isNumeric) {
        // Compare as numbers, not strings — otherwise "11000" sorts before
        // "4000" because '1' < '4' lexicographically.
        const na = rawA === '' || rawA == null ? NaN : Number(rawA)
        const nb = rawB === '' || rawB == null ? NaN : Number(rawB)
        if (isNaN(na) && isNaN(nb)) return 0
        if (isNaN(na)) return 1
        if (isNaN(nb)) return -1
        return sort.dir === 'asc' ? na - nb : nb - na
      }
      const av = String(rawA ?? ''), bv = String(rawB ?? '')
      return sort.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
    })
  }
  const tableRecords = displayRecords.slice(0, visibleRowLimit)

  useEffect(() => { setVisibleRowLimit(200) }, [page.id, dbSearch, filters, sort.field, sort.dir])

  // Viewers can't see fields marked hidden_from_viewers
  const visibleFields = canEdit ? fields : fields.filter(f => !f.hidden_from_viewers)

  const selectField = visibleFields.find(f => f.type === 'select')
  const boardGroups = selectField
    ? [...(selectField.options || []).map((o: any) => o.label || o), 'No status'].map(group => ({
        label: group, color: (selectField.options || []).find((o: any) => (o.label || o) === group)?.color,
        records: displayRecords.filter(r => (r.data?.[selectField.id] || 'No status') === group)
      }))
    : [{ label: 'All', color: undefined, records: displayRecords }]

  // ── CELL RENDERER ─────────────────────────────────────────────────────────
  function CellValue({ rec, field }: { rec: DbRecord; field: DbField }) {
    const val = rec.data?.[field.id]
    const isEditing = editingCell?.recId === rec.id && editingCell?.fieldId === field.id
    const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)

    useEffect(() => {
      if (isEditing && inputRef.current && field.type !== 'checkbox' && field.type !== 'select' && field.type !== 'relation') {
        // Focus after a tiny delay so the click event positions the cursor first
        const t = setTimeout(() => {
          inputRef.current?.focus()
          // Text cells wrap over multiple lines in display mode — grow the
          // textarea to match so the start of the value stays visible instead
          // of scrolling off behind a single-line box.
          if (field.type === 'text' && inputRef.current) {
            const el = inputRef.current as HTMLTextAreaElement
            el.style.height = 'auto'
            el.style.height = el.scrollHeight + 'px'
          }
        }, 10)
        return () => clearTimeout(t)
      }
    }, [isEditing, field.type])

    if (isEditing) {
      if (field.type === 'checkbox') return (
        <input type="checkbox" checked={!!val} autoFocus
          onChange={e => updateCell(rec.id, field.id, e.target.checked)}
          style={{ width: 16, height: 16, accentColor: 'var(--accent)', cursor: 'pointer' }} />
      )
      if (field.type === 'select') {
        // Get cell position for fixed positioning
        const cellEl = document.querySelector(`[data-cell="${rec.id}-${field.id}"]`) as HTMLElement
        const cellRect = cellEl?.getBoundingClientRect()
        return (
          <SelectEditor
            field={field}
            currentValue={val}
            cellRect={cellRect}
            onSelect={(v: string) => updateCell(rec.id, field.id, v)}
            onAddOption={(label: string, color?: string) => addSelectOption(field.id, label, color)}
            onDeleteOption={async (label: string) => {
              const newOpts = (field.options || []).filter((o: any) => (o.label || o) !== label)
              await updateField(field.id, { options: newOpts })
              if (val === label) updateCell(rec.id, field.id, '')
            }}
            onUpdateOptionColor={async (label: string, color: string) => {
              const newOpts = (field.options || []).map((o: any) =>
                (o.label || o) === label ? { ...o, color } : o
              )
              await updateField(field.id, { options: newOpts })
            }}
            onClose={() => setEditingCell(null)}
          />
        )
      }
      if (field.type === 'relation') {
        const isSelf = field.relation_page_id === page.id
        const relPage = isSelf ? page : (relatedPages.find(p => p.id === field.relation_page_id) ?? null)
        const recs = isSelf ? records : (relatedRecords[field.relation_page_id || ''] || [])
        const activeRelIds = relations.filter(r => r.field_id === field.id && r.from_record_id === rec.id).map(r => r.to_record_id)
        const relFieldsList: DbField[] = isSelf ? fields : (relatedFieldsRef.current[field.relation_page_id || ''] || [])
        const firstTextField = relFieldsList.length > 0 ? relFieldsList[0].id : null
        const cellEl5 = document.querySelector(`[data-cell="${rec.id}-${field.id}"]`) as HTMLElement
        const cellRect5 = cellEl5?.getBoundingClientRect() ?? null
        return (
          <RelationPicker
            field={field} rec={rec} relPage={relPage} recs={recs}
            activeRelIds={activeRelIds} firstTextField={firstTextField}
            cellRect={cellRect5}
            onToggle={relatedRecId => toggleRelation(field.id, rec.id, relatedRecId)}
            onClose={() => setEditingCell(null)}
            onCreateRecord={name => createLinkedRecord(field, rec.id, name)}
          />
        )
      }
      if (field.type === 'rollup') {
        // Rollup config editor
        const relFields = fields.filter(f => f.type === 'relation')
        const cellElR = document.querySelector(`[data-cell="${rec.id}-${field.id}"]`) as HTMLElement
        const cellRectR = cellElR?.getBoundingClientRect()
        return (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 299 }} onClick={() => setEditingCell(null)} />
            <div style={{ position: 'fixed', left: cellRectR ? Math.min(cellRectR.left, window.innerWidth - 260) : 0, top: cellRectR ? Math.min(cellRectR.bottom + 2, window.innerHeight - 220) : 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 10, zIndex: 300, boxShadow: 'var(--shadow-lg)', minWidth: 240 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 8 }}>Configure rollup</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <select value={field.rollup_relation || ''} onChange={e => updateField(field.id, { rollup_relation: e.target.value })} style={ctrlSt}>
                  <option value="">Relation field…</option>
                  {relFields.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
                {field.rollup_relation && (() => {
                  const rf = fields.find(f => f.id === field.rollup_relation)
                  const rfList: DbField[] = relatedFieldsRef.current[rf?.relation_page_id || ''] || []
                  return (
                    <select value={field.rollup_field || ''} onChange={e => updateField(field.id, { rollup_field: e.target.value })} style={ctrlSt}>
                      <option value="">Field to aggregate…</option>
                      {rfList.map(f => <option key={f.id} value={f.id}>{FIELD_ICONS[f.type]} {f.name}</option>)}
                    </select>
                  )
                })()}
                <select value={field.rollup_fn || 'count'} onChange={e => updateField(field.id, { rollup_fn: e.target.value })} style={ctrlSt}>
                  <option value="count">Count</option>
                  <option value="sum">Sum</option>
                  <option value="avg">Average</option>
                  <option value="min">Min</option>
                  <option value="max">Max</option>
                  <option value="values">List values</option>
                </select>
              </div>
              <button onClick={() => setEditingCell(null)} style={{ marginTop: 8, width: '100%', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-sans)' }}>Done</button>
            </div>
          </>
        )
      }
      if (field.type === 'text') {
        // Plain text cells wrap over multiple lines in display mode (see the
        // `<span>` below) — use a growing textarea so long values don't get
        // clipped to one line while editing, hiding everything but the tail.
        return (
          <textarea ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            defaultValue={String(val ?? '')}
            rows={1}
            onInput={e => { const el = e.currentTarget; el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px' }}
            onBlur={e => updateCell(rec.id, field.id, e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); updateCell(rec.id, field.id, (e.target as HTMLTextAreaElement).value) }
              if (e.key === 'Escape') setEditingCell(null)
            }}
            style={{ width: '100%', display: 'block', resize: 'none', overflow: 'hidden', border: 'none', outline: 'none', boxShadow: 'none', borderRadius: 0, background: 'transparent', fontFamily: 'var(--font-sans)', fontSize: 13, lineHeight: 'inherit', color: 'var(--text)', padding: 0 }}
            onMouseDown={e => e.stopPropagation()} />
        )
      }
      return (
        <input ref={inputRef as React.RefObject<HTMLInputElement>}
          defaultValue={String(val ?? '')}
          onBlur={e => updateCell(rec.id, field.id, e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') updateCell(rec.id, field.id, (e.target as HTMLInputElement).value); if (e.key === 'Escape') setEditingCell(null) }}
          type={field.type === 'number' || field.type === 'currency' ? 'number' : field.type === 'date' ? 'date' : field.type === 'email' ? 'email' : 'url'}
          step={field.type === 'currency' ? '0.01' : undefined}
          style={{ width: '100%', border: 'none', outline: 'none', boxShadow: 'none', borderRadius: 0, background: 'transparent', fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--text)', padding: 0 }}
          onMouseDown={e => e.stopPropagation()} />
      )
    }

    // Display mode
    if (field.type === 'checkbox') return <input type="checkbox" checked={!!val} readOnly style={{ width: 16, height: 16, accentColor: 'var(--accent)', pointerEvents: 'none' }} />
    if (field.type === 'select' && val) {
      const opt = (field.options || []).find((o: any) => (o.label || o) === val)
      return <span style={{ background: (opt?.color || '#e9e9e7') + '50', color: '#37352f', padding: '1px 8px', borderRadius: 10, fontSize: 12, fontWeight: 500 }}>{val}</span>
    }
    if (field.type === 'relation') {
      const activeRelIds = relations.filter(r => r.field_id === field.id && r.from_record_id === rec.id).map(r => r.to_record_id)
      const isSelf2 = field.relation_page_id === page.id
      const allRelRecs = isSelf2 ? records : (relatedRecords[field.relation_page_id || ''] || [])
      const linkedRecs = allRelRecs.filter(r => activeRelIds.includes(r.id))
      const relFieldsList2: DbField[] = isSelf2 ? fields : (relatedFieldsRef.current[field.relation_page_id || ''] || [])
      const firstField = relFieldsList2.length > 0 ? relFieldsList2[0].id : null
      const relPage2 = isSelf2 ? page : (relatedPages.find(p => p.id === field.relation_page_id))
      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
          {linkedRecs.map(r => (
            <span key={r.id}
              onClick={e => { e.stopPropagation(); if (isSelf2) setDetailRecId(r.id); else setCrossDbDetail({ rec: r, fields: relFieldsList2, pageTitle: relPage2?.title || '' }) }}
              title={isSelf2 ? 'Open record' : `Open in ${relPage2?.title || 'database'}`}
              style={{ background: 'var(--accent-light)', color: 'var(--accent)', padding: '1px 8px', borderRadius: 10, fontSize: 11, fontWeight: 500, cursor: 'pointer' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.75' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1' }}>
              {firstField ? String(r.data[firstField] || 'Untitled') : 'Untitled'}
            </span>
          ))}
        </div>
      )
    }
    if (field.type === 'rollup') {
      // Rollup: aggregate values from a relation field
      // field.rollup_relation = id of the relation field
      // field.rollup_field = id of the field to aggregate in related DB
      // field.rollup_fn = 'count' | 'sum' | 'avg' | 'min' | 'max' | 'values'
      const relField = fields.find(f => f.type === 'relation')
      if (!relField) return <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>—</span>
      const linkedIds = relations.filter(r => r.field_id === relField.id && r.from_record_id === rec.id).map(r => r.to_record_id)
      const allRelRecs = relField.relation_page_id === page.id ? records : (relatedRecords[relField.relation_page_id || ''] || [])
      const linkedRecs = allRelRecs.filter(r => linkedIds.includes(r.id))
      const rollupFieldId = field.rollup_field
      const fn = field.rollup_fn || 'count'
      if (fn === 'count') {
        return <span style={{ fontSize: 13, color: 'var(--text)' }}>{linkedRecs.length}</span>
      }
      const nums = rollupFieldId ? linkedRecs.map(r => parseFloat(r.data?.[rollupFieldId!] || 0)).filter(n => !isNaN(n)) : []
      if (fn === 'sum') return <span style={{ fontSize: 13 }}>{nums.reduce((a, b) => a + b, 0)}</span>
      if (fn === 'avg') return <span style={{ fontSize: 13 }}>{nums.length ? (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2) : '—'}</span>
      if (fn === 'min') return <span style={{ fontSize: 13 }}>{nums.length ? Math.min(...nums) : '—'}</span>
      if (fn === 'max') return <span style={{ fontSize: 13 }}>{nums.length ? Math.max(...nums) : '—'}</span>
      if (fn === 'values') {
        const vals = rollupFieldId ? linkedRecs.map(r => String(r.data?.[rollupFieldId!] || '')).filter(Boolean) : []
        return <span style={{ fontSize: 12, color: 'var(--text)' }}>{vals.join(', ') || '—'}</span>
      }
      return <span style={{ fontSize: 13 }}>{linkedRecs.length}</span>
    }
    if (field.type === 'url' && val) return <a href={val} target="_blank" rel="noopener" onClick={e => e.stopPropagation()} style={{ color: 'var(--accent)', fontSize: 13, textDecoration: 'underline' }}>{val}</a>
    if (field.type === 'currency') {
      if (val === '' || val === undefined || val === null || isNaN(Number(val))) return <span style={{ color: 'var(--text-tertiary)', fontSize: 13 }}></span>
      const currency = field.options?.[0] || 'EUR'
      return <span style={{ color: 'var(--text)', fontSize: 13 }}>{new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(val))}</span>
    }
    return <span style={{ color: val ? 'var(--text)' : 'var(--text-tertiary)', fontSize: 13 }}>{val || ''}</span>
  }

  function renderRecordDetail(recId: string, onClose: () => void) {
    const rec = records.find(r => r.id === recId)
    if (!rec) return null
    const titleVal = fields[0] ? String(rec.data?.[fields[0].id] ?? '') : ''
    return (
      <>
        <div style={{ position: 'fixed', inset: 0, zIndex: 399, background: 'rgba(15,10,5,0.2)' }} onClick={onClose} />
        <div style={{ position: 'fixed', right: 0, top: 0, bottom: 0, width: 460, background: 'var(--surface)', zIndex: 400, boxShadow: '-4px 0 24px rgba(0,0,0,0.14)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 600, flex: 1, color: 'var(--text)' }}>{titleVal || 'Untitled'}</span>
            {canEdit && (
              <button onClick={() => { deleteRecord(rec.id); onClose() }} title="Delete record"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 13, padding: '3px 6px', borderRadius: 4, fontFamily: 'var(--font-sans)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--red)'; (e.currentTarget as HTMLElement).style.background = '#fff0f0' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-tertiary)'; (e.currentTarget as HTMLElement).style.background = 'none' }}>
                <Icon name="trash" size={14} />
              </button>
            )}
            <button onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 18, padding: '2px 6px', borderRadius: 4, lineHeight: 1 }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}>
              ✕
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
            {visibleFields.map(f => (
              <div key={f.id} style={{ marginBottom: 14, display: 'grid', gridTemplateColumns: '130px 1fr', gap: 8, alignItems: 'start' }}>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 5, paddingTop: 6 }}>
                  <span style={{ opacity: 0.7, fontSize: 11 }}>{FIELD_ICONS[f.type]}</span>
                  <span>{f.name}</span>
                </div>
                <div data-cell={`${rec.id}-${f.id}`}
                  style={{ minHeight: 30, padding: '4px 6px', borderRadius: 5, border: '1px solid transparent', cursor: canEdit ? 'pointer' : 'default', transition: 'border-color 0.1s', background: 'transparent' }}
                  onClick={() => canEdit && setEditingCell({ recId: rec.id, fieldId: f.id })}
                  onMouseEnter={e => { if (canEdit) (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'transparent' }}>
                  <CellValue rec={rec} field={f} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* DB Header */}
      <div data-export-hide style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, flexWrap: 'wrap', background: 'var(--surface)' }}>
        <div style={{ display: 'flex', background: 'var(--sidebar-bg)', borderRadius: 6, padding: 2, gap: 2 }}>
          {(['table', 'board', 'gallery', 'calendar'] as View[]).map(v => (
            <button key={v} onClick={() => setView(v)}
              style={{ display: 'flex', alignItems: 'center', gap: 5, background: view === v ? 'var(--surface)' : 'none', border: 'none', padding: '4px 10px', borderRadius: 4, fontSize: 12, cursor: 'pointer', color: view === v ? 'var(--text)' : 'var(--text-secondary)', fontFamily: 'var(--font-sans)', fontWeight: view === v ? 500 : 400, boxShadow: view === v ? 'var(--shadow-sm)' : 'none' }}>
              <Icon name={v === 'table' ? 'table' : v === 'board' ? 'kanban' : v === 'gallery' ? 'gallery' : 'calendar'} size={13} />
              {v === 'table' ? 'Table' : v === 'board' ? 'Board' : v === 'gallery' ? 'Gallery' : 'Calendar'}
            </button>
          ))}
        </div>
        <div style={{ width: 1, height: 18, background: 'var(--border)' }} />
        <button onClick={() => setShowFilters(o => !o)}
          style={{ display: 'flex', alignItems: 'center', gap: 5, background: showFilters ? 'var(--accent-light)' : 'none', color: showFilters ? 'var(--accent)' : 'var(--text-secondary)', border: 'none', padding: '4px 10px', borderRadius: 5, fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
          <Icon name="filter" size={12} /> Filter {activeFilters.length > 0 && `(${activeFilters.length})`}
        </button>
        <select value={sort.field} onChange={e => setSort(s => ({ ...s, field: e.target.value }))} style={ctrlSt}>
          <option value="">↕ Sort</option>
          {fields.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        {sort.field && (
          <button onClick={() => setSort(s => ({ ...s, dir: s.dir === 'asc' ? 'desc' : 'asc' }))}
            style={{ background: 'var(--accent-light)', color: 'var(--accent)', border: 'none', padding: '4px 10px', borderRadius: 5, fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
            {sort.dir === 'asc' ? '↑' : '↓'}
          </button>
        )}
        {/* Search bar */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <input
            value={dbSearch}
            onChange={e => setDbSearch(e.target.value)}
            placeholder="Search…"
            style={{ padding: '4px 28px 4px 8px', border: '1px solid var(--border)', borderRadius: 5, fontSize: 12, fontFamily: 'var(--font-sans)', background: dbSearch ? 'var(--accent-light)' : 'var(--sidebar-bg)', color: 'var(--text)', outline: 'none', width: dbSearch ? 140 : 80, transition: 'width 0.2s, background 0.15s' }}
            onFocus={e => { (e.target as HTMLInputElement).style.width = '140px'; (e.target as HTMLInputElement).style.borderColor = 'var(--accent)' }}
            onBlur={e => { if (!dbSearch) (e.target as HTMLInputElement).style.width = '80px'; (e.target as HTMLInputElement).style.borderColor = 'var(--border)' }}
          />
          {dbSearch && (
            <button onClick={() => setDbSearch('')} style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 12, padding: '0 2px', lineHeight: 1 }}>✕</button>
          )}
        </div>
        <span role="status" title="Realtime database synchronization" style={{ marginLeft: 'auto', fontSize: 11, color: realtimeStatus === 'live' ? 'var(--accent)' : realtimeStatus === 'offline' ? 'var(--red)' : 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
          {realtimeStatus === 'live' ? '● Live' : realtimeStatus === 'offline' ? '○ Offline' : '◌ Connecting'}
        </span>
        {canEdit && (
          <button onClick={() => setShowImport(true)} className="db-toolbar-import"
            style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', color: 'var(--text-secondary)', border: '1px solid var(--border)', padding: '4px 10px', borderRadius: 5, fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--accent)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}>
            <Icon name="import" size={12} /> Import
          </button>
        )}
      </div>

      {/* Filter rows */}
      {showFilters && (
        <div data-export-hide style={{ padding: '8px 16px', background: 'var(--sidebar-bg)', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filters.map(f => (
            <div key={f.id} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <select value={f.field} onChange={e => setFilters(fs => fs.map(x => x.id === f.id ? { ...x, field: e.target.value } : x))} style={ctrlSt}>
                <option value="">Field…</option>
                {fields.map(fld => <option key={fld.id} value={fld.id}>{fld.name}</option>)}
              </select>
              <select value={f.op} onChange={e => setFilters(fs => fs.map(x => x.id === f.id ? { ...x, op: e.target.value } : x))} style={ctrlSt}>
                <option value="contains">contains</option>
                <option value="equals">equals</option>
                <option value="not_equals">does not equal</option>
                <option value="not_empty">is not empty</option>
                <option value="is_empty">is empty</option>
              </select>
              {f.op !== 'not_empty' && f.op !== 'is_empty' && (
                <input value={f.value} onChange={e => setFilters(fs => fs.map(x => x.id === f.id ? { ...x, value: e.target.value } : x))}
                  placeholder="Value…" style={{ ...ctrlSt, width: 120 }} />
              )}
              <button onClick={() => setFilters(fs => fs.filter(x => x.id !== f.id))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-tertiary)', padding: '2px 4px', borderRadius: 4, lineHeight: 1 }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--red)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-tertiary)' }}>✕</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={() => setFilters(fs => [...fs, { id: Date.now(), field: '', op: 'contains', value: '' }])}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--accent)', fontFamily: 'var(--font-sans)', padding: '2px 0' }}>
              + Add filter
            </button>
            {filters.length > 0 && (
              <button onClick={() => setFilters([])}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-sans)' }}>
                Clear all
              </button>
            )}
          </div>
        </div>
      )}

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {view === 'table' && (
          <>
            <div className="db-table-wrapper">
              <table className="db-table" style={{ minWidth: '100%' }}>
                <thead>
                  <tr>
                    <th data-export-hide style={{ width: 48, minWidth: 48, position: 'sticky', left: 0, background: 'var(--surface)', zIndex: 1, textAlign: 'center' }}>
                      {canEdit && displayRecords.length > 0 && (
                        <input type="checkbox"
                          checked={selectedRows.size === displayRecords.length && displayRecords.length > 0}
                          onChange={e => setSelectedRows(e.target.checked ? new Set(displayRecords.map(r => r.id)) : new Set())}
                          style={{ accentColor: 'var(--accent)', cursor: 'pointer' }} />
                      )}
                    </th>
                    {visibleFields.map((f, colIdx) => (
                      <th key={f.id} style={{ minWidth: 140, position: 'relative' }}
                        draggable={canEdit && colIdx > 0}
                        onDragStart={() => colIdx > 0 && handleColDragStart(colIdx)}
                        onDragOver={e => { e.preventDefault(); handleColDragOver(colIdx) }}
                        onDrop={handleColDrop}
                        onDragEnd={() => { setDragColIdx(null); setDragOverColIdx(null) }}>
                        {/* Drop indicator left edge — when dropping before this col */}
                        {dragColIdx !== null && dragOverColIdx === colIdx && colIdx > 0 && dragColIdx !== colIdx && dragColIdx !== colIdx - 1 && (
                          <div style={{ position: 'absolute', left: -1, top: 0, height: `${41 + tableRecords.length * 41}px`, width: 2, background: 'var(--accent)', zIndex: 10, pointerEvents: 'none', boxShadow: '0 0 4px var(--accent)' }} />
                        )}
                        {/* Drop indicator right edge — when this is the last col and dropping after it */}
                        {dragColIdx !== null && dragOverColIdx === colIdx && colIdx === fields.length - 1 && dragColIdx !== colIdx && (
                          <div style={{ position: 'absolute', right: -1, top: 0, height: `${41 + tableRecords.length * 41}px`, width: 2, background: 'var(--accent)', zIndex: 10, pointerEvents: 'none', boxShadow: '0 0 4px var(--accent)' }} />
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-sans)', fontWeight: 500, minWidth: '16px', textAlign: 'center', flexShrink: 0 }}>{FIELD_ICONS[f.type]}</span>
                          <span style={{ flex: 1, cursor: canEdit ? 'pointer' : 'default', fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}
                            onClick={e => { e.stopPropagation(); if (canEdit) setRenamingFieldId(f.id) }}>
                            {f.name}
                            {canEdit && f.hidden_from_viewers && (
                              <span title="Hidden from viewers" style={{ display: 'flex', color: 'var(--text-tertiary)', opacity: 0.6 }}><Icon name="eye-off" size={11} /></span>
                            )}
                          </span>
                          {canEdit && <FieldMenu field={f}
                            onRename={() => setRenamingFieldId(f.id)}
                            onChangeType={type => updateField(f.id, { type, ...(type === 'currency' && !f.options?.length ? { options: ['EUR'] } : {}) })}
                            onDelete={() => deleteField(f.id)}
                            onLinkRelation={(pageId) => updateField(f.id, { relation_page_id: pageId })}
                            onSetCurrency={(code) => updateField(f.id, { options: [code] })}
                            onToggleHidden={() => updateField(f.id, { hidden_from_viewers: !f.hidden_from_viewers })} />}
                        </div>
                        {/* Inline rename input */}
                        {renamingFieldId === f.id && (
                          <div style={{ position: 'fixed', inset: 0, zIndex: 199 }} onClick={() => setRenamingFieldId(null)} />
                        )}
                        {renamingFieldId === f.id && (
                          <input autoFocus defaultValue={f.name}
                            onBlur={e => { updateField(f.id, { name: e.target.value }); setRenamingFieldId(null) }}
                            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenamingFieldId(null) }}
                            style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '6px 8px', border: '2px solid var(--accent)', borderRadius: 4, fontFamily: 'var(--font-sans)', fontSize: 12, background: 'var(--surface)', zIndex: 200, outline: 'none' }} />
                        )}
                      </th>
                    ))}
                    {canEdit && <th data-export-hide style={{ width: 36, minWidth: 36 }}>
                      <button onClick={() => setAddingField(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 16, padding: '0 4px' }} title="Add field">+</button>
                    </th>}
                  </tr>
                </thead>
                <tbody>
                  {tableRecords.map(rec => (
                    <tr key={rec.id} style={{ background: selectedRows.has(rec.id) ? 'var(--accent-light)' : undefined }}>
                      <td data-export-hide style={{ width: 48, minWidth: 48, padding: 0, position: 'sticky', left: 0, background: selectedRows.has(rec.id) ? 'var(--accent-light)' : 'var(--surface)', borderRight: '1px solid var(--border)', textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                          {canEdit && (
                            <input type="checkbox" checked={selectedRows.has(rec.id)}
                              onChange={e => setSelectedRows(s => {
                                const next = new Set(s)
                                if (e.target.checked) next.add(rec.id)
                                else next.delete(rec.id)
                                return next
                              })}
                              style={{ accentColor: 'var(--accent)', cursor: 'pointer', opacity: selectedRows.has(rec.id) ? 1 : 0, transition: 'opacity 0.1s' }}
                              className="row-checkbox" />
                          )}
                          <button onClick={() => setDetailRecId(rec.id)} title="Open record"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 12, padding: '2px 3px', borderRadius: 3, opacity: 0, transition: 'opacity 0.1s', flexShrink: 0 }}
                            className="open-row-btn">⤢</button>
                        </div>
                      </td>
                      {visibleFields.map(f => (
                        <td key={f.id} data-cell={`${rec.id}-${f.id}`} style={{ position: 'relative' }}
                          onClick={() => {
                            if (!canEdit) return
                            if (editingCell?.recId === rec.id && editingCell?.fieldId === f.id) return
                            setEditingCell({ recId: rec.id, fieldId: f.id })
                          }}>
                          <div className="db-cell">
                            <CellValue rec={rec} field={f} />
                          </div>
                        </td>
                      ))}
                      {canEdit && (
                        <td data-export-hide style={{ width: 28, minWidth: 28, padding: 0, position: 'sticky', right: 0, background: 'var(--surface)', borderLeft: '1px solid var(--border)', textAlign: 'center' }}>
                          <button onClick={() => deleteRecord(rec.id)} title="Delete row"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 13, padding: '2px 4px', borderRadius: 3, opacity: 0, transition: 'opacity 0.1s, color 0.1s' }}
                            className="delete-row-btn">✕</button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {tableRecords.length < displayRecords.length && <button type="button" onClick={() => setVisibleRowLimit(limit => limit + 200)} style={{ width: '100%', padding: '8px 16px', border: 0, borderTop: '1px solid var(--border)', background: 'var(--sidebar-bg)', color: 'var(--accent)', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 12 }}>
              Show 200 more · {tableRecords.length} of {displayRecords.length}
            </button>}
            {/* + New record at bottom */}
            {canEdit && (
              <button data-export-hide onClick={addRecord}
                style={{ width: '100%', padding: '7px 16px', background: 'none', border: 'none', borderTop: '1px solid var(--border)', cursor: 'pointer', fontSize: 13, color: 'var(--text-tertiary)', fontFamily: 'var(--font-sans)', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6, transition: 'background 0.1s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-bg)'; (e.currentTarget as HTMLElement).style.color = 'var(--accent)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; (e.currentTarget as HTMLElement).style.color = 'var(--text-tertiary)' }}>
                + New record
              </button>
            )}
          </>
        )}

        {view === 'board' && (
          <div style={{ display: 'flex', gap: 12, padding: 16, overflowX: 'auto', alignItems: 'flex-start', minHeight: 200 }}>
            {!selectField ? (
              <div style={{ color: 'var(--text-secondary)', fontSize: 14, padding: 20, background: 'var(--sidebar-bg)', borderRadius: 8 }}>
                Add a <strong>Select</strong> field to enable board view.
              </div>
            ) : boardGroups.map(group => (
              <div key={group.label} className="db-board-col"
                onDragOver={e => { e.preventDefault(); setDragOverGroup(group.label) }}
                onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverGroup(null) }}
                onDrop={async e => {
                  e.preventDefault()
                  if (!draggingCardId || !selectField) return
                  const targetVal = group.label === 'No status' ? '' : group.label
                  await updateCell(draggingCardId, selectField.id, targetVal)
                  setDraggingCardId(null)
                  setDragOverGroup(null)
                }}
                style={{ outline: dragOverGroup === group.label && draggingCardId ? '2px solid var(--accent)' : 'none', borderRadius: 8, transition: 'outline 0.1s' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                  {group.color && <span style={{ width: 10, height: 10, borderRadius: '50%', background: group.color, flexShrink: 0 }} />}
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{group.label}</span>
                  <span style={{ background: 'var(--border)', borderRadius: 10, padding: '1px 7px', fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 'auto' }}>{group.records.length}</span>
                </div>
                {group.records.map(rec => (
                  <div key={rec.id} className="db-board-card"
                    draggable={canEdit}
                    onDragStart={() => setDraggingCardId(rec.id)}
                    onDragEnd={() => { setDraggingCardId(null); setDragOverGroup(null) }}
                    onClick={() => setDetailRecId(rec.id)}
                    style={{ cursor: 'pointer', opacity: draggingCardId === rec.id ? 0.4 : 1, transition: 'opacity 0.15s' }}>
                    {visibleFields.filter(f => f.id !== selectField.id).slice(0, 4).map(f => (
                      <div key={f.id} style={{ marginBottom: 4 }}>
                        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 1 }}>{f.name}</div>
                        <CellValue rec={rec} field={f} />
                      </div>
                    ))}
                  </div>
                ))}
                {canEdit && (
                  <button onClick={async () => {
                    const { data } = await supabase.from('db_records').insert({ page_id: page.id, data: { [selectField.id]: group.label === 'No status' ? '' : group.label }, position: Date.now() }).select().single()
                    if (data) setRecords(r => [...r, data])
                  }} style={{ width: '100%', background: 'none', border: '1px dashed var(--border)', borderRadius: 6, padding: 6, cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 12, fontFamily: 'var(--font-sans)', marginTop: 4 }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--accent-light)'; (e.currentTarget as HTMLElement).style.color = 'var(--accent)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; (e.currentTarget as HTMLElement).style.color = 'var(--text-tertiary)' }}>
                    + Add card
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {view === 'gallery' && (
          <div style={{ padding: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
              {displayRecords.map(rec => (
                <div key={rec.id} className="db-board-card" style={{ cursor: 'default', position: 'relative' }}>
                  {/* Open detail button */}
                  <button
                    onClick={() => setDetailRecId(rec.id)}
                    title="Open full record"
                    style={{ position: 'absolute', top: 8, right: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 13, padding: '2px 4px', borderRadius: 4, lineHeight: 1 }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)'; (e.currentTarget as HTMLElement).style.color = 'var(--text)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; (e.currentTarget as HTMLElement).style.color = 'var(--text-tertiary)' }}
                  >↗</button>
                  {/* Editable fields */}
                  {visibleFields.slice(0, 5).map(f => (
                    <div key={f.id} style={{ marginBottom: 8, fontSize: 13 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{f.name}</div>
                      <div
                        data-cell={`${rec.id}-${f.id}`}
                        onClick={e => { e.stopPropagation(); if (canEdit) setEditingCell({ recId: rec.id, fieldId: f.id }) }}
                        style={{ border: '1px solid var(--border)', borderRadius: 5, padding: '5px 8px', minHeight: 30, background: 'var(--surface)', cursor: canEdit ? 'text' : 'default', transition: 'border-color 0.15s' }}
                        onMouseEnter={e => { if (canEdit) (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
                      >
                        <CellValue rec={rec} field={f} />
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            {canEdit && (
              <button data-export-hide onClick={addRecord}
                style={{ marginTop: 10, padding: '7px 14px', background: 'none', border: '1px dashed var(--border)', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text-tertiary)', fontFamily: 'var(--font-sans)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--accent-light)'; (e.currentTarget as HTMLElement).style.color = 'var(--accent)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; (e.currentTarget as HTMLElement).style.color = 'var(--text-tertiary)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}>
                + New record
              </button>
            )}
          </div>
        )}

        {view === 'calendar' && (() => {
          const dateField = fields.find(f => f.type === 'date')
          if (!dateField) return (
            <div style={{ padding: 24, color: 'var(--text-secondary)', fontSize: 14, textAlign: 'center' }}>
              Add a <strong>Date</strong> field to enable calendar view.
            </div>
          )

          const { year, month } = calMonth
          const firstDay = new Date(year, month, 1).getDay()
          const daysInMonth = new Date(year, month + 1, 0).getDate()
          const today = new Date()
          const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
          const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

          const byDay: Record<string, DbRecord[]> = {}
          for (const rec of records) {
            const val = rec.data[dateField.id]
            if (!val) continue
            const key = val.slice(0, 10)
            if (!byDay[key]) byDay[key] = []
            byDay[key].push(rec)
          }

          const titleField = fields.find(f => f.type === 'text') || fields[0]

          return (
            <div style={{ padding: 16, flex: 1, overflowY: 'auto' }}>
              {/* Month nav */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <button onClick={() => setCalMonth(m => { const d = new Date(m.year, m.month - 1); return { year: d.getFullYear(), month: d.getMonth() } })}
                  style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 5, padding: '4px 10px', cursor: 'pointer', fontSize: 14, color: 'var(--text)' }}>‹</button>
                <span style={{ fontWeight: 600, fontSize: 15, flex: 1, textAlign: 'center', color: 'var(--text)' }}>{MONTHS[month]} {year}</span>
                <button onClick={() => setCalMonth(m => { const d = new Date(m.year, m.month + 1); return { year: d.getFullYear(), month: d.getMonth() } })}
                  style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 5, padding: '4px 10px', cursor: 'pointer', fontSize: 14, color: 'var(--text)' }}>›</button>
                <button onClick={() => { const d = new Date(); setCalMonth({ year: d.getFullYear(), month: d.getMonth() }) }}
                  style={{ background: 'var(--accent-light)', color: 'var(--accent)', border: 'none', borderRadius: 5, padding: '4px 10px', cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font-sans)', fontWeight: 500 }}>Today</button>
              </div>

              {/* Day headers */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, marginBottom: 1 }}>
                {DAYS.map(d => (
                  <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', padding: '4px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{d}</div>
                ))}
              </div>

              {/* Calendar grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1 }}>
                {Array.from({ length: firstDay }).map((_, i) => (
                  <div key={`empty-${i}`} style={{ minHeight: 80, background: 'var(--sidebar-bg)', borderRadius: 4 }} />
                ))}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1
                  const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                  const dayRecs = byDay[dateStr] || []
                  const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day
                  return (
                    <div key={day}
                      style={{ minHeight: 80, background: 'var(--surface)', border: isToday ? '1.5px solid var(--accent)' : '1px solid var(--border)', borderRadius: 4, padding: '4px', position: 'relative', cursor: canEdit ? 'pointer' : 'default' }}
                      onClick={async () => {
                        if (!canEdit) return
                        const { data } = await supabase.from('db_records').insert({ page_id: page.id, data: { [dateField.id]: dateStr }, position: Date.now() }).select().single()
                        if (data) setRecords(r => [...r, data])
                      }}
                      onMouseEnter={e => { if (canEdit) (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-bg)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface)' }}>
                      <div style={{ fontSize: 11, fontWeight: isToday ? 700 : 400, color: isToday ? 'var(--accent)' : 'var(--text-tertiary)', marginBottom: 3 }}>{day}</div>
                      {dayRecs.slice(0, 3).map(rec => (
                        <div key={rec.id}
                          onClick={e => { e.stopPropagation(); setDetailRecId(rec.id) }}
                          style={{ fontSize: 11, background: 'var(--accent-light)', color: 'var(--accent)', borderRadius: 3, padding: '1px 5px', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer', fontWeight: 500 }}>
                          {titleField ? (rec.data[titleField.id] || 'Untitled') : 'Record'}
                        </div>
                      ))}
                      {dayRecs.length > 3 && (
                        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', paddingLeft: 2 }}>+{dayRecs.length - 3} more</div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}

        {/* Add field form */}
        {addingField && canEdit && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'var(--sidebar-bg)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input value={newField.name} onChange={e => setNewField(f => ({ ...f, name: e.target.value }))} placeholder="Field name" autoFocus
              onKeyDown={e => { if (e.key === 'Enter') addField(); if (e.key === 'Escape') setAddingField(false) }}
              style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontFamily: 'var(--font-sans)', fontSize: 13, background: 'var(--surface)', color: 'var(--text)', outline: 'none', width: 160 }} />
            <select value={newField.type} onChange={e => setNewField(f => ({ ...f, type: e.target.value as DbField['type'] }))} style={ctrlSt}>
              {FIELD_TYPES.map(t => <option key={t} value={t}>{FIELD_ICONS[t]} {t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select>
            {newField.type === 'relation' && <RelationPagePicker value="" onChange={pageId => setNewField(f => ({ ...f, relation_page_id: pageId } as any))} />}
            <button onClick={addField} style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: 6, fontFamily: 'var(--font-sans)', fontSize: 13, cursor: 'pointer', fontWeight: 500 }}>Add</button>
            <button onClick={() => setAddingField(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontFamily: 'var(--font-sans)', fontSize: 13 }}>Cancel</button>
          </div>
        )}
      </div>

      {/* Bulk action bar */}
      {selectedRows.size > 0 && (
        <div style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', background: '#37352f', color: '#fff', borderRadius: 10, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.25)', zIndex: 50, whiteSpace: 'nowrap', animation: 'scaleIn 0.15s ease' }}>
          <span style={{ fontSize: 12, fontWeight: 500 }}>{selectedRows.size} selected</span>
          <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.2)' }} />
          <button onClick={() => { exportCSV(); setSelectedRows(new Set()) }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', fontSize: 12, padding: '2px 6px', borderRadius: 4, fontFamily: 'var(--font-sans)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.15)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}>
            Export CSV
          </button>
          <button onClick={() => { exportXLSX(); setSelectedRows(new Set()) }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', fontSize: 12, padding: '2px 6px', borderRadius: 4, fontFamily: 'var(--font-sans)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.15)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}>
            Export Excel
          </button>
          {canEdit && <>
            <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.2)' }} />
            <button onClick={deleteSelectedRows}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ff6b6b', fontSize: 12, padding: '2px 6px', borderRadius: 4, fontFamily: 'var(--font-sans)' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.15)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}>
              Delete
            </button>
          </>}
          <button onClick={() => setSelectedRows(new Set())}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.6)', fontSize: 14, padding: '2px 4px', borderRadius: 4, lineHeight: 1 }}>✕</button>
        </div>
      )}

      {detailRecId && renderRecordDetail(detailRecId, () => setDetailRecId(null))}
      {crossDbDetail && <CrossDbRecordDetail rec={crossDbDetail.rec} fields={crossDbDetail.fields} pageTitle={crossDbDetail.pageTitle} onClose={() => setCrossDbDetail(null)} />}
      {showImport && (
        <DatabaseImportModal
          pageId={page.id}
          existingFields={fields}
          onImport={async (newFieldDefs, rows) => {
            // Create any fields that don't exist yet
            const createdFields: DbField[] = []
            for (const def of newFieldDefs) {
              if (def.existingId) continue
              const maxPos = [...fields, ...createdFields].reduce((m, f) => Math.max(m, f.position), 0)
              const { data } = await supabase.from('db_fields').insert({
                page_id: page.id, name: def.header, type: 'text', options: [], position: maxPos + 1
              }).select().single()
              if (data) createdFields.push(data as DbField)
            }
            const allFields = [...fields, ...createdFields]
            setFields(allFields)
            // Insert records
            const maxRecPos = records.reduce((m, r) => Math.max(m, r.position), 0)
            const inserts = rows.map((row, i) => {
              const data: Record<string, string> = {}
              newFieldDefs.forEach((def, col) => {
                const fid = def.existingId || createdFields.find(f => f.name === def.header)?.id
                if (fid) data[fid] = row[col] ?? ''
              })
              return { page_id: page.id, data, position: maxRecPos + i + 1 }
            })
            if (inserts.length > 0) {
              const { data: inserted } = await supabase.from('db_records').insert(inserts).select()
              if (inserted) setRecords(r => [...r, ...(inserted as DbRecord[])])
            }
            showToastMsg(`Imported ${rows.length} record${rows.length !== 1 ? 's' : ''}`)
            setShowImport(false)
          }}
          onClose={() => setShowImport(false)}
        />
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: '#37352f', color: '#fff', padding: '10px 16px', borderRadius: 8, fontSize: 13, zIndex: 300 }} className="fade-in">{toast}</div>
      )}
    </div>
  )
}


const ctrlSt: React.CSSProperties = { padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 5, fontFamily: 'var(--font-sans)', fontSize: 12, background: 'var(--sidebar-bg)', color: 'var(--text)', outline: 'none', cursor: 'pointer' }

function RelationPicker({ relPage, recs, activeRelIds, firstTextField, cellRect, onToggle, onClose, onCreateRecord }: {
  field: DbField; rec: DbRecord
  relPage: { id: string; title?: string; icon?: string } | null
  recs: DbRecord[]; activeRelIds: string[]; firstTextField: string | null
  cellRect: DOMRect | null
  onToggle: (relatedRecId: string) => void
  onClose: () => void
  onCreateRecord: (name: string) => Promise<void>
}) {
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)

  const filtered = recs
    .filter(rr => firstTextField && rr.data?.[firstTextField] && String(rr.data[firstTextField]).trim() !== '')
    .filter(rr => !search || (firstTextField ? String(rr.data[firstTextField!] || '').toLowerCase().includes(search.toLowerCase()) : false))
    .sort((a, b) => {
      const av = firstTextField ? String(a.data?.[firstTextField] || '') : ''
      const bv = firstTextField ? String(b.data?.[firstTextField] || '') : ''
      return av.localeCompare(bv)
    })

  const showCreate = !!search.trim() && !filtered.some(rr =>
    firstTextField && String(rr.data[firstTextField!] || '').toLowerCase() === search.toLowerCase()
  )

  const left = cellRect ? Math.min(cellRect.left, window.innerWidth - 248) : 0
  const top = cellRect ? Math.min(cellRect.bottom + 2, window.innerHeight - 320) : 0

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 299 }} onClick={onClose} />
      <div style={{ position: 'fixed', left, top, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, zIndex: 300, boxShadow: 'var(--shadow-lg)', minWidth: 230, overflow: 'hidden' }}>
        <div style={{ padding: '8px 8px 6px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 6, padding: '0 2px' }}>
            {(relPage as any)?.icon} {relPage?.title || 'Related database'}
          </div>
          <input
            autoFocus
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search records…"
            style={{ width: '100%', boxSizing: 'border-box', padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 5, fontFamily: 'var(--font-sans)', fontSize: 12, background: 'var(--sidebar-bg)', color: 'var(--text)', outline: 'none' }}
          />
        </div>
        <div style={{ maxHeight: 220, overflowY: 'auto' }}>
          {filtered.map(rr => {
            const isLinked = activeRelIds.includes(rr.id)
            const displayVal = firstTextField ? String(rr.data?.[firstTextField] || '') : ''
            return (
              <div key={rr.id} onClick={() => onToggle(rr.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', cursor: 'pointer', background: isLinked ? 'var(--accent-light)' : 'transparent' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = isLinked ? 'var(--accent-light)' : 'var(--sidebar-hover)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = isLinked ? 'var(--accent-light)' : 'transparent' }}>
                <span style={{ fontSize: 12, color: isLinked ? 'var(--accent)' : 'var(--text-tertiary)', width: 14, flexShrink: 0 }}>{isLinked ? '✓' : '○'}</span>
                <span style={{ fontSize: 13 }}>{displayVal}</span>
              </div>
            )
          })}
          {filtered.length === 0 && !showCreate && (
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: '8px 10px' }}>No records found</div>
          )}
          {showCreate && (
            <div
              onClick={async () => { setCreating(true); await onCreateRecord(search.trim()); setCreating(false); setSearch('') }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', cursor: creating ? 'wait' : 'pointer', borderTop: filtered.length > 0 ? '1px solid var(--border)' : 'none', color: 'var(--accent)', fontSize: 12 }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
              {creating ? '…' : `+ Create "${search.trim()}"`}
            </div>
          )}
        </div>
        <div style={{ borderTop: '1px solid var(--border)', padding: '4px 6px' }}>
          <button onClick={onClose} style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-sans)', padding: '2px 0' }}>Done</button>
        </div>
      </div>
    </>
  )
}


function CrossDbRecordDetail({ rec, fields, pageTitle, onClose }: { rec: DbRecord; fields: DbField[]; pageTitle: string; onClose: () => void }) {
  const titleVal = fields[0] ? String(rec.data?.[fields[0].id] ?? '') : ''
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 499, background: 'rgba(15,10,5,0.2)' }} onClick={onClose} />
      <div style={{ position: 'fixed', right: 0, top: 0, bottom: 0, width: 420, background: 'var(--surface)', zIndex: 500, boxShadow: '-4px 0 24px rgba(0,0,0,0.14)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 2 }}>From {pageTitle}</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{titleVal || 'Untitled'}</div>
          </div>
          <button onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 18, padding: '2px 6px', borderRadius: 4, lineHeight: 1 }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {fields.map(f => {
            const val = rec.data?.[f.id]
            return (
              <div key={f.id} style={{ marginBottom: 14, display: 'grid', gridTemplateColumns: '130px 1fr', gap: 8, alignItems: 'start' }}>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 5, paddingTop: 6 }}>
                  <span style={{ opacity: 0.7, fontSize: 11 }}>{FIELD_ICONS[f.type]}</span>
                  <span>{f.name}</span>
                </div>
                <div style={{ minHeight: 30, padding: '4px 6px', borderRadius: 5, fontSize: 13, color: val ? 'var(--text)' : 'var(--text-tertiary)' }}>
                  {f.type === 'checkbox'
                    ? <input type="checkbox" checked={!!val} readOnly style={{ width: 16, height: 16, accentColor: 'var(--accent)' }} />
                    : f.type === 'select' && val
                      ? <span style={{ background: '#e9e9e750', padding: '1px 8px', borderRadius: 10, fontSize: 12 }}>{val}</span>
                      : val ? String(val) : '—'
                  }
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}

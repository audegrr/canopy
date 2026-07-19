'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Page, DbField, DbRecord } from '@/lib/types'
import { MAX_SPREADSHEET_BYTES, MAX_SPREADSHEET_ROWS, validateSpreadsheetShape } from '@/lib/spreadsheet-limits'
import { useAccessibleDialog } from '@/hooks/useAccessibleDialog'
import { downloadXlsx, readXlsx } from '@/lib/spreadsheet-xlsx'

type View = 'table' | 'board' | 'gallery' | 'calendar'

type Props = { page: Page; canEdit: boolean }

const FIELD_COLORS: Record<string, string> = {
  text: '#787774', number: '#0b6e99', select: '#0f7b6c', multiselect: '#6940a5',
  date: '#d9730d', checkbox: '#0f7b6c', relation: '#ad1a72', rollup: '#787774',
  url: '#0b6e99', email: '#0b6e99', phone: '#0b6e99'
}

const FIELD_ICONS: Record<string, string> = {
  text: 'Aa', number: '#', select: '◉', multiselect: '◈',
  date: '▦', checkbox: '☐', relation: '⤴', rollup: 'Σ',
  url: '⊕', email: '@', phone: '℡'
}

const SELECT_COLORS = [
  '#fde68a','#bbf7d0','#bfdbfe','#fecaca','#e9d5ff',
  '#fed7aa','#cffafe','#fbcfe8','#d1fae5','#ddd6fe'
]

const FIELD_TYPES: DbField['type'][] = ['text','number','select','multiselect','date','checkbox','relation','rollup','url','email','phone']

export default function DatabaseView({ page, canEdit }: Props) {
  const [fields, setFields] = useState<DbField[]>([])
  const [records, setRecords] = useState<DbRecord[]>([])
  const [view, setView] = useState<View>('table')
  const [filters, setFilters] = useState<{ id: number; field: string; op: string; value: string }[]>([])
  const [sort, setSort] = useState({ field: '', dir: 'asc' as 'asc' | 'desc' })
  const [editingCell, setEditingCell] = useState<{ recId: string; fieldId: string } | null>(null)
  const [addingField, setAddingField] = useState(false)
  const [newField, setNewField] = useState({ name: '', type: 'text' as DbField['type'] })
  const [showFilters, setShowFilters] = useState(false)
  const [relatedPages, setRelatedPages] = useState<{id: string; title: string; icon: string}[]>([])
  const [relatedRecords, setRelatedRecords] = useState<Record<string, DbRecord[]>>({})
  const [relations, setRelations] = useState<any[]>([])
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
  const relatedFieldsRef = useRef<Record<string, DbField[]>>({})
  const supabase = createClient()

  useEffect(() => { loadData() }, [page.id])

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
    displayRecords.sort((a, b) => {
      const av = String(a.data?.[sort.field] ?? ''), bv = String(b.data?.[sort.field] ?? '')
      return sort.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
    })
  }

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
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
      if (isEditing && inputRef.current && field.type !== 'checkbox' && field.type !== 'select' && field.type !== 'relation') {
        // Focus after a tiny delay so the click event positions the cursor first
        const t = setTimeout(() => inputRef.current?.focus(), 10)
        return () => clearTimeout(t)
      }
    }, [isEditing])

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
      return (
        <input ref={inputRef}
          defaultValue={String(val ?? '')}
          onBlur={e => updateCell(rec.id, field.id, e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') updateCell(rec.id, field.id, (e.target as HTMLInputElement).value); if (e.key === 'Escape') setEditingCell(null) }}
          type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : 'text'}
          style={{ width: '100%', border: 'none', outline: 'none', background: 'transparent', fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--text)', padding: 0 }}
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
    return <span style={{ color: val ? 'var(--text)' : 'var(--text-tertiary)', fontSize: 13 }}>{val || ''}</span>
  }

  function RecordDetail({ recId, onClose }: { recId: string; onClose: () => void }) {
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
                🗑️
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
              style={{ background: view === v ? 'var(--surface)' : 'none', border: 'none', padding: '4px 10px', borderRadius: 4, fontSize: 12, cursor: 'pointer', color: view === v ? 'var(--text)' : 'var(--text-secondary)', fontFamily: 'var(--font-sans)', fontWeight: view === v ? 500 : 400, boxShadow: view === v ? 'var(--shadow-sm)' : 'none' }}>
              {v === 'table' ? '☰ Table' : v === 'board' ? '⊞ Board' : v === 'gallery' ? '⊟ Gallery' : '📅 Calendar'}
            </button>
          ))}
        </div>
        <div style={{ width: 1, height: 18, background: 'var(--border)' }} />
        <button onClick={() => setShowFilters(o => !o)}
          style={{ background: showFilters ? 'var(--accent-light)' : 'none', color: showFilters ? 'var(--accent)' : 'var(--text-secondary)', border: 'none', padding: '4px 10px', borderRadius: 5, fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
          ⚡ Filter {activeFilters.length > 0 && `(${activeFilters.length})`}
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
        {canEdit && (
          <button onClick={() => setShowImport(true)} className="db-toolbar-import"
            style={{ marginLeft: 'auto', background: 'none', color: 'var(--text-secondary)', border: '1px solid var(--border)', padding: '4px 10px', borderRadius: 5, fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--accent)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}>
            ⬇️ Import
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
                          <div style={{ position: 'absolute', left: -1, top: 0, height: `${41 + displayRecords.length * 41}px`, width: 2, background: 'var(--accent)', zIndex: 10, pointerEvents: 'none', boxShadow: '0 0 4px var(--accent)' }} />
                        )}
                        {/* Drop indicator right edge — when this is the last col and dropping after it */}
                        {dragColIdx !== null && dragOverColIdx === colIdx && colIdx === fields.length - 1 && dragColIdx !== colIdx && (
                          <div style={{ position: 'absolute', right: -1, top: 0, height: `${41 + displayRecords.length * 41}px`, width: 2, background: 'var(--accent)', zIndex: 10, pointerEvents: 'none', boxShadow: '0 0 4px var(--accent)' }} />
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-sans)', fontWeight: 500, minWidth: '16px', textAlign: 'center', flexShrink: 0 }}>{FIELD_ICONS[f.type]}</span>
                          <span style={{ flex: 1, cursor: canEdit ? 'pointer' : 'default', fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}
                            onClick={e => { e.stopPropagation(); if (canEdit) setRenamingFieldId(f.id) }}>
                            {f.name}
                            {canEdit && f.hidden_from_viewers && (
                              <span title="Hidden from viewers" style={{ fontSize: 10, color: 'var(--text-tertiary)', opacity: 0.6 }}>🚫</span>
                            )}
                          </span>
                          {canEdit && <FieldMenu field={f}
                            onRename={() => setRenamingFieldId(f.id)}
                            onChangeType={type => updateField(f.id, { type })}
                            onDelete={() => deleteField(f.id)}
                            onLinkRelation={(pageId) => updateField(f.id, { relation_page_id: pageId })}
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
                  {displayRecords.map((rec, i) => (
                    <tr key={rec.id} style={{ background: selectedRows.has(rec.id) ? 'var(--accent-light)' : undefined }}>
                      <td data-export-hide style={{ width: 48, minWidth: 48, padding: 0, position: 'sticky', left: 0, background: selectedRows.has(rec.id) ? 'var(--accent-light)' : 'var(--surface)', borderRight: '1px solid var(--border)', textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                          {canEdit && (
                            <input type="checkbox" checked={selectedRows.has(rec.id)}
                              onChange={e => setSelectedRows(s => { const n = new Set(s); e.target.checked ? n.add(rec.id) : n.delete(rec.id); return n })}
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
                          onClick={e => {
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

      {detailRecId && <RecordDetail recId={detailRecId} onClose={() => setDetailRecId(null)} />}
      {crossDbDetail && <CrossDbRecordDetail rec={crossDbDetail.rec} fields={crossDbDetail.fields} pageTitle={crossDbDetail.pageTitle} onClose={() => setCrossDbDetail(null)} />}
      {showImport && (
        <ImportModal
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

const FIELD_TYPES_LIST: DbField['type'][] = ['text','number','select','multiselect','date','checkbox','relation','rollup','url','email','phone']

function SelectEditor({ field, currentValue, onSelect, onAddOption, onDeleteOption, onUpdateOptionColor, onClose, cellRect }: any) {
  const [newLabel, setNewLabel] = useState('')
  const [colorFor, setColorFor] = useState<string | null>(null)
  const [newColor, setNewColor] = useState(SELECT_COLORS[0])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Focus input without losing the dropdown
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [])

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 299 }} onClick={onClose} />
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, minWidth: 220,
        position: 'fixed',
        left: cellRect ? Math.min(cellRect.left, window.innerWidth - 240) : 0,
        top: cellRect ? Math.min(cellRect.bottom + 2, window.innerHeight - 300) : 0,
        zIndex: 300, boxShadow: 'var(--shadow-lg)', maxHeight: '70vh', overflowY: 'auto' }}
        onMouseDown={e => e.stopPropagation()}>
      {/* Select or clear */}
      <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>Select an option</div>
        <div onClick={() => onSelect('')}
          style={{ padding: '3px 6px', borderRadius: 4, cursor: 'pointer', fontSize: 12, color: 'var(--text-tertiary)' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}>
          — Clear
        </div>
        {(field.options || []).map((opt: any) => {
          const label = opt.label || opt
          const color = opt.color || '#e9e9e7'
          return (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 4px', borderRadius: 4, cursor: 'pointer' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}>
              <div onClick={() => onSelect(label)} style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                <span style={{ background: color + '60', color: '#37352f', padding: '2px 10px', borderRadius: 10, fontSize: 12, fontWeight: 500 }}>{label}</span>
                {currentValue === label && <span style={{ marginLeft: 4, color: 'var(--accent)', fontSize: 12 }}>✓</span>}
              </div>
              {/* Color picker for this option */}
              <div style={{ position: 'relative' }}>
                <div onClick={e => { e.stopPropagation(); setColorFor(colorFor === label ? null : label) }}
                  style={{ width: 14, height: 14, borderRadius: '50%', background: color, cursor: 'pointer', border: '1px solid rgba(0,0,0,.15)', flexShrink: 0 }} />
                {colorFor === label && (
                  <div style={{ position: 'absolute', right: 0, top: 18, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: 6, boxShadow: 'var(--shadow-lg)', zIndex: 60, display: 'flex', flexWrap: 'wrap', gap: 3, width: 116 }}>
                    {SELECT_COLORS.map(col => (
                      <div key={col} onClick={e => { e.stopPropagation(); onUpdateOptionColor(label, col); setColorFor(null) }}
                        style={{ width: 16, height: 16, borderRadius: '50%', background: col, cursor: 'pointer', border: col === color ? '2px solid var(--accent)' : '1px solid rgba(0,0,0,.1)' }} />
                    ))}
                  </div>
                )}
              </div>
              {/* Delete option */}
              <div onClick={e => { e.stopPropagation(); onDeleteOption(label) }}
                style={{ fontSize: 12, color: 'var(--text-tertiary)', cursor: 'pointer', padding: '0 2px', borderRadius: 3 }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--red)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-tertiary)' }}>✕</div>
            </div>
          )
        })}
      </div>
      {/* Add new option */}
      <div style={{ padding: '6px 8px' }}>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6 }}>Add option</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
          {SELECT_COLORS.map(col => (
            <div key={col} onClick={() => setNewColor(col)}
              style={{ width: 18, height: 18, borderRadius: '50%', background: col, cursor: 'pointer', border: newColor === col ? '2px solid var(--accent)' : '1px solid rgba(0,0,0,.1)', flexShrink: 0 }} />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <input
            ref={inputRef}
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            placeholder="Option name…"
            onKeyDown={e => {
              if (e.key === 'Enter' && newLabel.trim()) { onAddOption(newLabel.trim(), newColor); setNewLabel('') }
              if (e.key === 'Escape') onClose()
              e.stopPropagation()
            }}
            style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 5, padding: '4px 8px', fontSize: 12, fontFamily: 'var(--font-sans)', outline: 'none' }}
          />
          <button onClick={() => { if (newLabel.trim()) { onAddOption(newLabel.trim(), newColor); setNewLabel('') } }}
            style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 5, padding: '4px 8px', cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font-sans)' }}>+</button>
        </div>
      </div>
      <div style={{ padding: '4px 8px 6px' }}>
        <button onClick={onClose} style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-sans)' }}>Done</button>
      </div>
    </div>
    </>
  )
}

function FieldMenu({ field, onRename, onChangeType, onDelete, onLinkRelation, onToggleHidden }: { field: DbField; onRename: () => void; onChangeType: (t: DbField['type']) => void; onDelete: () => void; onLinkRelation: (pageId: string, colId?: string) => void; onToggleHidden: () => void }) {
  const [open, setOpen] = useState(false)
  const [showTypes, setShowTypes] = useState(false)
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  return (
    <div style={{ position: 'relative', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
      <button ref={btnRef} onClick={() => {
        if (!open) {
          const r = btnRef.current?.getBoundingClientRect()
          if (r) setMenuPos({ x: r.left, y: r.bottom + 4 })
        }
        setOpen(o => !o); setShowTypes(false)
      }}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: '1px 4px', borderRadius: 3, display: 'flex', alignItems: 'center' }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--border)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}>
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
          <path d="M4 6l4 4 4-4" stroke="var(--text-tertiary)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && menuPos && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 499 }} onClick={() => setOpen(false)} />
          <div style={{ position: 'fixed', left: menuPos.x, top: menuPos.y, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 7, padding: 5, boxShadow: 'var(--shadow-lg)', zIndex: 500, minWidth: 160 }}>
            <MItem onClick={() => { onRename(); setOpen(false) }}>✏️ Rename</MItem>
            <MItem onClick={() => setShowTypes(o => !o)} extra="›">🔄 Change type</MItem>
            {showTypes && (
              <div style={{ paddingLeft: 8, borderTop: '1px solid var(--border)', marginTop: 2, paddingTop: 2, maxHeight: 200, overflowY: 'auto' }}>
                {FIELD_TYPES_LIST.map(t => (
                  <MItem key={t} onClick={() => {
                    onChangeType(t)
                    if (t !== 'relation') setOpen(false)
                    else setShowTypes(false) // Stay open to pick relation table
                  }} active={t === field.type}>
                    {FIELD_ICONS[t]} {t.charAt(0).toUpperCase() + t.slice(1)}
                  </MItem>
                ))}
              </div>
            )}
            {field.type === 'relation' && !showTypes && (
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 4, marginTop: 2 }}>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', padding: '3px 8px 0', fontWeight: 500 }}>Link to database</div>
                <RelationPagePicker
                  value={field.relation_page_id || ''}
                  onChange={(pageId) => { if (pageId) onLinkRelation(pageId) }} />
              </div>
            )}
            <MItem onClick={() => { onToggleHidden(); setOpen(false) }}>
              {field.hidden_from_viewers ? '👁️ Show to viewers' : '🚫 Hide from viewers'}
            </MItem>
            <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
            <MItem onClick={() => { onDelete(); setOpen(false) }} danger>🗑️ Delete field</MItem>
          </div>
        </>
      )}
    </div>
  )
}

function MItem({ onClick, children, extra, active, danger }: any) {
  return (
    <div onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, padding: '5px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 12, color: danger ? 'var(--red)' : active ? 'var(--accent)' : 'var(--text)', fontWeight: active ? 500 : 400 }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = danger ? '#fff0f0' : 'var(--sidebar-hover)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}>
      <span>{children}</span>
      {extra && <span style={{ color: 'var(--text-tertiary)' }}>{extra}</span>}
    </div>
  )
}

function RelationPagePicker({ value, onChange }: { value: string; onChange: (pageId: string) => void }) {
  const [pages, setPages] = useState<{id: string; title: string; icon: string}[]>([])
  const supabase = createClient()

  useEffect(() => {
    supabase.from('pages').select('id, title, icon').eq('is_database', true).order('title')
      .then(({ data }) => setPages(data || []))
  }, [])

  return (
    <div style={{ padding: '4px 8px' }} onClick={e => e.stopPropagation()}>
      <select value={value} onChange={e => onChange(e.target.value)} style={{ ...ctrlSt, width: '100%' }}>
        <option value="">— Select a database</option>
        {pages.map(p => <option key={p.id} value={p.id}>{p.icon} {p.title}</option>)}
      </select>
    </div>
  )
}

const ctrlSt: React.CSSProperties = { padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 5, fontFamily: 'var(--font-sans)', fontSize: 12, background: 'var(--sidebar-bg)', color: 'var(--text)', outline: 'none', cursor: 'pointer' }

function RelationPicker({ field, rec, relPage, recs, activeRelIds, firstTextField, cellRect, onToggle, onClose, onCreateRecord }: {
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

type ImportFieldDef = { header: string; existingId: string | null }

function ImportModal({ pageId, existingFields, onImport, onClose }: {
  pageId: string
  existingFields: DbField[]
  onImport: (fieldDefs: ImportFieldDef[], rows: string[][]) => Promise<void>
  onClose: () => void
}) {
  const [step, setStep] = useState<'pick' | 'preview'>('pick')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<string[][]>([])
  const [fieldDefs, setFieldDefs] = useState<ImportFieldDef[]>([])
  const [loading, setLoading] = useState(false)
  const [fileError, setFileError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const dialogRef = useAccessibleDialog(true, onClose)

  function parseCSV(text: string): { headers: string[]; rows: string[][] } {
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim())
    if (lines.length === 0) return { headers: [], rows: [] }
    function parseLine(line: string): string[] {
      const result: string[] = []
      let cur = '', inQ = false
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (ch === '"') {
          if (inQ && line[i + 1] === '"') { cur += '"'; i++ }
          else inQ = !inQ
        } else if (ch === ',' && !inQ) { result.push(cur); cur = '' }
        else cur += ch
      }
      result.push(cur)
      return result
    }
    const headers = parseLine(lines[0])
    const rows = lines.slice(1).map(parseLine)
    return { headers, rows }
  }

  function handleFile(file: File) {
    setFileError('')
    if (file.size > MAX_SPREADSHEET_BYTES) {
      setFileError('Files are limited to 5 MB for safe import.')
      return
    }
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.type.includes('spreadsheetml') || file.type.includes('ms-excel')
    if (isExcel) {
      const reader = new FileReader()
      reader.onload = async e => {
        try {
          const parsed = await readXlsx(e.target?.result as ArrayBuffer)
          const validationError = validateSpreadsheetShape(parsed)
          if (validationError) { setFileError(validationError); return }
          if (parsed.length < 1) throw new Error('The worksheet is empty.')
          const hdrs = parsed[0].map(String)
          const dataRows = parsed.slice(1).map(r => hdrs.map((_, i) => String(r[i] ?? '')))
          if (hdrs.length === 0) throw new Error('The worksheet has no columns.')
          setHeaders(hdrs)
          setRows(dataRows)
          const defs: ImportFieldDef[] = hdrs.map(h => {
            const match = existingFields.find(f => f.name.toLowerCase() === h.toLowerCase())
            return { header: h, existingId: match?.id ?? null }
          })
          setFieldDefs(defs)
          setStep('preview')
        } catch (error) {
          setFileError(error instanceof Error ? error.message : 'Unable to read this spreadsheet safely.')
        }
      }
      reader.readAsArrayBuffer(file)
    } else {
      const reader = new FileReader()
      reader.onload = e => {
        const text = e.target?.result as string
        const parsed = parseCSV(text)
        const validationError = validateSpreadsheetShape([parsed.headers, ...parsed.rows])
        if (validationError) { setFileError(validationError); return }
        if (parsed.headers.length === 0) return
        setHeaders(parsed.headers)
        setRows(parsed.rows)
        const defs: ImportFieldDef[] = parsed.headers.map(h => {
          const match = existingFields.find(f => f.name.toLowerCase() === h.toLowerCase())
          return { header: h, existingId: match?.id ?? null }
        })
        setFieldDefs(defs)
        setStep('preview')
      }
      reader.readAsText(file, 'utf-8')
    }
  }

  async function doImport() {
    setLoading(true)
    await onImport(fieldDefs, rows)
    setLoading(false)
  }

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 499, background: 'rgba(15,10,5,0.35)' }} onClick={onClose} />
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="import-title" tabIndex={-1} style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, zIndex: 500, boxShadow: 'var(--shadow-lg)', width: 580, maxWidth: '95vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div id="import-title" style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Import CSV / Excel</div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
              {step === 'pick' ? 'Upload a CSV or Excel file to import records' : `${rows.length} rows · ${headers.length} columns`}
            </div>
          </div>
          <button type="button" aria-label="Close import dialog" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 18, lineHeight: 1, padding: '4px 6px', borderRadius: 4 }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}>✕</button>
        </div>

        {step === 'pick' && (
          <div style={{ padding: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <div
              style={{ width: '100%', border: '2px dashed var(--border)', borderRadius: 10, padding: '32px 20px', textAlign: 'center', cursor: 'pointer', transition: 'border-color 0.15s, background 0.15s' }}
              onClick={() => fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLElement).style.background = 'var(--accent-light)' }}
              onDragLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.background = 'transparent' }}
              onDrop={e => { e.preventDefault(); (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.background = 'transparent'; const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📊</div>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', marginBottom: 4 }}>Drop a CSV or Excel file here</div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>or click to browse · First row must be column headers</div>
            </div>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
            {fileError && <div role="alert" style={{ color: 'var(--red)', fontSize: 12, textAlign: 'center' }}>{fileError}</div>}
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center', lineHeight: 1.6 }}>
              CSV and Excel (.xlsx) files are supported. Notion exports work out of the box.
              Columns matching existing fields will be mapped automatically.
            </div>
          </div>
        )}

        {step === 'preview' && (
          <>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px' }}>
              {/* Column mapping */}
              <div style={{ padding: '14px 0 10px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Column mapping</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {fieldDefs.map((def, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: 500, minWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{def.header}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>→</span>
                      <span style={{ fontSize: 12, color: def.existingId ? 'var(--accent)' : 'var(--text-secondary)', background: def.existingId ? 'var(--accent-light)' : 'var(--sidebar-bg)', padding: '2px 8px', borderRadius: 4 }}>
                        {def.existingId
                          ? existingFields.find(f => f.id === def.existingId)?.name ?? def.header
                          : '+ New field'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              {/* Data preview */}
              <div style={{ padding: '14px 0' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Preview ({Math.min(rows.length, 5)} of {rows.length} rows)
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>
                    <thead>
                      <tr>
                        {headers.map((h, i) => (
                          <th key={i} style={{ padding: '4px 8px', background: 'var(--sidebar-bg)', borderBottom: '1px solid var(--border)', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 5).map((row, ri) => (
                        <tr key={ri}>
                          {row.map((cell, ci) => (
                            <td key={ci} style={{ padding: '4px 8px', borderBottom: '1px solid var(--border)', color: 'var(--text)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
              <button onClick={() => setStep('pick')} style={{ background: 'none', border: '1px solid var(--border)', padding: '6px 14px', borderRadius: 6, fontSize: 13, cursor: 'pointer', color: 'var(--text-secondary)', fontFamily: 'var(--font-sans)' }}>← Back</button>
              <button onClick={doImport} disabled={loading}
                style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '6px 18px', borderRadius: 6, fontSize: 13, cursor: loading ? 'wait' : 'pointer', fontFamily: 'var(--font-sans)', fontWeight: 500, opacity: loading ? 0.7 : 1 }}>
                {loading ? 'Importing…' : `Import ${rows.length} records`}
              </button>
            </div>
          </>
        )}
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

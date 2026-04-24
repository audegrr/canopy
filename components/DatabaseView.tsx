'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Page, DbField, DbRecord } from '@/lib/types'

type View = 'table' | 'board' | 'gallery'

type Props = { page: Page; canEdit: boolean }

const FIELD_COLORS: Record<string, string> = {
  text: '#787774', number: '#0b6e99', select: '#0f7b6c', multiselect: '#6940a5',
  date: '#d9730d', checkbox: '#0f7b6c', relation: '#ad1a72', rollup: '#787774',
  url: '#0b6e99', email: '#0b6e99', phone: '#0b6e99'
}

const FIELD_ICONS: Record<string, string> = {
  text: 'Aa', number: '123', select: '◉', multiselect: '◈',
  date: '📅', checkbox: '☑', relation: '↗', rollup: '∑',
  url: '🔗', email: '📧', phone: '📱'
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
  const [filter, setFilter] = useState({ field: '', op: 'contains', value: '' })
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
  const supabase = createClient()

  useEffect(() => { loadData() }, [page.id])

  async function loadData() {
    const [{ data: f }, { data: r }, { data: rel }] = await Promise.all([
      supabase.from('db_fields').select('*').eq('page_id', page.id).order('position'),
      supabase.from('db_records').select('*').eq('page_id', page.id).order('position'),
      supabase.from('db_relations').select('*')
    ])
    const fieldsData = f || []
    setFields(fieldsData)
    setRecords(r || [])
    setRelations(rel || [])

    const relFields = fieldsData.filter((x: DbField) => x.type === 'relation' && x.relation_page_id)
    if (relFields.length > 0) {
      const pageIds = [...new Set(relFields.map((x: DbField) => x.relation_page_id!))]
      const { data: rPages } = await supabase.from('pages').select('id, title, icon').in('id', pageIds)
      setRelatedPages(rPages || [])
      const rRecs: Record<string, DbRecord[]> = {}
      for (const pid of pageIds) {
        const { data: rr } = await supabase.from('db_records').select('*').eq('page_id', pid)
        rRecs[pid] = rr || []
      }
      setRelatedRecords(rRecs)
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
    setEditingCell(null)
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

  // Column drag & drop
  function handleColDragStart(idx: number) { setDragColIdx(idx) }
  function handleColDragOver(idx: number) { setDragOverColIdx(idx) }
  async function handleColDrop() {
    if (dragColIdx === null || dragOverColIdx === null || dragColIdx === dragOverColIdx) {
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

  // Filter & sort
  let displayRecords = [...records]
  if (filter.field && filter.value) {
    displayRecords = displayRecords.filter(r => {
      const val = String(r.data?.[filter.field] ?? '')
      if (filter.op === 'contains') return val.toLowerCase().includes(filter.value.toLowerCase())
      if (filter.op === 'equals') return val === filter.value
      if (filter.op === 'not_empty') return !!val
      return true
    })
  }
  if (sort.field) {
    displayRecords.sort((a, b) => {
      const av = String(a.data?.[sort.field] ?? ''), bv = String(b.data?.[sort.field] ?? '')
      return sort.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
    })
  }

  const selectField = fields.find(f => f.type === 'select')
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

    if (isEditing) {
      if (field.type === 'checkbox') return (
        <input type="checkbox" checked={!!val} autoFocus
          onChange={e => updateCell(rec.id, field.id, e.target.checked)}
          style={{ width: 16, height: 16, accentColor: 'var(--accent)', cursor: 'pointer' }} />
      )
      if (field.type === 'select') return (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: 4, minWidth: 140, position: 'absolute', zIndex: 50, boxShadow: 'var(--shadow-lg)', top: '100%', left: 0 }}>
          <div style={{ padding: '3px 6px', color: 'var(--text-tertiary)', fontSize: 12, cursor: 'pointer' }} onClick={() => updateCell(rec.id, field.id, '')}>— None</div>
          {(field.options || []).map((opt: any) => {
            const label = opt.label || opt; const color = opt.color || '#e9e9e7'
            return (
              <div key={label} onClick={() => updateCell(rec.id, field.id, label)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', cursor: 'pointer', borderRadius: 4 }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}>
                <span style={{ background: color + '50', color: '#37352f', padding: '1px 8px', borderRadius: 10, fontSize: 12, fontWeight: 500 }}>{label}</span>
              </div>
            )
          })}
          <div style={{ borderTop: '1px solid var(--border)', padding: '4px 6px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 4 }}>
                {SELECT_COLORS.map(col => (
                  <div key={col} style={{ width: 14, height: 14, borderRadius: '50%', background: col, cursor: 'pointer', border: '1px solid rgba(0,0,0,.1)' }}
                    title="Pick color"
                    onClick={e => { e.stopPropagation(); (e.currentTarget as any)._selectedColor = col }} />
                ))}
              </div>
            </div>
            <input placeholder="New option…" autoFocus={!(field.options?.length)}
              style={{ width: '100%', border: 'none', outline: 'none', fontSize: 12, fontFamily: 'var(--font-sans)' }}
              onKeyDown={e => { if (e.key === 'Enter') { addSelectOption(field.id, (e.target as HTMLInputElement).value); (e.target as HTMLInputElement).value = '' } if (e.key === 'Escape') setEditingCell(null) }} />
          </div>
        </div>
      )
      if (field.type === 'relation') {
        const relPage = relatedPages.find(p => p.id === field.relation_page_id)
        const recs = relatedRecords[field.relation_page_id || ''] || []
        const activeRelIds = relations.filter(r => r.field_id === field.id && r.from_record_id === rec.id).map(r => r.to_record_id)
        const firstTextField = (relatedRecords[field.relation_page_id || ''] || []).length > 0
          ? Object.keys((relatedRecords[field.relation_page_id || ''] || [])[0]?.data || {})[0]
          : null
        return (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: 6, minWidth: 200, position: 'absolute', zIndex: 50, boxShadow: 'var(--shadow-lg)', top: '100%', left: 0, maxHeight: 200, overflowY: 'auto' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 4, padding: '0 4px' }}>
              {relPage?.icon} {relPage?.title || 'Related database'}
            </div>
            {recs.map(rr => {
              const isLinked = activeRelIds.includes(rr.id)
              const displayVal = firstTextField ? String(rr.data?.[firstTextField] || '') : 'Untitled'
              return (
                <div key={rr.id} onClick={() => toggleRelation(field.id, rec.id, rr.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', borderRadius: 4, cursor: 'pointer', background: isLinked ? 'var(--accent-light)' : 'transparent' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = isLinked ? 'var(--accent-light)' : 'var(--sidebar-hover)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = isLinked ? 'var(--accent-light)' : 'transparent' }}>
                  <span style={{ fontSize: 12, color: isLinked ? 'var(--accent)' : 'var(--text-tertiary)', width: 14 }}>{isLinked ? '✓' : '○'}</span>
                  <span style={{ fontSize: 13 }}>{displayVal || 'Untitled'}</span>
                </div>
              )
            })}
            {recs.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: '4px 6px' }}>No records in linked database</div>}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 4, marginTop: 4 }}>
              <button onClick={() => setEditingCell(null)} style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-sans)', padding: '2px 0' }}>Done</button>
            </div>
          </div>
        )
      }
      return (
        <input ref={inputRef} autoFocus
          defaultValue={String(val ?? '')}
          onBlur={e => updateCell(rec.id, field.id, e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') updateCell(rec.id, field.id, (e.target as HTMLInputElement).value); if (e.key === 'Escape') setEditingCell(null) }}
          type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : 'text'}
          style={{ width: '100%', border: 'none', outline: 'none', background: 'transparent', fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--text)', padding: 0 }} />
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
      const linkedRecs = (relatedRecords[field.relation_page_id || ''] || []).filter(r => activeRelIds.includes(r.id))
      const firstField = linkedRecs[0] ? Object.keys(linkedRecs[0].data || {})[0] : null
      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
          {linkedRecs.map(r => (
            <span key={r.id} style={{ background: 'var(--accent-light)', color: 'var(--accent)', padding: '1px 8px', borderRadius: 10, fontSize: 11, fontWeight: 500 }}>
              {firstField ? String(r.data[firstField] || 'Untitled') : 'Untitled'}
            </span>
          ))}
        </div>
      )
    }
    if (field.type === 'url' && val) return <a href={val} target="_blank" rel="noopener" onClick={e => e.stopPropagation()} style={{ color: 'var(--accent)', fontSize: 13, textDecoration: 'underline' }}>{val}</a>
    return <span style={{ color: val ? 'var(--text)' : 'var(--text-tertiary)', fontSize: 13 }}>{val || ''}</span>
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* DB Header */}
      <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, flexWrap: 'wrap', background: 'var(--surface)' }}>
        <div style={{ display: 'flex', background: 'var(--sidebar-bg)', borderRadius: 6, padding: 2, gap: 2 }}>
          {(['table', 'board', 'gallery'] as View[]).map(v => (
            <button key={v} onClick={() => setView(v)}
              style={{ background: view === v ? 'var(--surface)' : 'none', border: 'none', padding: '4px 10px', borderRadius: 4, fontSize: 12, cursor: 'pointer', color: view === v ? 'var(--text)' : 'var(--text-secondary)', fontFamily: 'var(--font-sans)', fontWeight: view === v ? 500 : 400, boxShadow: view === v ? 'var(--shadow-sm)' : 'none' }}>
              {v === 'table' ? '☰ Table' : v === 'board' ? '⊞ Board' : '⊟ Gallery'}
            </button>
          ))}
        </div>
        <div style={{ width: 1, height: 18, background: 'var(--border)' }} />
        <button onClick={() => setShowFilters(o => !o)}
          style={{ background: showFilters ? 'var(--accent-light)' : 'none', color: showFilters ? 'var(--accent)' : 'var(--text-secondary)', border: 'none', padding: '4px 10px', borderRadius: 5, fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
          ⚡ Filter {filter.value && '(1)'}
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
      </div>

      {/* Filter row */}
      {showFilters && (
        <div style={{ padding: '8px 16px', background: 'var(--sidebar-bg)', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={filter.field} onChange={e => setFilter(f => ({ ...f, field: e.target.value }))} style={ctrlSt}>
            <option value="">Field</option>
            {fields.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <select value={filter.op} onChange={e => setFilter(f => ({ ...f, op: e.target.value }))} style={ctrlSt}>
            <option value="contains">contains</option>
            <option value="equals">equals</option>
            <option value="not_empty">is not empty</option>
          </select>
          {filter.op !== 'not_empty' && <input value={filter.value} onChange={e => setFilter(f => ({ ...f, value: e.target.value }))} placeholder="Value…" style={{ ...ctrlSt, width: 120 }} />}
          <button onClick={() => setFilter({ field: '', op: 'contains', value: '' })} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-sans)' }}>Clear</button>
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
                    {fields.map((f, colIdx) => (
                      <th key={f.id} style={{ minWidth: 140, position: 'relative', background: dragOverColIdx === colIdx ? 'var(--accent-light)' : undefined }}
                        draggable={canEdit}
                        onDragStart={() => handleColDragStart(colIdx)}
                        onDragOver={e => { e.preventDefault(); handleColDragOver(colIdx) }}
                        onDrop={handleColDrop}
                        onDragEnd={() => { setDragColIdx(null); setDragOverColIdx(null) }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ fontSize: 11, color: FIELD_COLORS[f.type] || 'var(--text-tertiary)', fontFamily: 'monospace' }}>{FIELD_ICONS[f.type]}</span>
                          <span style={{ flex: 1, cursor: canEdit ? 'pointer' : 'default', fontSize: 12, fontWeight: 500 }}
                            onDoubleClick={() => canEdit && document.getElementById(`field-name-${f.id}`)?.focus()}>
                            {f.name}
                          </span>
                          {canEdit && <FieldMenu field={f} onRename={() => {
                            const el = document.getElementById(`field-name-${f.id}`) as HTMLInputElement | null
                            el?.focus(); el?.select()
                          }} onChangeType={type => updateField(f.id, { type })} onDelete={() => deleteField(f.id)} />}
                        </div>
                        {canEdit && (
                          <input id={`field-name-${f.id}`}
                            defaultValue={f.name}
                            onBlur={e => { if (e.target.value !== f.name) updateField(f.id, { name: e.target.value }) }}
                            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                            style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }} />
                        )}
                      </th>
                    ))}
                    <th style={{ width: 40 }}>
                      {canEdit && (
                        <button onClick={() => setAddingField(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 16, padding: '0 4px' }} title="Add field">+</button>
                      )}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {displayRecords.map((rec, i) => (
                    <tr key={rec.id}>
                      {fields.map(f => (
                        <td key={f.id} style={{ position: 'relative' }}
                          onClick={() => { if (!canEdit) return; setEditingCell({ recId: rec.id, fieldId: f.id }) }}>
                          <div className="db-cell">
                            <CellValue rec={rec} field={f} />
                          </div>
                        </td>
                      ))}
                      <td style={{ width: 40 }}>
                        {canEdit && (
                          <button onClick={() => deleteRecord(rec.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 12, opacity: 0, padding: '2px 6px' }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '1' }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '0' }}>✕</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* + New record at bottom */}
            {canEdit && (
              <button onClick={addRecord}
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
              <div key={group.label} className="db-board-col">
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                  {group.color && <span style={{ width: 10, height: 10, borderRadius: '50%', background: group.color, flexShrink: 0 }} />}
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{group.label}</span>
                  <span style={{ background: 'var(--border)', borderRadius: 10, padding: '1px 7px', fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 'auto' }}>{group.records.length}</span>
                </div>
                {group.records.map(rec => (
                  <div key={rec.id} className="db-board-card">
                    {fields.filter(f => f.id !== selectField.id).slice(0, 4).map(f => (
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, padding: 16 }}>
            {displayRecords.map(rec => (
              <div key={rec.id} className="db-board-card">
                {fields.slice(0, 3).map(f => (
                  <div key={f.id} style={{ marginBottom: 4, fontSize: 13 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 1 }}>{f.name}</div>
                    <CellValue rec={rec} field={f} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* Add field form */}
        {addingField && canEdit && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'var(--sidebar-bg)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input value={newField.name} onChange={e => setNewField(f => ({ ...f, name: e.target.value }))} placeholder="Field name" autoFocus
              onKeyDown={e => { if (e.key === 'Enter') addField(); if (e.key === 'Escape') setAddingField(false) }}
              style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontFamily: 'var(--font-sans)', fontSize: 13, background: 'var(--surface)', color: 'var(--text)', outline: 'none', width: 160 }} />
            <select value={newField.type} onChange={e => setNewField(f => ({ ...f, type: e.target.value as DbField['type'] }))} style={ctrlSt}>
              {FIELD_TYPES.map(t => <option key={t} value={t}>{FIELD_ICONS[t]} {t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select>
            {newField.type === 'relation' && <RelationPagePicker value="" onChange={pageId => setNewField(f => ({ ...f, relation_page_id: pageId } as any))} excludeId={page.id} />}
            <button onClick={addField} style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: 6, fontFamily: 'var(--font-sans)', fontSize: 13, cursor: 'pointer', fontWeight: 500 }}>Add</button>
            <button onClick={() => setAddingField(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontFamily: 'var(--font-sans)', fontSize: 13 }}>Cancel</button>
          </div>
        )}
      </div>

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: '#37352f', color: '#fff', padding: '10px 16px', borderRadius: 8, fontSize: 13, zIndex: 300 }} className="fade-in">{toast}</div>
      )}
    </div>
  )
}

const FIELD_TYPES_LIST: DbField['type'][] = ['text','number','select','multiselect','date','checkbox','relation','rollup','url','email','phone']

function SelectEditor({ field, currentValue, onSelect, onAddOption, onDeleteOption, onUpdateOptionColor, onClose }: any) {
  const [newLabel, setNewLabel] = useState('')
  const [colorFor, setColorFor] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Focus input without losing the dropdown
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [])

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, minWidth: 200, position: 'absolute', zIndex: 50, boxShadow: 'var(--shadow-lg)', top: '100%', left: 0, overflow: 'hidden' }}
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
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>Add option</div>
        <div style={{ display: 'flex', gap: 4 }}>
          <input
            ref={inputRef}
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            placeholder="Option name…"
            onKeyDown={e => {
              if (e.key === 'Enter' && newLabel.trim()) { onAddOption(newLabel.trim()); setNewLabel('') }
              if (e.key === 'Escape') onClose()
              e.stopPropagation()
            }}
            style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 5, padding: '4px 8px', fontSize: 12, fontFamily: 'var(--font-sans)', outline: 'none' }}
          />
          <button onClick={() => { if (newLabel.trim()) { onAddOption(newLabel.trim()); setNewLabel('') } }}
            style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 5, padding: '4px 8px', cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font-sans)' }}>+</button>
        </div>
      </div>
      <div style={{ padding: '4px 8px 6px' }}>
        <button onClick={onClose} style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-sans)' }}>Done</button>
      </div>
    </div>
  )
}

function FieldMenu({ field, onRename, onChangeType, onDelete }: { field: DbField; onRename: () => void; onChangeType: (t: DbField['type']) => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  const [showTypes, setShowTypes] = useState(false)
  return (
    <div style={{ position: 'relative', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
      <button onClick={() => { setOpen(o => !o); setShowTypes(false) }}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 11, padding: '1px 4px', borderRadius: 3, lineHeight: 1 }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--border)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}>⌄</button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setOpen(false)} />
          <div style={{ position: 'absolute', top: '100%', left: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 7, padding: 5, boxShadow: 'var(--shadow-lg)', zIndex: 50, minWidth: 160 }}>
            <MItem onClick={() => { onRename(); setOpen(false) }}>✏️ Rename</MItem>
            <MItem onClick={() => setShowTypes(o => !o)} extra="›">🔄 Change type</MItem>
            {showTypes && (
              <div style={{ paddingLeft: 8, borderTop: '1px solid var(--border)', marginTop: 2, paddingTop: 2, maxHeight: 200, overflowY: 'auto' }}>
                {FIELD_TYPES_LIST.map(t => (
                  <MItem key={t} onClick={() => { onChangeType(t); setOpen(false) }} active={t === field.type}>
                    {FIELD_ICONS[t]} {t.charAt(0).toUpperCase() + t.slice(1)}
                  </MItem>
                ))}
              </div>
            )}
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

function RelationPagePicker({ value, onChange, excludeId }: { value: string; onChange: (id: string) => void; excludeId?: string }) {
  const [pages, setPages] = useState<{id: string; title: string; icon: string}[]>([])
  const [loaded, setLoaded] = useState(false)
  const supabase = createClient()
  async function load() {
    if (loaded) return
    const { data } = await supabase.from('pages').select('id, title, icon').eq('is_database', true).order('title')
    setPages((data || []).filter(p => p.id !== excludeId))
    setLoaded(true)
  }
  return (
    <select value={value} onChange={e => onChange(e.target.value)} onFocus={load} onClick={e => e.stopPropagation()} style={{ ...ctrlSt, color: 'var(--accent)' }}>
      <option value="">— Link to database</option>
      {pages.map(p => <option key={p.id} value={p.id}>{p.icon} {p.title}</option>)}
    </select>
  )
}

const ctrlSt: React.CSSProperties = { padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 5, fontFamily: 'var(--font-sans)', fontSize: 12, background: 'var(--sidebar-bg)', color: 'var(--text)', outline: 'none', cursor: 'pointer' }

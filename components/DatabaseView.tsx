'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Page, DbField, DbRecord } from '@/lib/types'

type View = 'table' | 'board' | 'gallery'

type Props = {
  page: Page
  canEdit: boolean
}

const FIELD_COLORS: Record<string, string> = {
  text: '#787774', number: '#0b6e99', select: '#0f7b6c',
  multiselect: '#6940a5', date: '#d9730d', checkbox: '#0f7b6c',
  relation: '#ad1a72', rollup: '#787774', url: '#0b6e99',
  email: '#0b6e99', phone: '#0b6e99'
}

const FIELD_ICONS: Record<string, string> = {
  text: 'T', number: '#', select: '◉', multiselect: '◈',
  date: '📅', checkbox: '☑', relation: '↗', rollup: '∑',
  url: '🔗', email: '✉', phone: '📞'
}

const SELECT_COLORS = [
  '#fde68a','#bbf7d0','#bfdbfe','#fecaca','#e9d5ff',
  '#fed7aa','#cffafe','#fbcfe8','#d1fae5','#ddd6fe'
]

export default function DatabaseView({ page, canEdit }: Props) {
  const [fields, setFields] = useState<DbField[]>([])
  const [records, setRecords] = useState<DbRecord[]>([])
  const [view, setView] = useState<View>('table')
  const [filter, setFilter] = useState({ field: '', op: 'contains', value: '' })
  const [sort, setSort] = useState({ field: '', dir: 'asc' as 'asc' | 'desc' })
  const [editingCell, setEditingCell] = useState<{ recId: string; fieldId: string } | null>(null)
  const [editVal, setEditVal] = useState<any>('')
  const [addingField, setAddingField] = useState(false)
  const [newField, setNewField] = useState({ name: '', type: 'text' as DbField['type'] })
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [relatedPages, setRelatedPages] = useState<{id: string; title: string; icon: string}[]>([])
  const [relatedRecords, setRelatedRecords] = useState<Record<string, DbRecord[]>>({})
  const [relations, setRelations] = useState<any[]>([])
  const [toast, setToast] = useState('')
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

    // Load related pages and records for relation fields
    const relFields = fieldsData.filter(x => x.type === 'relation' && x.relation_page_id)
    if (relFields.length > 0) {
      const pageIds = [...new Set(relFields.map(x => x.relation_page_id!))]
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
    const { data, error } = await supabase.from('db_records').insert({
      page_id: page.id, data: {}, position: maxPos + 1
    }).select().single()
    if (!error && data) setRecords(r => [...r, data])
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
  }

  async function addField() {
    if (!newField.name.trim()) return
    const maxPos = fields.reduce((m, f) => Math.max(m, f.position), 0)
    const { data, error } = await supabase.from('db_fields').insert({
      page_id: page.id, name: newField.name.trim(), type: newField.type,
      options: [], position: maxPos + 1
    }).select().single()
    if (!error && data) {
      setFields(f => [...f, data])
      setNewField({ name: '', type: 'text' })
      setAddingField(false)
      showToastMsg('Field added')
    }
  }

  async function deleteField(id: string) {
    await supabase.from('db_fields').delete().eq('id', id)
    setFields(f => f.filter(x => x.id !== id))
  }

  async function updateField(id: string, updates: Partial<DbField>) {
    await supabase.from('db_fields').update(updates).eq('id', id)
    setFields(f => f.map(x => x.id === id ? { ...x, ...updates } : x))
  }

  async function addSelectOption(fieldId: string, option: string) {
    const field = fields.find(f => f.id === fieldId)
    if (!field) return
    const newOptions = [...(field.options || []), { label: option, color: SELECT_COLORS[field.options?.length % SELECT_COLORS.length || 0] }]
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

  function showToastMsg(msg: string) { setToast(msg); setTimeout(() => setToast(''), 2000) }

  // Filter & sort
  let displayRecords = [...records]
  if (filter.field && filter.value) {
    const f = fields.find(x => x.id === filter.field)
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
      const av = String(a.data?.[sort.field] ?? '')
      const bv = String(b.data?.[sort.field] ?? '')
      return sort.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
    })
  }

  // Board grouping
  const selectField = fields.find(f => f.type === 'select')
  const boardGroups = selectField
    ? [...(selectField.options || []).map((o: any) => o.label || o), 'No status'].map(group => ({
        label: group,
        color: (selectField.options || []).find((o: any) => (o.label || o) === group)?.color,
        records: displayRecords.filter(r => (r.data?.[selectField.id] || 'No status') === group)
      }))
    : [{ label: 'All', color: undefined, records: displayRecords }]

  function CellValue({ rec, field }: { rec: DbRecord; field: DbField }) {
    const val = rec.data?.[field.id]
    const isEditing = editingCell?.recId === rec.id && editingCell?.fieldId === field.id

    function startEdit() {
      if (!canEdit) return
      setEditingCell({ recId: rec.id, fieldId: field.id })
      setEditVal(val ?? '')
    }

    async function commitEdit(v: any) {
      await updateCell(rec.id, field.id, v)
      setEditingCell(null)
    }

    if (isEditing) {
      if (field.type === 'checkbox') return (
        <input type="checkbox" checked={!!editVal} autoFocus
          onChange={e => { commitEdit(e.target.checked) }}
          style={{ width: '16px', height: '16px', accentColor: 'var(--accent)', cursor: 'pointer' }} />
      )
      if (field.type === 'select') return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '4px', minWidth: '120px', position: 'absolute', zIndex: 50, boxShadow: 'var(--shadow)' }}>
          <div className="db-cell" style={{ color: 'var(--text-tertiary)', fontSize: '12px' }} onClick={() => commitEdit('')}>— None</div>
          {(field.options || []).map((opt: any) => {
            const label = opt.label || opt
            const color = opt.color || '#e9e9e7'
            return (
              <div key={label} className="db-cell" onClick={() => commitEdit(label)}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                <span className="db-tag" style={{ background: color + '40', color: '#37352f', fontSize: '12px' }}>{label}</span>
              </div>
            )
          })}
          <div style={{ borderTop: '1px solid var(--border)', marginTop: '4px', paddingTop: '4px' }}>
            <input placeholder="Add option…" autoFocus style={{ width: '100%', border: 'none', outline: 'none', fontSize: '12px', fontFamily: 'var(--font-sans)', color: 'var(--text)' }}
              onKeyDown={e => { if (e.key === 'Enter') { addSelectOption(field.id, (e.target as HTMLInputElement).value); setEditingCell(null) } if (e.key === 'Escape') setEditingCell(null) }} />
          </div>
        </div>
      )
      if (field.type === 'relation') {
        const relPage = relatedPages.find(p => p.id === field.relation_page_id)
        const recs = relatedRecords[field.relation_page_id || ''] || []
        const activeRelIds = relations.filter(r => r.field_id === field.id && r.from_record_id === rec.id).map(r => r.to_record_id)
        return (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px', minWidth: '160px', position: 'absolute', zIndex: 50, boxShadow: 'var(--shadow)', maxHeight: '200px', overflowY: 'auto' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '4px', fontWeight: 600 }}>{relPage?.title || 'Related'}</div>
            {recs.map(rr => {
              const isLinked = activeRelIds.includes(rr.id)
              return (
                <div key={rr.id} onClick={() => toggleRelation(field.id, rec.id, rr.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 6px', borderRadius: '4px', cursor: 'pointer', background: isLinked ? 'var(--accent-light)' : 'transparent' }}
                  className="sidebar-item">
                  <span style={{ fontSize: '12px', color: isLinked ? 'var(--accent)' : 'var(--text-tertiary)' }}>{isLinked ? '✓' : '○'}</span>
                  <span style={{ fontSize: '13px' }}>{Object.values(rr.data || {})[0] as string || 'Untitled'}</span>
                </div>
              )
            })}
            <div style={{ borderTop: '1px solid var(--border)', marginTop: '4px', paddingTop: '4px' }}>
              <button onClick={() => setEditingCell(null)} style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-sans)', padding: '2px' }}>Done</button>
            </div>
          </div>
        )
      }
      return (
        <input autoFocus value={String(editVal ?? '')} onChange={e => setEditVal(e.target.value)}
          onBlur={() => commitEdit(editVal)}
          onKeyDown={e => { if (e.key === 'Enter') commitEdit(editVal); if (e.key === 'Escape') setEditingCell(null) }}
          type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
          style={{ width: '100%', border: 'none', outline: 'none', background: 'transparent', fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--text)', padding: 0 }} />
      )
    }

    // Display mode
    if (field.type === 'checkbox') return <input type="checkbox" checked={!!val} readOnly style={{ width: '16px', height: '16px', accentColor: 'var(--accent)', pointerEvents: 'none' }} />
    if (field.type === 'select' && val) {
      const opt = (field.options || []).find((o: any) => (o.label || o) === val)
      const color = opt?.color || '#e9e9e7'
      return <span className="db-tag" style={{ background: color + '40', color: '#37352f' }}>{val}</span>
    }
    if (field.type === 'relation') {
      const activeRelIds = relations.filter(r => r.field_id === field.id && r.from_record_id === rec.id).map(r => r.to_record_id)
      const linkedRecs = (relatedRecords[field.relation_page_id || ''] || []).filter(r => activeRelIds.includes(r.id))
      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
          {linkedRecs.map(r => (
            <span key={r.id} className="db-tag" style={{ background: 'var(--accent-light)', color: 'var(--accent)', fontSize: '11px' }}>
              {Object.values(r.data || {})[0] as string || 'Untitled'}
            </span>
          ))}
        </div>
      )
    }
    if (field.type === 'rollup') {
      // Simple rollup: count relations
      const relField = fields.find(f => f.id === field.rollup_field_id)
      if (relField?.type === 'relation') {
        const count = relations.filter(r => r.field_id === relField.id && r.from_record_id === rec.id).length
        return <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>{count}</span>
      }
    }
    return <span style={{ color: val ? 'var(--text)' : 'var(--text-tertiary)', fontSize: '13px' }}>{val || (canEdit ? '' : '')}</span>
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* DB Header */}
      <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, flexWrap: 'wrap', background: 'var(--surface)' }}>
        {/* View switcher */}
        <div style={{ display: 'flex', background: 'var(--sidebar-bg)', borderRadius: '6px', padding: '2px', gap: '2px' }}>
          {(['table', 'board', 'gallery'] as View[]).map(v => (
            <button key={v} onClick={() => setView(v)}
              style={{ background: view === v ? 'var(--surface)' : 'none', border: 'none', padding: '4px 10px', borderRadius: '4px', fontSize: '12px', cursor: 'pointer', color: view === v ? 'var(--text)' : 'var(--text-secondary)', fontFamily: 'var(--font-sans)', fontWeight: view === v ? 500 : 400, boxShadow: view === v ? 'var(--shadow-sm)' : 'none' }}>
              {v === 'table' ? '☰ Table' : v === 'board' ? '⊞ Board' : '⊟ Gallery'}
            </button>
          ))}
        </div>

        <div style={{ width: '1px', height: '18px', background: 'var(--border)' }} />

        {/* Filter */}
        <button onClick={() => setShowFilters(o => !o)}
          style={{ background: showFilters ? 'var(--accent-light)' : 'none', color: showFilters ? 'var(--accent)' : 'var(--text-secondary)', border: 'none', padding: '4px 10px', borderRadius: '5px', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font-sans)', display: 'flex', alignItems: 'center', gap: '4px' }}>
          ⚡ Filter {filter.value && `(1)`}
        </button>

        {/* Sort */}
        <select value={sort.field} onChange={e => setSort(s => ({ ...s, field: e.target.value }))}
          style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: '5px', fontSize: '12px', fontFamily: 'var(--font-sans)', background: sort.field ? 'var(--accent-light)' : 'var(--sidebar-bg)', color: sort.field ? 'var(--accent)' : 'var(--text-secondary)', cursor: 'pointer', outline: 'none' }}>
          <option value="">↕ Sort</option>
          {fields.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        {sort.field && (
          <button onClick={() => setSort(s => ({ ...s, dir: s.dir === 'asc' ? 'desc' : 'asc' }))}
            style={{ background: 'var(--accent-light)', color: 'var(--accent)', border: 'none', padding: '4px 10px', borderRadius: '5px', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
            {sort.dir === 'asc' ? '↑ Asc' : '↓ Desc'}
          </button>
        )}

        {canEdit && (
          <button onClick={addRecord}
            style={{ marginLeft: 'auto', background: 'var(--accent)', color: '#fff', border: 'none', padding: '5px 14px', borderRadius: '5px', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontWeight: 500 }}>
            + New
          </button>
        )}
      </div>

      {/* Filter row */}
      {showFilters && (
        <div style={{ padding: '8px 16px', background: 'var(--sidebar-bg)', borderBottom: '1px solid var(--border)', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={filter.field} onChange={e => setFilter(f => ({ ...f, field: e.target.value }))} style={ctrlSt}>
            <option value="">Field</option>
            {fields.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <select value={filter.op} onChange={e => setFilter(f => ({ ...f, op: e.target.value }))} style={ctrlSt}>
            <option value="contains">contains</option>
            <option value="equals">equals</option>
            <option value="not_empty">is not empty</option>
          </select>
          {filter.op !== 'not_empty' && (
            <input value={filter.value} onChange={e => setFilter(f => ({ ...f, value: e.target.value }))}
              placeholder="Value…" style={{ ...ctrlSt, width: '120px' }} />
          )}
          <button onClick={() => setFilter({ field: '', op: 'contains', value: '' })}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-sans)' }}>Clear</button>
        </div>
      )}

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '0' }}>
        {view === 'table' && (
          <table className="db-table" style={{ minWidth: '100%' }}>
            <thead>
              <tr>
                {fields.map(f => (
                  <th key={f.id} style={{ minWidth: '140px', position: 'relative' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span style={{ fontSize: '11px', color: FIELD_COLORS[f.type] || 'var(--text-tertiary)', fontWeight: 400 }}>{FIELD_ICONS[f.type]}</span>
                      {editingFieldId === f.id
                        ? <input autoFocus defaultValue={f.name}
                            onBlur={e => { updateField(f.id, { name: e.target.value }); setEditingFieldId(null) }}
                            onKeyDown={e => { if (e.key === 'Enter') { updateField(f.id, { name: (e.target as HTMLInputElement).value }); setEditingFieldId(null) } if (e.key === 'Escape') setEditingFieldId(null) }}
                            style={{ border: 'none', borderBottom: '1px solid var(--accent)', background: 'transparent', fontFamily: 'var(--font-sans)', fontSize: '12px', outline: 'none', width: '80px' }} />
                        : <span style={{ cursor: 'pointer' }} onClick={() => canEdit && setEditingFieldId(f.id)}>{f.name}</span>
                      }
                      {/* Relation page selector */}
                      {f.type === 'relation' && canEdit && (
                        <RelationPagePicker
                          value={f.relation_page_id || ''}
                          onChange={pageId => updateField(f.id, { relation_page_id: pageId || null })}
                        />
                      )}
                      {canEdit && (
                        <button onClick={() => deleteField(f.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: '10px', opacity: 0, padding: '0 2px', marginLeft: 'auto' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '1' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '0' }}>✕</button>
                      )}
                    </div>
                  </th>
                ))}
                <th style={{ width: '40px' }}>
                  {canEdit && (
                    <button onClick={() => setAddingField(true)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: '14px', padding: '0 4px' }}
                      title="Add field">+</button>
                  )}
                </th>
              </tr>
            </thead>
            <tbody>
              {displayRecords.map((rec, i) => (
                <tr key={rec.id}>
                  {fields.map(f => (
                    <td key={f.id} style={{ position: 'relative' }} onClick={() => canEdit && setEditingCell({ recId: rec.id, fieldId: f.id })}>
                      <div className="db-cell">
                        <CellValue rec={rec} field={f} />
                      </div>
                    </td>
                  ))}
                  <td>
                    {canEdit && (
                      <button onClick={() => deleteRecord(rec.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: '12px', opacity: 0, padding: '2px 6px' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '1' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '0' }}>✕</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {view === 'board' && (
          <div style={{ display: 'flex', gap: '12px', padding: '16px', overflowX: 'auto', alignItems: 'flex-start', minHeight: '200px' }}>
            {!selectField ? (
              <div style={{ color: 'var(--text-secondary)', fontSize: '14px', padding: '20px', background: 'var(--sidebar-bg)', borderRadius: '8px' }}>
                Add a <strong>Select</strong> field to enable board view.
              </div>
            ) : boardGroups.map(group => (
              <div key={group.label} className="db-board-col">
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                  {group.color && <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: group.color, flexShrink: 0 }} />}
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{group.label}</span>
                  <span style={{ background: 'var(--border)', borderRadius: '10px', padding: '1px 7px', fontSize: '11px', color: 'var(--text-tertiary)', marginLeft: 'auto' }}>{group.records.length}</span>
                </div>
                {group.records.map(rec => (
                  <div key={rec.id} className="db-board-card">
                    {fields.filter(f => f.id !== selectField.id).slice(0, 4).map(f => (
                      <div key={f.id} style={{ marginBottom: '4px' }}>
                        <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '1px' }}>{f.name}</div>
                        <CellValue rec={rec} field={f} />
                      </div>
                    ))}
                    {canEdit && (
                      <button onClick={() => deleteRecord(rec.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: '11px', marginTop: '6px', padding: 0, fontFamily: 'var(--font-sans)' }}>Delete</button>
                    )}
                  </div>
                ))}
                {canEdit && (
                  <button onClick={async () => {
                    const { data } = await supabase.from('db_records').insert({
                      page_id: page.id, data: { [selectField.id]: group.label === 'No status' ? '' : group.label }, position: Date.now()
                    }).select().single()
                    if (data) setRecords(r => [...r, data])
                  }} style={{ width: '100%', background: 'none', border: '1px dashed var(--border)', borderRadius: '6px', padding: '6px', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: '12px', fontFamily: 'var(--font-sans)', marginTop: '4px' }}
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px', padding: '16px' }}>
            {displayRecords.map(rec => (
              <div key={rec.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', cursor: 'pointer' }}
                className="db-board-card">
                {/* Cover image if any url/image field */}
                {fields.filter(f => f.type === 'url').map(f => rec.data?.[f.id]).filter(Boolean).slice(0, 1).map((url, i) => (
                  <img key={i} src={url} alt="" style={{ width: '100%', height: '120px', objectFit: 'cover' }} />
                ))}
                <div style={{ padding: '10px' }}>
                  {fields.slice(0, 3).map(f => (
                    <div key={f.id} style={{ marginBottom: '4px', fontSize: '13px' }}>
                      <CellValue rec={rec} field={f} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add field panel */}
        {addingField && canEdit && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'var(--sidebar-bg)', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <input value={newField.name} onChange={e => setNewField(f => ({ ...f, name: e.target.value }))}
              placeholder="Field name" autoFocus
              style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: '6px', fontFamily: 'var(--font-sans)', fontSize: '13px', background: 'var(--surface)', color: 'var(--text)', outline: 'none', width: '160px' }} />
            <select value={newField.type} onChange={e => setNewField(f => ({ ...f, type: e.target.value as DbField['type'] }))} style={ctrlSt}>
              {(['text','number','select','multiselect','date','checkbox','relation','rollup','url','email','phone'] as DbField['type'][]).map(t => (
                <option key={t} value={t}>{FIELD_ICONS[t]} {t.charAt(0).toUpperCase() + t.slice(1)}</option>
              ))}
            </select>
            <button onClick={addField} style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: '6px', fontFamily: 'var(--font-sans)', fontSize: '13px', cursor: 'pointer', fontWeight: 500 }}>Add</button>
            <button onClick={() => setAddingField(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontFamily: 'var(--font-sans)', fontSize: '13px' }}>Cancel</button>
          </div>
        )}

        {canEdit && !addingField && (
          <div style={{ padding: '8px 16px' }}>
            <button onClick={() => setAddingField(true)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontFamily: 'var(--font-sans)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--accent)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-tertiary)' }}>
              + Add field
            </button>
          </div>
        )}
      </div>

      {toast && (
        <div style={{ position: 'fixed', bottom: '24px', right: '24px', background: '#37352f', color: '#fff', padding: '10px 16px', borderRadius: '8px', fontSize: '13px', zIndex: 300 }} className="fade-in">
          {toast}
        </div>
      )}
    </div>
  )
}

function RelationPagePicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [pages, setPages] = useState<{id: string; title: string; icon: string}[]>([])
  const [loaded, setLoaded] = useState(false)
  const supabase = createClient()

  async function load() {
    if (loaded) return
    const { data } = await supabase.from('pages').select('id, title, icon').eq('is_database', true).order('title')
    setPages(data || [])
    setLoaded(true)
  }

  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      onFocus={load}
      onClick={e => e.stopPropagation()}
      style={{ fontSize: '10px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--accent)', outline: 'none', fontFamily: 'var(--font-sans)', maxWidth: '90px' }}>
      <option value="">— link to</option>
      {pages.map(p => <option key={p.id} value={p.id}>{p.icon} {p.title}</option>)}
    </select>
  )
}

const ctrlSt: React.CSSProperties = { padding: '4px 8px', border: '1px solid var(--border)', borderRadius: '5px', fontFamily: 'var(--font-sans)', fontSize: '12px', background: 'var(--sidebar-bg)', color: 'var(--text)', outline: 'none', cursor: 'pointer' }

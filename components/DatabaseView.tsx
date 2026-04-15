'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

type Field = { id: string; name: string; type: 'text' | 'number' | 'select' | 'date' | 'checkbox'; options?: string[] }
type Row = { id: string; [key: string]: any }
type Database = { id: string; title: string; fields: Field[]; owner_id: string; created_at: string }

export default function DatabaseView({ db: initialDb, canEdit, isOwner }: {
  db: Database; canEdit: boolean; isOwner: boolean
}) {
  const [db, setDb] = useState(initialDb)
  const [rows, setRows] = useState<Row[]>([])
  const [viewMode, setViewMode] = useState<'list' | 'board'>('list')
  const [filter, setFilter] = useState<{ field: string; value: string }>({ field: '', value: '' })
  const [sort, setSort] = useState<{ field: string; dir: 'asc' | 'desc' }>({ field: '', dir: 'asc' })
  const [editingCell, setEditingCell] = useState<{ rowId: string; fieldId: string } | null>(null)
  const [editVal, setEditVal] = useState('')
  const [addingField, setAddingField] = useState(false)
  const [newFieldName, setNewFieldName] = useState('')
  const [newFieldType, setNewFieldType] = useState<Field['type']>('text')
  const [toast, setToast] = useState('')
  const [title, setTitle] = useState(initialDb.title)
  const [saved, setSaved] = useState(true)
  const supabase = createClient()

  useEffect(() => { loadRows() }, [db.id])

  async function loadRows() {
    const { data } = await supabase.from('db_rows').select('*').eq('database_id', db.id).order('created_at')
    setRows(data || [])
  }

  async function saveTitle(v: string) {
    setTitle(v); setSaved(false)
    await supabase.from('databases').update({ title: v }).eq('id', db.id)
    setSaved(true)
  }

  async function addRow() {
    const { data, error } = await supabase.from('db_rows').insert({ database_id: db.id, data: {} }).select().single()
    if (!error && data) setRows(r => [...r, data])
  }

  async function deleteRow(id: string) {
    await supabase.from('db_rows').delete().eq('id', id)
    setRows(r => r.filter(x => x.id !== id))
  }

  async function updateCell(rowId: string, fieldId: string, value: any) {
    const row = rows.find(r => r.id === rowId)
    if (!row) return
    const newData = { ...(row.data || {}), [fieldId]: value }
    await supabase.from('db_rows').update({ data: newData }).eq('id', rowId)
    setRows(r => r.map(x => x.id === rowId ? { ...x, data: newData } : x))
  }

  async function addField() {
    if (!newFieldName.trim()) return
    const field: Field = { id: 'f_' + Date.now(), name: newFieldName.trim(), type: newFieldType, options: newFieldType === 'select' ? ['Option 1', 'Option 2'] : undefined }
    const newFields = [...(db.fields || []), field]
    await supabase.from('databases').update({ fields: newFields }).eq('id', db.id)
    setDb(d => ({ ...d, fields: newFields }))
    setNewFieldName(''); setAddingField(false)
    showToast('Field added!')
  }

  async function deleteField(fieldId: string) {
    const newFields = db.fields.filter(f => f.id !== fieldId)
    await supabase.from('databases').update({ fields: newFields }).eq('id', db.id)
    setDb(d => ({ ...d, fields: newFields }))
  }

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 2000) }

  // Filter + sort
  let displayRows = [...rows]
  if (filter.field && filter.value) {
    displayRows = displayRows.filter(r => {
      const val = String(r.data?.[filter.field] || '').toLowerCase()
      return val.includes(filter.value.toLowerCase())
    })
  }
  if (sort.field) {
    displayRows.sort((a, b) => {
      const av = a.data?.[sort.field] || '', bv = b.data?.[sort.field] || ''
      return sort.dir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av))
    })
  }

  // Board: group by first select field
  const selectField = db.fields?.find(f => f.type === 'select')
  const boardGroups = selectField
    ? [...(selectField.options || []), 'Unset'].map(opt => ({
        label: opt,
        rows: displayRows.filter(r => (r.data?.[selectField.id] || 'Unset') === opt)
      }))
    : []

  function CellValue({ row, field }: { row: Row; field: Field }) {
    const val = row.data?.[field.id]
    const isEditing = editingCell?.rowId === row.id && editingCell?.fieldId === field.id

    if (isEditing) {
      if (field.type === 'select') {
        return (
          <select autoFocus value={editVal} onChange={e => setEditVal(e.target.value)}
            onBlur={async () => { await updateCell(row.id, field.id, editVal); setEditingCell(null) }}
            style={{ width: '100%', border: '1px solid var(--accent)', borderRadius: '4px', padding: '2px 6px', fontFamily: 'var(--font-sans)', fontSize: '13px', background: 'var(--surface)', outline: 'none' }}>
            <option value="">—</option>
            {field.options?.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        )
      }
      if (field.type === 'checkbox') {
        return <input type="checkbox" checked={!!editVal} onChange={e => setEditVal(String(e.target.checked))}
          onBlur={async () => { await updateCell(row.id, field.id, editVal === 'true'); setEditingCell(null) }} />
      }
      return (
        <input autoFocus type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
          value={editVal} onChange={e => setEditVal(e.target.value)}
          onBlur={async () => { await updateCell(row.id, field.id, editVal); setEditingCell(null) }}
          onKeyDown={async e => { if (e.key === 'Enter') { await updateCell(row.id, field.id, editVal); setEditingCell(null) } }}
          style={{ width: '100%', border: '1px solid var(--accent)', borderRadius: '4px', padding: '2px 6px', fontFamily: 'var(--font-sans)', fontSize: '13px', background: 'var(--surface)', outline: 'none' }} />
      )
    }

    return (
      <div onClick={() => { if (!canEdit) return; setEditingCell({ rowId: row.id, fieldId: field.id }); setEditVal(String(val ?? '')) }}
        style={{ minHeight: '22px', cursor: canEdit ? 'pointer' : 'default', padding: '1px 4px', borderRadius: '4px', fontSize: '13px' }}
        onMouseEnter={e => { if (canEdit) (e.currentTarget as HTMLElement).style.background = 'var(--accent-light)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
        {field.type === 'checkbox'
          ? <input type="checkbox" checked={!!val} readOnly style={{ pointerEvents: 'none' }} />
          : field.type === 'select' && val
            ? <span style={{ background: 'var(--accent-light)', color: 'var(--accent)', padding: '1px 8px', borderRadius: '10px', fontSize: '12px' }}>{val}</span>
            : <span style={{ color: val ? 'var(--text)' : 'var(--muted)' }}>{val || (canEdit ? '—' : '')}</span>
        }
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0, flexWrap: 'wrap' }}>
        {canEdit
          ? <input value={title} onChange={e => saveTitle(e.target.value)} style={{ fontFamily: 'var(--font-serif)', fontSize: '1.3rem', fontWeight: 600, border: 'none', background: 'transparent', outline: 'none', color: 'var(--text)', minWidth: '180px' }} />
          : <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.3rem', fontWeight: 600 }}>{title}</h2>
        }

        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginLeft: 'auto', alignItems: 'center' }}>
          {/* Filter */}
          {db.fields?.length > 0 && (
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <select value={filter.field} onChange={e => setFilter(f => ({ ...f, field: e.target.value }))} style={ctrlSt}>
                <option value="">Filter by…</option>
                {db.fields.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
              {filter.field && <input value={filter.value} onChange={e => setFilter(f => ({ ...f, value: e.target.value }))} placeholder="Value…" style={{ ...ctrlSt, width: '100px' }} />}
            </div>
          )}
          {/* Sort */}
          {db.fields?.length > 0 && (
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <select value={sort.field} onChange={e => setSort(s => ({ ...s, field: e.target.value }))} style={ctrlSt}>
                <option value="">Sort by…</option>
                {db.fields.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
              {sort.field && (
                <button onClick={() => setSort(s => ({ ...s, dir: s.dir === 'asc' ? 'desc' : 'asc' }))} style={ctrlSt}>
                  {sort.dir === 'asc' ? '↑ Asc' : '↓ Desc'}
                </button>
              )}
            </div>
          )}
          {/* View toggle */}
          <div style={{ display: 'flex', background: 'var(--sidebar)', borderRadius: '7px', padding: '2px', gap: '2px' }}>
            <ViewBtn active={viewMode === 'list'} onClick={() => setViewMode('list')}>☰ List</ViewBtn>
            <ViewBtn active={viewMode === 'board'} onClick={() => setViewMode('board')}>⊞ Board</ViewBtn>
          </div>
        </div>
      </div>

      {/* CONTENT */}
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
        {viewMode === 'list' ? (
          <div>
            {/* Table */}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                  {db.fields?.map(f => (
                    <th key={f.id} style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 500, color: 'var(--muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {fieldIcon(f.type)} {f.name}
                        {canEdit && <button onClick={() => deleteField(f.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '10px', opacity: 0.5, padding: '0 2px' }}>✕</button>}
                      </div>
                    </th>
                  ))}
                  <th style={{ width: '40px' }}></th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map((row, i) => (
                  <tr key={row.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.015)' }}>
                    {db.fields?.map(f => (
                      <td key={f.id} style={{ padding: '6px 12px', verticalAlign: 'middle' }}>
                        <CellValue row={row} field={f} />
                      </td>
                    ))}
                    <td style={{ padding: '6px', textAlign: 'right' }}>
                      {canEdit && <button onClick={() => deleteRow(row.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '12px', opacity: 0.4, padding: '2px 4px' }}>✕</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {canEdit && (
              <button onClick={addRow} style={{ marginTop: '10px', background: 'none', border: '1px dashed var(--border)', borderRadius: '8px', padding: '7px 16px', cursor: 'pointer', color: 'var(--muted)', fontFamily: 'var(--font-sans)', fontSize: '13px', width: '100%', transition: 'all 0.15s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--accent-light)'; (e.currentTarget as HTMLElement).style.color = 'var(--accent)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; (e.currentTarget as HTMLElement).style.color = 'var(--muted)' }}>
                + New row
              </button>
            )}
          </div>
        ) : (
          /* BOARD VIEW */
          <div style={{ display: 'flex', gap: '16px', overflowX: 'auto', paddingBottom: '16px', minHeight: '200px' }}>
            {!selectField
              ? <div style={{ color: 'var(--muted)', fontSize: '14px', padding: '20px' }}>Add a <strong>Select</strong> field to enable board view.</div>
              : boardGroups.map(group => (
                <div key={group.label} style={{ minWidth: '240px', background: 'var(--sidebar)', borderRadius: '10px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ fontWeight: 500, fontSize: '13px', color: 'var(--muted)', padding: '0 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>{group.label}</span>
                    <span style={{ background: 'var(--border)', borderRadius: '10px', padding: '1px 7px', fontSize: '11px' }}>{group.rows.length}</span>
                  </div>
                  {group.rows.map(row => (
                    <div key={row.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 12px', fontSize: '13px' }}>
                      {db.fields?.filter(f => f.id !== selectField?.id).map(f => (
                        <div key={f.id} style={{ marginBottom: '4px' }}>
                          <span style={{ color: 'var(--muted)', fontSize: '11px' }}>{f.name}: </span>
                          <span>{row.data?.[f.id] || '—'}</span>
                        </div>
                      ))}
                      {canEdit && <button onClick={() => deleteRow(row.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '11px', marginTop: '4px', padding: '0' }}>Delete</button>}
                    </div>
                  ))}
                  {canEdit && (
                    <button onClick={async () => {
                      const { data } = await supabase.from('db_rows').insert({ database_id: db.id, data: { [selectField.id]: group.label === 'Unset' ? '' : group.label } }).select().single()
                      if (data) setRows(r => [...r, data])
                    }} style={{ background: 'none', border: '1px dashed var(--border)', borderRadius: '7px', padding: '6px', cursor: 'pointer', color: 'var(--muted)', fontSize: '12px' }}>+ Add</button>
                  )}
                </div>
              ))
            }
          </div>
        )}

        {/* Add field */}
        {canEdit && (
          <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
            {!addingField
              ? <button onClick={() => setAddingField(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontFamily: 'var(--font-sans)', fontSize: '13px', padding: '4px 0' }}>+ Add field</button>
              : (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <input value={newFieldName} onChange={e => setNewFieldName(e.target.value)} placeholder="Field name" autoFocus
                    style={{ padding: '7px 10px', border: '1px solid var(--border)', borderRadius: '7px', fontFamily: 'var(--font-sans)', fontSize: '13px', background: 'var(--bg)', color: 'var(--text)', outline: 'none', width: '160px' }} />
                  <select value={newFieldType} onChange={e => setNewFieldType(e.target.value as Field['type'])} style={ctrlSt}>
                    <option value="text">Text</option>
                    <option value="number">Number</option>
                    <option value="select">Select</option>
                    <option value="date">Date</option>
                    <option value="checkbox">Checkbox</option>
                  </select>
                  <button onClick={addField} style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '7px 14px', borderRadius: '7px', fontFamily: 'var(--font-sans)', fontSize: '13px', cursor: 'pointer', fontWeight: 500 }}>Add</button>
                  <button onClick={() => setAddingField(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '13px', fontFamily: 'var(--font-sans)' }}>Cancel</button>
                </div>
              )
            }
          </div>
        )}
      </div>

      {toast && <div style={{ position: 'fixed', bottom: '24px', right: '24px', background: 'var(--text)', color: '#fff', padding: '10px 18px', borderRadius: '10px', fontSize: '13px', zIndex: 200 }}>{toast}</div>}
    </div>
  )
}

function fieldIcon(type: Field['type']) {
  return { text: 'T', number: '#', select: '◉', date: '📅', checkbox: '☑' }[type] || 'T'
}

function ViewBtn({ active, onClick, children }: any) {
  return (
    <button onClick={onClick} style={{ background: active ? 'var(--surface)' : 'none', border: 'none', padding: '3px 10px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', color: active ? 'var(--text)' : 'var(--muted)', fontFamily: 'var(--font-sans)', fontWeight: active ? 500 : 400, boxShadow: active ? '0 1px 2px rgba(0,0,0,0.08)' : 'none' }}>
      {children}
    </button>
  )
}

const ctrlSt: React.CSSProperties = { padding: '5px 8px', border: '1px solid var(--border)', borderRadius: '7px', fontFamily: 'var(--font-sans)', fontSize: '12px', background: 'var(--bg)', color: 'var(--text)', outline: 'none', cursor: 'pointer' }

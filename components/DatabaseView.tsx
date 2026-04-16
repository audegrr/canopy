'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type Field = { id: string; name: string; type: 'text' | 'number' | 'select' | 'date' | 'checkbox'; options?: string[] }
type Row = { id: string; data: Record<string, any>; created_at: string }
type Database = { id: string; title: string; fields: Field[]; owner_id: string; created_at: string }

export default function DatabaseView({ db: initialDb, canEdit, isOwner }: {
  db: Database; canEdit: boolean; isOwner: boolean
}) {
  const [db, setDb] = useState(initialDb)
  const [rows, setRows] = useState<Row[]>([])
  const [viewMode, setViewMode] = useState<'list' | 'board'>('list')
  const [filter, setFilter] = useState({ field: '', value: '' })
  const [sort, setSort] = useState({ field: '', dir: 'asc' as 'asc' | 'desc' })
  const [editingCell, setEditingCell] = useState<{ rowId: string; fieldId: string } | null>(null)
  const [editVal, setEditVal] = useState('')
  const [addingField, setAddingField] = useState(false)
  const [newFieldName, setNewFieldName] = useState('')
  const [newFieldType, setNewFieldType] = useState<Field['type']>('text')
  const [newFieldOptions, setNewFieldOptions] = useState('Option 1, Option 2')
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const [title, setTitle] = useState(initialDb.title)
  const [editingTitle, setEditingTitle] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => { loadRows() }, [db.id])

  async function loadRows() {
    const { data } = await supabase.from('db_rows').select('*').eq('database_id', db.id).order('created_at')
    setRows(data || [])
  }

  async function saveTitle(v: string) {
    setTitle(v)
    await supabase.from('databases').update({ title: v }).eq('id', db.id)
    setEditingTitle(false)
  }

  async function deleteDatabase() {
    await supabase.from('db_rows').delete().eq('database_id', db.id)
    await supabase.from('databases').delete().eq('id', db.id)
    router.push('/app')
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
    const options = newFieldType === 'select'
      ? newFieldOptions.split(',').map(s => s.trim()).filter(Boolean)
      : undefined
    const field: Field = { id: 'f_' + Date.now(), name: newFieldName.trim(), type: newFieldType, options }
    const newFields = [...(db.fields || []), field]
    await supabase.from('databases').update({ fields: newFields }).eq('id', db.id)
    setDb(d => ({ ...d, fields: newFields }))
    setNewFieldName(''); setNewFieldOptions('Option 1, Option 2'); setAddingField(false)
    showToast('Field added')
  }

  async function deleteField(fieldId: string) {
    const newFields = db.fields.filter(f => f.id !== fieldId)
    await supabase.from('databases').update({ fields: newFields }).eq('id', db.id)
    setDb(d => ({ ...d, fields: newFields }))
  }

  async function renameField(fieldId: string, name: string) {
    const newFields = db.fields.map(f => f.id === fieldId ? { ...f, name } : f)
    await supabase.from('databases').update({ fields: newFields }).eq('id', db.id)
    setDb(d => ({ ...d, fields: newFields }))
    setEditingFieldId(null)
  }

  async function updateFieldOptions(fieldId: string, optStr: string) {
    const options = optStr.split(',').map(s => s.trim()).filter(Boolean)
    const newFields = db.fields.map(f => f.id === fieldId ? { ...f, options } : f)
    await supabase.from('databases').update({ fields: newFields }).eq('id', db.id)
    setDb(d => ({ ...d, fields: newFields }))
  }

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 2000) }

  // Filter + sort
  let displayRows = [...rows]
  if (filter.field && filter.value) {
    displayRows = displayRows.filter(r =>
      String(r.data?.[filter.field] || '').toLowerCase().includes(filter.value.toLowerCase())
    )
  }
  if (sort.field) {
    displayRows.sort((a, b) => {
      const av = String(a.data?.[sort.field] || '')
      const bv = String(b.data?.[sort.field] || '')
      return sort.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
    })
  }

  const selectField = db.fields?.find(f => f.type === 'select')
  const boardGroups = selectField
    ? [...(selectField.options || []), 'Unset'].map(opt => ({
        label: opt,
        rows: displayRows.filter(r => (r.data?.[selectField.id] || 'Unset') === opt)
      }))
    : []

  function CellEditor({ row, field }: { row: Row; field: Field }) {
    const val = row.data?.[field.id]
    const isEditing = editingCell?.rowId === row.id && editingCell?.fieldId === field.id

    if (isEditing) {
      if (field.type === 'select') return (
        <select autoFocus value={editVal}
          onChange={e => setEditVal(e.target.value)}
          onBlur={async () => { await updateCell(row.id, field.id, editVal); setEditingCell(null) }}
          style={cellInputSt}>
          <option value="">—</option>
          {field.options?.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      )
      if (field.type === 'checkbox') return (
        <input type="checkbox" checked={editVal === 'true'}
          onChange={e => setEditVal(String(e.target.checked))}
          onBlur={async () => { await updateCell(row.id, field.id, editVal === 'true'); setEditingCell(null) }}
          autoFocus />
      )
      return (
        <input autoFocus type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
          value={editVal} onChange={e => setEditVal(e.target.value)}
          onBlur={async () => { await updateCell(row.id, field.id, editVal); setEditingCell(null) }}
          onKeyDown={async e => { if (e.key === 'Enter') { await updateCell(row.id, field.id, editVal); setEditingCell(null) } if (e.key === 'Escape') setEditingCell(null) }}
          style={cellInputSt} />
      )
    }

    return (
      <div
        onClick={() => { if (!canEdit) return; setEditingCell({ rowId: row.id, fieldId: field.id }); setEditVal(String(val ?? '')) }}
        style={{ minHeight: '22px', cursor: canEdit ? 'pointer' : 'default', padding: '2px 6px', borderRadius: '4px', fontSize: '13px', transition: 'background 0.1s' }}
        onMouseEnter={e => { if (canEdit) (e.currentTarget as HTMLElement).style.background = 'var(--accent-light)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
      >
        {field.type === 'checkbox'
          ? <input type="checkbox" checked={!!val} readOnly style={{ pointerEvents: 'none' }} />
          : field.type === 'select' && val
            ? <span style={{ background: 'var(--accent-light)', color: 'var(--accent)', padding: '2px 8px', borderRadius: '10px', fontSize: '12px' }}>{val}</span>
            : <span style={{ color: val ? 'var(--text)' : 'var(--muted)' }}>{val || (canEdit ? '—' : '')}</span>
        }
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* HEADER */}
      <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '12px 24px', flexShrink: 0 }}>
        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
          <span style={{ fontSize: '20px' }}>🗄️</span>
          {editingTitle
            ? <input autoFocus value={title}
                onChange={e => setTitle(e.target.value)}
                onBlur={() => saveTitle(title)}
                onKeyDown={e => { if (e.key === 'Enter') saveTitle(title); if (e.key === 'Escape') { setTitle(db.title); setEditingTitle(false) } }}
                style={{ fontFamily: 'var(--font-serif)', fontSize: '1.4rem', fontWeight: 600, border: 'none', borderBottom: '2px solid var(--accent)', background: 'transparent', outline: 'none', color: 'var(--text)', minWidth: '200px' }} />
            : <h2 onClick={() => canEdit && setEditingTitle(true)}
                style={{ fontFamily: 'var(--font-serif)', fontSize: '1.4rem', fontWeight: 600, cursor: canEdit ? 'pointer' : 'default', userSelect: 'none' }}
                title={canEdit ? 'Click to rename' : ''}>{title}</h2>
          }
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px', alignItems: 'center' }}>
            {isOwner && !confirmDelete && (
              <button onClick={() => setConfirmDelete(true)}
                style={{ background: 'none', border: '1px solid var(--border)', padding: '4px 12px', borderRadius: '7px', fontFamily: 'var(--font-sans)', fontSize: '12px', cursor: 'pointer', color: 'var(--muted)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#fde8e8'; (e.currentTarget as HTMLElement).style.color = 'var(--danger)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; (e.currentTarget as HTMLElement).style.color = 'var(--muted)' }}>
                Delete database
              </button>
            )}
            {confirmDelete && (
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: 'var(--danger)' }}>Are you sure?</span>
                <button onClick={deleteDatabase} style={{ background: 'var(--danger)', color: '#fff', border: 'none', padding: '4px 12px', borderRadius: '7px', fontFamily: 'var(--font-sans)', fontSize: '12px', cursor: 'pointer' }}>Delete</button>
                <button onClick={() => setConfirmDelete(false)} style={{ background: 'var(--sidebar)', border: 'none', padding: '4px 12px', borderRadius: '7px', fontFamily: 'var(--font-sans)', fontSize: '12px', cursor: 'pointer', color: 'var(--text)' }}>Cancel</button>
              </div>
            )}
          </div>
        </div>

        {/* Controls row */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
          {db.fields?.length > 0 && <>
            <select value={filter.field} onChange={e => setFilter(f => ({ ...f, field: e.target.value }))} style={ctrlSt}>
              <option value="">Filter…</option>
              {db.fields.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            {filter.field && <input value={filter.value} onChange={e => setFilter(f => ({ ...f, value: e.target.value }))} placeholder="Value…" style={{ ...ctrlSt, width: '100px' }} />}
            <select value={sort.field} onChange={e => setSort(s => ({ ...s, field: e.target.value }))} style={ctrlSt}>
              <option value="">Sort…</option>
              {db.fields.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            {sort.field && (
              <button onClick={() => setSort(s => ({ ...s, dir: s.dir === 'asc' ? 'desc' : 'asc' }))} style={ctrlSt}>
                {sort.dir === 'asc' ? '↑ Asc' : '↓ Desc'}
              </button>
            )}
          </>}
          <div style={{ marginLeft: 'auto', display: 'flex', background: 'var(--sidebar)', borderRadius: '7px', padding: '2px', gap: '2px' }}>
            <ViewBtn active={viewMode === 'list'} onClick={() => setViewMode('list')}>☰ List</ViewBtn>
            <ViewBtn active={viewMode === 'board'} onClick={() => setViewMode('board')}>⊞ Board</ViewBtn>
          </div>
        </div>
      </div>

      {/* CONTENT */}
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>

        {viewMode === 'list' ? (
          <div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                  {db.fields?.map(f => (
                    <th key={f.id} style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 500, color: 'var(--muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>
                      {editingFieldId === f.id
                        ? <input autoFocus defaultValue={f.name}
                            onBlur={e => renameField(f.id, e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') renameField(f.id, (e.target as HTMLInputElement).value); if (e.key === 'Escape') setEditingFieldId(null) }}
                            style={{ border: 'none', borderBottom: '1px solid var(--accent)', background: 'transparent', fontFamily: 'var(--font-sans)', fontSize: '11px', outline: 'none', width: '80px' }} />
                        : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ opacity: 0.6 }}>{fieldIcon(f.type)}</span>
                            <span style={{ cursor: canEdit ? 'pointer' : 'default' }} onClick={() => canEdit && setEditingFieldId(f.id)} title="Click to rename">{f.name}</span>
                            {canEdit && f.type === 'select' && (
                              <button onClick={() => {
                                const val = prompt('Options (comma separated):', f.options?.join(', ') || '')
                                if (val !== null) updateFieldOptions(f.id, val)
                              }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '10px', padding: '0 2px' }} title="Edit options">⚙</button>
                            )}
                            {canEdit && <button onClick={() => deleteField(f.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '10px', opacity: 0, padding: '0 2px' }}
                              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '1' }}
                              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '0' }}
                              title="Delete field">✕</button>}
                          </div>
                        )
                      }
                    </th>
                  ))}
                  <th style={{ width: '32px' }} />
                </tr>
              </thead>
              <tbody>
                {displayRows.map((row, i) => (
                  <tr key={row.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.012)' }}>
                    {db.fields?.map(f => (
                      <td key={f.id} style={{ padding: '2px 4px', verticalAlign: 'middle' }}>
                        <CellEditor row={row} field={f} />
                      </td>
                    ))}
                    <td style={{ padding: '2px 4px', textAlign: 'right' }}>
                      {canEdit && <button onClick={() => deleteRow(row.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '12px', opacity: 0, padding: '2px 4px', borderRadius: '4px' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '1' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '0' }}>✕</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {canEdit && (
              <button onClick={addRow}
                style={{ marginTop: '8px', background: 'none', border: '1px dashed var(--border)', borderRadius: '8px', padding: '7px 16px', cursor: 'pointer', color: 'var(--muted)', fontFamily: 'var(--font-sans)', fontSize: '13px', width: '100%' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--accent-light)'; (e.currentTarget as HTMLElement).style.color = 'var(--accent)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; (e.currentTarget as HTMLElement).style.color = 'var(--muted)' }}>
                + New row
              </button>
            )}
          </div>

        ) : (
          /* BOARD VIEW */
          <div style={{ display: 'flex', gap: '16px', overflowX: 'auto', paddingBottom: '16px', minHeight: '200px', alignItems: 'flex-start' }}>
            {!selectField
              ? <div style={{ color: 'var(--muted)', fontSize: '14px', padding: '20px', background: 'var(--sidebar)', borderRadius: '10px' }}>
                  Add a <strong>Select</strong> field to enable board view.
                </div>
              : boardGroups.map(group => (
                <div key={group.label} style={{ minWidth: '240px', maxWidth: '280px', background: 'var(--sidebar)', borderRadius: '10px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ fontWeight: 500, fontSize: '12px', color: 'var(--muted)', padding: '0 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    <span>{group.label}</span>
                    <span style={{ background: 'var(--border)', borderRadius: '10px', padding: '1px 7px', fontSize: '11px' }}>{group.rows.length}</span>
                  </div>
                  {group.rows.map(row => (
                    <div key={row.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', cursor: 'default' }}>
                      {db.fields?.filter(f => f.id !== selectField.id).map(f => (
                        <div key={f.id} style={{ marginBottom: '6px' }} onClick={() => { if (!canEdit) return; setEditingCell({ rowId: row.id, fieldId: f.id }); setEditVal(String(row.data?.[f.id] ?? '')) }}>
                          <div style={{ fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>{f.name}</div>
                          <CellEditor row={row} field={f} />
                        </div>
                      ))}
                      {canEdit && <button onClick={() => deleteRow(row.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '11px', marginTop: '4px', padding: '0', fontFamily: 'var(--font-sans)' }}>Delete</button>}
                    </div>
                  ))}
                  {canEdit && (
                    <button onClick={async () => {
                      const { data } = await supabase.from('db_rows').insert({
                        database_id: db.id,
                        data: { [selectField.id]: group.label === 'Unset' ? '' : group.label }
                      }).select().single()
                      if (data) setRows(r => [...r, data])
                    }} style={{ background: 'none', border: '1px dashed var(--border)', borderRadius: '7px', padding: '6px', cursor: 'pointer', color: 'var(--muted)', fontSize: '12px', fontFamily: 'var(--font-sans)' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--accent-light)'; (e.currentTarget as HTMLElement).style.color = 'var(--accent)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; (e.currentTarget as HTMLElement).style.color = 'var(--muted)' }}>
                      + Add card
                    </button>
                  )}
                </div>
              ))
            }
          </div>
        )}

        {/* ADD FIELD */}
        {canEdit && (
          <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
            {!addingField
              ? <button onClick={() => setAddingField(true)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontFamily: 'var(--font-sans)', fontSize: '13px', padding: '4px 0', display: 'flex', alignItems: 'center', gap: '4px' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--accent)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--muted)' }}>
                  + Add field
                </button>
              : (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', flexWrap: 'wrap', background: 'var(--sidebar)', padding: '12px', borderRadius: '10px' }}>
                  <input value={newFieldName} onChange={e => setNewFieldName(e.target.value)} placeholder="Field name" autoFocus
                    style={{ padding: '7px 10px', border: '1px solid var(--border)', borderRadius: '7px', fontFamily: 'var(--font-sans)', fontSize: '13px', background: 'var(--bg)', color: 'var(--text)', outline: 'none', width: '160px' }} />
                  <select value={newFieldType} onChange={e => setNewFieldType(e.target.value as Field['type'])} style={ctrlSt}>
                    <option value="text">Text</option>
                    <option value="number">Number</option>
                    <option value="select">Select</option>
                    <option value="date">Date</option>
                    <option value="checkbox">Checkbox</option>
                  </select>
                  {newFieldType === 'select' && (
                    <input value={newFieldOptions} onChange={e => setNewFieldOptions(e.target.value)} placeholder="Option 1, Option 2"
                      style={{ padding: '7px 10px', border: '1px solid var(--border)', borderRadius: '7px', fontFamily: 'var(--font-sans)', fontSize: '13px', background: 'var(--bg)', color: 'var(--text)', outline: 'none', width: '200px' }} />
                  )}
                  <button onClick={addField} style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '7px 14px', borderRadius: '7px', fontFamily: 'var(--font-sans)', fontSize: '13px', cursor: 'pointer', fontWeight: 500 }}>Add</button>
                  <button onClick={() => setAddingField(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '13px', fontFamily: 'var(--font-sans)', padding: '7px 4px' }}>Cancel</button>
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

function fieldIcon(type: string) {
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
const cellInputSt: React.CSSProperties = { width: '100%', border: '1px solid var(--accent)', borderRadius: '4px', padding: '2px 6px', fontFamily: 'var(--font-sans)', fontSize: '13px', background: 'var(--surface)', outline: 'none', color: 'var(--text)' }

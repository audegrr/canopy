'use client'
import { useState, useEffect } from 'react'
import { NodeViewWrapper } from '@tiptap/react'
import { createClient } from '@/lib/supabase/client'

type Field = { id: string; name: string; type: string; options?: any[] }
type Record_ = { id: string; data: Record<string, any> }

type Props = {
  node: any
  updateAttributes: (attrs: any) => void
  deleteNode: () => void
  selected: boolean
}

export default function DatabaseBlock({ node, updateAttributes, deleteNode, selected }: Props) {
  const [page, setPage] = useState<any>(null)
  const [fields, setFields] = useState<Field[]>([])
  const [records, setRecords] = useState<Record_[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'table' | 'board'>(node.attrs.view || 'table')
  const [collapsed, setCollapsed] = useState(node.attrs.collapsed || false)
  const [editingCell, setEditingCell] = useState<{ recId: string; fieldId: string } | null>(null)
  const [editVal, setEditVal] = useState('')
  const supabase = createClient()

  useEffect(() => {
    if (!node.attrs.pageId) { setLoading(false); return }
    Promise.all([
      supabase.from('pages').select('id, title, icon').eq('id', node.attrs.pageId).single(),
      supabase.from('db_fields').select('*').eq('page_id', node.attrs.pageId).order('position'),
      supabase.from('db_records').select('*').eq('page_id', node.attrs.pageId).order('position'),
    ]).then(([{ data: p }, { data: f }, { data: r }]) => {
      setPage(p)
      setFields(f || [])
      setRecords(r || [])
      setLoading(false)
    })
  }, [node.attrs.pageId])

  function setViewMode(v: 'table' | 'board') {
    setView(v)
    updateAttributes({ view: v })
  }

  function toggleCollapse() {
    setCollapsed((o: boolean) => {
      updateAttributes({ collapsed: !o })
      return !o
    })
  }

  async function addRecord() {
    const { data } = await supabase.from('db_records').insert({
      page_id: node.attrs.pageId, data: {}, position: records.length
    }).select().single()
    if (data) setRecords(r => [...r, data])
  }

  async function updateCell(recId: string, fieldId: string, value: any) {
    const rec = records.find(r => r.id === recId)
    if (!rec) return
    const newData = { ...rec.data, [fieldId]: value }
    await supabase.from('db_records').update({ data: newData }).eq('id', recId)
    setRecords(r => r.map(x => x.id === recId ? { ...x, data: newData } : x))
  }

  async function deleteRecord(id: string) {
    await supabase.from('db_records').delete().eq('id', id)
    setRecords(r => r.filter(x => x.id !== id))
  }

  if (loading) return (
    <NodeViewWrapper>
      <div style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '16px', margin: '8px 0', color: 'var(--text-tertiary)', fontSize: '13px' }}>
        Loading database…
      </div>
    </NodeViewWrapper>
  )

  if (!page) return (
    <NodeViewWrapper>
      <div style={{ border: '1px dashed var(--border)', borderRadius: '8px', padding: '12px 16px', margin: '8px 0', color: 'var(--text-tertiary)', fontSize: '13px', display: 'flex', gap: '8px', alignItems: 'center' }}>
        <span>🗄️</span> Database not found
        <button onClick={deleteNode} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: '12px' }}>✕</button>
      </div>
    </NodeViewWrapper>
  )

  const selectField = fields.find(f => f.type === 'select')
  const boardGroups = selectField
    ? [...(selectField.options || []).map((o: any) => o.label || o), 'No status'].map(g => ({
        label: g,
        color: (selectField.options || []).find((o: any) => (o.label || o) === g)?.color,
        records: records.filter(r => (r.data[selectField.id] || 'No status') === g)
      }))
    : []

  return (
    <NodeViewWrapper>
      <div
        style={{
          border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: '8px',
          margin: '8px 0',
          overflow: 'hidden',
          background: 'var(--surface)',
          boxShadow: selected ? '0 0 0 2px var(--accent-light)' : 'none',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: 'var(--sidebar-bg)', borderBottom: collapsed ? 'none' : '1px solid var(--border)' }}>
          <span onClick={toggleCollapse} style={{ fontSize: '10px', color: 'var(--text-tertiary)', cursor: 'pointer', transition: 'transform 0.15s', display: 'inline-block', transform: collapsed ? 'none' : 'rotate(90deg)' }}>▸</span>
          <span style={{ fontSize: '15px' }}>{page.icon || '🗄️'}</span>
          <span style={{ flex: 1, fontSize: '13.5px', fontWeight: 600, color: 'var(--text)' }}>{page.title}</span>
          {!collapsed && (
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              {/* View toggle */}
              <div style={{ display: 'flex', background: 'var(--border)', borderRadius: '5px', padding: '2px', gap: '2px' }}>
                {(['table', 'board'] as const).map(v => (
                  <button key={v} onClick={() => setViewMode(v)}
                    style={{ background: view === v ? 'var(--surface)' : 'none', border: 'none', padding: '3px 8px', borderRadius: '3px', fontSize: '11px', cursor: 'pointer', color: view === v ? 'var(--text)' : 'var(--text-tertiary)', fontFamily: 'var(--font-sans)', fontWeight: view === v ? 500 : 400 }}>
                    {v === 'table' ? '☰' : '⊞'}
                  </button>
                ))}
              </div>
              <button onClick={() => window.location.href = `/app/page/${node.attrs.pageId}`}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: '11px', padding: '3px 8px', borderRadius: '4px', fontFamily: 'var(--font-sans)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--accent)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-tertiary)' }}>
                ↗ Full view
              </button>
            </div>
          )}
          {collapsed && <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{records.length} rows</span>}
        </div>

        {/* Content */}
        {!collapsed && (
          <div style={{ overflow: 'auto', maxHeight: '400px' }}>
            {view === 'table' ? (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--sidebar-bg)' }}>
                    {fields.map(f => (
                      <th key={f.id} style={{ textAlign: 'left', padding: '6px 10px', fontWeight: 500, fontSize: '11px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', borderRight: '1px solid var(--border)' }}>
                        {f.name}
                      </th>
                    ))}
                    <th style={{ width: '32px' }} />
                  </tr>
                </thead>
                <tbody>
                  {records.map((rec, i) => (
                    <tr key={rec.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.01)' }}>
                      {fields.map(f => (
                        <td key={f.id} style={{ padding: '4px 10px', borderRight: '1px solid var(--border)', verticalAlign: 'middle' }}
                          onClick={() => { setEditingCell({ recId: rec.id, fieldId: f.id }); setEditVal(String(rec.data?.[f.id] ?? '')) }}>
                          {editingCell?.recId === rec.id && editingCell?.fieldId === f.id ? (
                            f.type === 'select' ? (
                              <select autoFocus value={editVal} onChange={e => setEditVal(e.target.value)}
                                onBlur={() => { updateCell(rec.id, f.id, editVal); setEditingCell(null) }}
                                style={{ width: '100%', border: 'none', outline: 'none', fontSize: '13px', fontFamily: 'var(--font-sans)', background: 'transparent' }}>
                                <option value="">—</option>
                                {(f.options || []).map((o: any) => <option key={o.label || o} value={o.label || o}>{o.label || o}</option>)}
                              </select>
                            ) : f.type === 'checkbox' ? (
                              <input type="checkbox" autoFocus checked={editVal === 'true' || editVal === true as any}
                                onChange={e => { updateCell(rec.id, f.id, e.target.checked); setEditingCell(null) }} />
                            ) : (
                              <input autoFocus value={editVal} onChange={e => setEditVal(e.target.value)}
                                onBlur={() => { updateCell(rec.id, f.id, editVal); setEditingCell(null) }}
                                onKeyDown={e => { if (e.key === 'Enter') { updateCell(rec.id, f.id, editVal); setEditingCell(null) } }}
                                style={{ width: '100%', border: 'none', outline: 'none', fontSize: '13px', fontFamily: 'var(--font-sans)', background: 'transparent' }} />
                            )
                          ) : (
                            <CellDisplay value={rec.data?.[f.id]} field={f} />
                          )}
                        </td>
                      ))}
                      <td style={{ padding: '2px 4px', textAlign: 'right' }}>
                        <button onClick={() => deleteRecord(rec.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: '11px', opacity: 0, padding: '2px 4px' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '1' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '0' }}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              // Board view
              <div style={{ display: 'flex', gap: '10px', padding: '12px', overflowX: 'auto', alignItems: 'flex-start' }}>
                {!selectField ? (
                  <div style={{ color: 'var(--text-secondary)', fontSize: '13px', padding: '8px' }}>Add a Select field to use board view.</div>
                ) : boardGroups.map(group => (
                  <div key={group.label} style={{ minWidth: '180px', background: 'var(--sidebar-bg)', borderRadius: '6px', padding: '8px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      {group.color && <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: group.color, flexShrink: 0 }} />}
                      {group.label} <span style={{ background: 'var(--border)', borderRadius: '8px', padding: '1px 5px', fontSize: '10px' }}>{group.records.length}</span>
                    </div>
                    {group.records.map(rec => (
                      <div key={rec.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '5px', padding: '8px', marginBottom: '6px', fontSize: '12px' }}>
                        {fields.filter(f => f.id !== selectField.id).slice(0, 3).map(f => (
                          <div key={f.id} style={{ marginBottom: '3px' }}>
                            <span style={{ color: 'var(--text-tertiary)', fontSize: '10px' }}>{f.name}: </span>
                            <CellDisplay value={rec.data?.[f.id]} field={f} />
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {/* Add row */}
            <button onClick={addRecord}
              style={{ width: '100%', padding: '6px 10px', background: 'none', border: 'none', borderTop: '1px solid var(--border)', cursor: 'pointer', fontSize: '12px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-sans)', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '4px' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-bg)'; (e.currentTarget as HTMLElement).style.color = 'var(--accent)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; (e.currentTarget as HTMLElement).style.color = 'var(--text-tertiary)' }}>
              + New row
            </button>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  )
}

function CellDisplay({ value, field }: { value: any; field: Field }) {
  if (value === undefined || value === null || value === '') return <span style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>—</span>
  if (field.type === 'checkbox') return <span style={{ fontSize: '13px' }}>{value ? '✅' : '⬜'}</span>
  if (field.type === 'select' && value) {
    const opt = (field.options || []).find((o: any) => (o.label || o) === value)
    const color = opt?.color || '#e9e9e7'
    return <span style={{ background: color + '40', color: '#37352f', padding: '1px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 500 }}>{value}</span>
  }
  return <span style={{ fontSize: '13px', color: 'var(--text)' }}>{String(value)}</span>
}

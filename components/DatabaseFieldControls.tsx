'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { createClient } from '@/lib/supabase/client'
import type { DbField } from '@/lib/types'
import { Icon } from './Icons'

const FIELD_TYPE_ICON: Record<string, string> = { text: 'field-text', number: 'field-number', currency: 'currency', select: 'tag', multiselect: 'tags', date: 'calendar', checkbox: 'check-square', relation: 'relation', rollup: 'sigma', url: 'link', email: 'mail', phone: 'phone' }
const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'CAD', 'AUD', 'JPY', 'CNY']
const SELECT_COLORS = ['#fde68a','#bbf7d0','#bfdbfe','#fecaca','#e9d5ff','#fed7aa','#cffafe','#fbcfe8','#d1fae5','#ddd6fe']
const ctrlSt: React.CSSProperties = { padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 5, fontFamily: 'var(--font-sans)', fontSize: 12, background: 'var(--sidebar-bg)', color: 'var(--text)', outline: 'none', cursor: 'pointer' }

const FIELD_TYPES_LIST: DbField['type'][] = ['text','number','select','multiselect','date','checkbox','relation','rollup','url','email','phone']

type SelectOption = string | { label: string; color?: string }
type SelectEditorProps = {
  field: DbField
  currentValue: string
  onSelect: (value: string) => void
  onAddOption: (label: string, color: string) => void
  onDeleteOption: (label: string) => void
  onUpdateOptionColor: (label: string, color: string) => void
  onClose: () => void
  cellRect?: DOMRect | null
}

export function SelectEditor({ field, currentValue, onSelect, onAddOption, onDeleteOption, onUpdateOptionColor, onClose, cellRect }: SelectEditorProps) {
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
        {(field.options as SelectOption[] || []).map(opt => {
          const label = typeof opt === 'string' ? opt : opt.label
          const color = typeof opt === 'string' ? '#e9e9e7' : opt.color || '#e9e9e7'
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

export function FieldMenu({ field, onRename, onChangeType, onDelete, onLinkRelation, onSetCurrency, onToggleHidden }: { field: DbField; onRename: () => void; onChangeType: (t: DbField['type']) => void; onDelete: () => void; onLinkRelation: (pageId: string, colId?: string) => void; onSetCurrency: (code: string) => void; onToggleHidden: () => void }) {
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
      {open && menuPos && createPortal(
        <>
          {/* Portaled to <body> — a table <th> establishes its own stacking
              context (position + z-index from .db-table th), which would trap
              a position:fixed child behind later sibling columns/cells no
              matter how high its own z-index is set. */}
          <div style={{ position: 'fixed', inset: 0, zIndex: 499 }} onClick={() => setOpen(false)} />
          <div style={{ position: 'fixed', left: menuPos.x, top: menuPos.y, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 7, padding: 5, boxShadow: 'var(--shadow-lg)', zIndex: 500, minWidth: 160 }}>
            <MItem onClick={() => { onRename(); setOpen(false) }}><IconLabel icon="edit">Rename</IconLabel></MItem>
            <MItem onClick={() => setShowTypes(o => !o)} extra="›"><IconLabel icon="refresh">Change type</IconLabel></MItem>
            {showTypes && (
              <div style={{ paddingLeft: 8, borderTop: '1px solid var(--border)', marginTop: 2, paddingTop: 2, maxHeight: 200, overflowY: 'auto' }}>
                {FIELD_TYPES_LIST.map(t => (
                  <MItem key={t} onClick={() => {
                    onChangeType(t)
                    if (t !== 'relation') setOpen(false)
                    else setShowTypes(false) // Stay open to pick relation table
                  }} active={t === field.type}>
                    <IconLabel icon={FIELD_TYPE_ICON[t]}>{t.charAt(0).toUpperCase() + t.slice(1)}</IconLabel>
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
            {field.type === 'currency' && !showTypes && (
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 4, marginTop: 2, padding: '4px 8px 0' }}>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4, fontWeight: 500 }}>Currency</div>
                <select value={field.options?.[0] || 'EUR'} onChange={e => onSetCurrency(e.target.value)}
                  onClick={e => e.stopPropagation()}
                  style={{ width: '100%', padding: '4px 6px', border: '1px solid var(--border)', borderRadius: 5, fontFamily: 'var(--font-sans)', fontSize: 12, background: 'var(--sidebar-bg)', color: 'var(--text)', outline: 'none', cursor: 'pointer' }}>
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}
            <MItem onClick={() => { onToggleHidden(); setOpen(false) }}>
              <IconLabel icon={field.hidden_from_viewers ? 'eye' : 'eye-off'}>{field.hidden_from_viewers ? 'Show to viewers' : 'Hide from viewers'}</IconLabel>
            </MItem>
            <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
            <MItem onClick={() => { onDelete(); setOpen(false) }} danger><IconLabel icon="trash">Delete field</IconLabel></MItem>
          </div>
        </>,
        document.body
      )}
    </div>
  )
}

function MItem({ onClick, children, extra, active, danger }: { onClick: () => void; children: ReactNode; extra?: ReactNode; active?: boolean; danger?: boolean }) {
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

function IconLabel({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      <Icon name={icon} size={13} />
      {children}
    </span>
  )
}

export function RelationPagePicker({ value, onChange }: { value: string; onChange: (pageId: string) => void }) {
  const [pages, setPages] = useState<{id: string; title: string; icon: string}[]>([])
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    supabase.from('pages').select('id, title, icon').eq('is_database', true).order('title')
      .then(({ data }) => setPages(data || []))
  }, [supabase])

  return (
    <div style={{ padding: '4px 8px' }} onClick={e => e.stopPropagation()}>
      <select value={value} onChange={e => onChange(e.target.value)} style={{ ...ctrlSt, width: '100%' }}>
        <option value="">— Select a database</option>
        {pages.map(p => <option key={p.id} value={p.id}>{p.icon} {p.title}</option>)}
      </select>
    </div>
  )
}

'use client'

import type { Page } from '@/lib/types'
import { Icon } from './Icons'

type Props = {
  open: boolean; pages: Page[]; loading: boolean
  onToggle: () => void; onRestore: (id: string) => void
  onDeleteRequest: (id: string) => void; onEmptyRequest: () => void
}

export default function TrashPanel({ open, pages, loading, onToggle, onRestore, onDeleteRequest, onEmptyRequest }: Props) {
  return <div style={{ borderTop: '1px solid var(--border)', flexShrink: 0 }}>
    <button type="button" aria-expanded={open} onClick={onToggle} style={toggleStyle}
      onMouseEnter={event => { event.currentTarget.style.background = 'var(--side-hover)' }}
      onMouseLeave={event => { event.currentTarget.style.background = 'none' }}>
      <Icon name="trash" size={15} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1, textAlign: 'left' }}>Trash</span>
      {pages.length > 0 && <span style={{ fontSize: 12 }}>{pages.length}</span>}
      <span style={{ transition: 'transform 0.15s', transform: open ? 'rotate(90deg)' : 'none', display: 'flex' }}><Icon name="chev-right" size={12} /></span>
    </button>
    {open && <div style={contentStyle}>
      {loading ? <div style={statusStyle}>Loading…</div> : pages.length === 0 ? <div style={{ ...statusStyle, textAlign: 'center' }}>Trash is empty · items expire after 30 days</div> : <>
        <div style={{ padding: '6px 14px', display: 'flex', justifyContent: 'flex-end' }}><button type="button" onClick={onEmptyRequest} style={emptyStyle}>Empty trash</button></div>
        {pages.map(page => <div key={page.id} className="trash-item" style={rowStyle}
          onMouseEnter={event => { event.currentTarget.style.background = 'var(--side-hover)' }}
          onMouseLeave={event => { event.currentTarget.style.background = 'none' }}>
          <span style={{ flexShrink: 0, fontSize: 14 }}>{page.icon || (page.is_database ? '🗄️' : '📄')}</span>
          <span style={titleStyle}>{page.title || 'Untitled'}</span>
          <span className="t-acts" style={{ display: 'flex', gap: 1 }}>
            <button type="button" aria-label={`Restore ${page.title || 'Untitled'}`} onClick={() => onRestore(page.id)} style={actionStyle}><Icon name="restore" size={14} /></button>
            <button type="button" aria-label={`Permanently delete ${page.title || 'Untitled'}`} onClick={() => onDeleteRequest(page.id)} style={{ ...actionStyle, color: 'var(--red)' }}><Icon name="trash" size={14} /></button>
          </span>
        </div>)}
      </>}
    </div>}
  </div>
}

const toggleStyle: React.CSSProperties = { width: 'calc(100% - 8px)', border: 0, background: 'none', display: 'flex', alignItems: 'center', gap: 6, padding: '5px 14px', cursor: 'pointer', color: 'var(--text-secondary)', borderRadius: 5, margin: '1px 4px', fontFamily: 'var(--font-sans)', fontSize: 14 }
const contentStyle: React.CSSProperties = { background: 'var(--sidebar-bg)', borderBottom: '1px solid var(--border)', maxHeight: 280, overflowY: 'auto' }
const statusStyle: React.CSSProperties = { padding: '16px 14px', fontSize: 12, color: 'var(--text-tertiary)' }
const emptyStyle: React.CSSProperties = { border: 0, background: 'none', fontSize: 11, color: 'var(--text-tertiary)', cursor: 'pointer', padding: '2px 6px' }
const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px 5px 14px', fontSize: 13, color: 'var(--side-text)', position: 'relative' }
const titleStyle: React.CSSProperties = { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
const actionStyle: React.CSSProperties = { border: 0, background: 'none', cursor: 'pointer', padding: '3px 6px', borderRadius: 5, color: 'var(--side-text-2)', display: 'flex', alignItems: 'center' }

'use client'

import { useState } from 'react'
import type { TiptapContent } from '@/lib/types'
import { tiptapToPlainText } from '@/lib/tiptap-document'

export type PageSnapshot = { id: string; title: string; content: TiptapContent; created_at: string }

type Props = {
  snapshots: PageSnapshot[]
  currentContent: TiptapContent
  loading: boolean
  mobile: boolean
  mobileStyle: React.CSSProperties
  onClose: () => void
  onRestore: (snapshot: PageSnapshot) => void
}

export default function VersionHistoryPanel({ snapshots, currentContent, loading, mobile, mobileStyle, onClose, onRestore }: Props) {
  const [previewId, setPreviewId] = useState<string | null>(null)
  return <div style={mobile ? mobileStyle : panelStyle}>
    {mobile && <div style={backdropStyle} onClick={onClose} />}
    <div style={headerStyle}>
      <span style={{ fontWeight: 600, fontSize: 14 }}>Version history</span>
      <button aria-label="Close version history" onClick={onClose} style={closeStyle}>✕</button>
    </div>
    <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
      {loading && <div style={emptyStyle}>Loading…</div>}
      {!loading && snapshots.length === 0 && <div style={emptyStyle}>No saved versions yet. Versions are saved automatically every 10 edits.</div>}
      {snapshots.map(snapshot => <div key={snapshot.id} style={itemStyle}>
        <div style={titleStyle}>{snapshot.title || 'Untitled'}</div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{new Date(snapshot.created_at).toLocaleString()}</div>
        {previewId === snapshot.id && <div style={{ marginTop: 5, display: 'grid', gap: 6, fontSize: 11 }}>
          <div><strong>Saved version</strong><div style={previewStyle}>{tiptapToPlainText(snapshot.content)}</div></div>
          <div><strong>Current version</strong><div style={previewStyle}>{tiptapToPlainText(currentContent)}</div></div>
        </div>}
        <div style={{ display: 'flex', gap: 5, marginTop: 4 }}>
          <button onClick={() => setPreviewId(id => id === snapshot.id ? null : snapshot.id)} style={compareStyle}>{previewId === snapshot.id ? 'Hide comparison' : 'Compare'}</button>
          <button onClick={() => onRestore(snapshot)} style={restoreStyle}>Restore this version</button>
        </div>
      </div>)}
    </div>
  </div>
}

const panelStyle: React.CSSProperties = { width: 280, background: 'var(--surface)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flexShrink: 0 }
const backdropStyle: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 199 }
const headerStyle: React.CSSProperties = { padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }
const closeStyle: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 16 }
const emptyStyle: React.CSSProperties = { padding: '20px 16px', color: 'var(--text-tertiary)', fontSize: 13 }
const itemStyle: React.CSSProperties = { padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4 }
const titleStyle: React.CSSProperties = { fontSize: 13, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
const previewStyle: React.CSSProperties = { marginTop: 2, maxHeight: 86, overflow: 'auto', whiteSpace: 'pre-wrap', border: '1px solid var(--border)', borderRadius: 4, padding: 6, color: 'var(--text-secondary)', background: 'var(--sidebar-bg)', lineHeight: 1.4 }
const compareStyle: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 5, padding: '4px 8px', fontSize: 11, cursor: 'pointer', color: 'var(--text-secondary)', fontFamily: 'var(--font-sans)' }
const restoreStyle: React.CSSProperties = { background: 'var(--accent-light)', border: 'none', borderRadius: 5, padding: '4px 10px', fontSize: 11, cursor: 'pointer', color: 'var(--accent)', fontFamily: 'var(--font-sans)', fontWeight: 500 }

'use client'

import type { RefObject } from 'react'

export type PageComment = { id: string; body: string; created_at: string; user_id: string; anchor_id?: string | null; profile?: { full_name: string | null; email: string } | null }

type Props = {
  comments: PageComment[]; userId: string; value: string; loading: boolean
  pendingAnchorText: string; mobile: boolean; mobileStyle: React.CSSProperties
  inputRef: RefObject<HTMLTextAreaElement | null>
  onValueChange: (value: string) => void; onSubmit: () => void; onDelete: (id: string) => void
  onClearAnchor: () => void; onClose: () => void
}

export default function CommentsPanel(props: Props) {
  const { comments, userId, value, loading, pendingAnchorText, mobile, mobileStyle, inputRef, onValueChange, onSubmit, onDelete, onClearAnchor, onClose } = props
  return <div style={mobile ? mobileStyle : panelStyle}>
    {mobile && <div style={backdropStyle} onClick={onClose} />}
    <div style={headerStyle}><span style={{ fontWeight: 600, fontSize: 13 }}>Comments</span><button aria-label="Close comments" onClick={onClose} style={closeStyle}>✕</button></div>
    <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
      {comments.length === 0 && <div style={emptyStyle}>No comments yet. Be the first!</div>}
      {comments.map(comment => {
        const name = comment.profile?.full_name || comment.profile?.email || 'Someone'
        return <div key={comment.id} style={commentStyle}>
          {comment.anchor_id && <button type="button" onClick={() => focusAnchor(comment.anchor_id!)} style={anchorStyle}>📌 <span style={ellipsisStyle}>Anchored text</span></button>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={avatarStyle}>{name[0]?.toUpperCase()}</div>
            <div style={{ flex: 1, minWidth: 0 }}><div style={nameStyle}>{name}</div><div style={dateStyle}>{new Date(comment.created_at).toLocaleString()}</div></div>
            {comment.user_id === userId && <button aria-label="Delete comment" onClick={() => onDelete(comment.id)} style={deleteStyle}>✕</button>}
          </div>
          <div style={bodyStyle}>{comment.body}</div>
        </div>
      })}
    </div>
    <div style={composerStyle}>
      {pendingAnchorText && <div style={pendingStyle}><span>📌</span><span style={{ fontStyle: 'italic', overflow: 'hidden', flex: 1 }}>“{pendingAnchorText}”</span><button aria-label="Remove comment anchor" onClick={onClearAnchor} style={closeStyle}>✕</button></div>}
      <textarea ref={inputRef} value={value} onChange={event => onValueChange(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) onSubmit() }} placeholder="Add a comment… (⌘↵ to send)" rows={3} style={textareaStyle} />
      <button onClick={onSubmit} disabled={!value.trim() || loading} style={{ ...submitStyle, background: value.trim() ? 'var(--accent)' : 'var(--text-tertiary)', cursor: value.trim() ? 'pointer' : 'not-allowed' }}>{loading ? 'Sending…' : 'Comment'}</button>
    </div>
  </div>
}

function focusAnchor(id: string) { const element = document.querySelector(`mark[data-comment-id="${CSS.escape(id)}"]`) as HTMLElement | null; element?.scrollIntoView({ behavior: 'smooth', block: 'center' }); element?.classList.add('comment-anchor-flash'); setTimeout(() => element?.classList.remove('comment-anchor-flash'), 1200) }
const panelStyle: React.CSSProperties = { width: 300, background: 'var(--surface)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flexShrink: 0 }
const backdropStyle: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 199 }
const headerStyle: React.CSSProperties = { padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }
const closeStyle: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 16 }
const emptyStyle: React.CSSProperties = { padding: '20px 16px', fontSize: 12, color: 'var(--text-tertiary)' }
const commentStyle: React.CSSProperties = { padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }
const anchorStyle: React.CSSProperties = { border: 0, padding: 0, background: 'none', display: 'flex', gap: 4, fontSize: 11, color: 'var(--accent)', cursor: 'pointer', fontStyle: 'italic', overflow: 'hidden' }
const ellipsisStyle: React.CSSProperties = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
const avatarStyle: React.CSSProperties = { width: 26, height: 26, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0 }
const nameStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
const dateStyle: React.CSSProperties = { fontSize: 11, color: 'var(--text-tertiary)' }
const deleteStyle: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 13, padding: '2px 4px' }
const bodyStyle: React.CSSProperties = { fontSize: 13, color: 'var(--text)', lineHeight: 1.5, paddingLeft: 34, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }
const composerStyle: React.CSSProperties = { padding: '12px 16px', borderTop: '1px solid var(--border)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }
const pendingStyle: React.CSSProperties = { fontSize: 12, color: 'var(--text-secondary)', background: 'var(--sidebar-bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 8px', display: 'flex', gap: 6, alignItems: 'flex-start' }
const textareaStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontFamily: 'var(--font-sans)', fontSize: 13, resize: 'none', outline: 'none', background: 'var(--sidebar-bg)', color: 'var(--text)', lineHeight: 1.4, boxSizing: 'border-box' }
const submitStyle: React.CSSProperties = { color: '#fff', border: 'none', borderRadius: 6, padding: 7, fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 500 }

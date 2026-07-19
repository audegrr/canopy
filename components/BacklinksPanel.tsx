'use client'

export type Backlink = { id: string; title: string; icon: string }

type Props = {
  backlinks: Backlink[]
  loaded: boolean
  mobile: boolean
  mobileStyle: React.CSSProperties
  onClose: () => void
  onNavigate: (pageId: string) => void
}

export default function BacklinksPanel({ backlinks, loaded, mobile, mobileStyle, onClose, onNavigate }: Props) {
  return <div style={mobile ? mobileStyle : panelStyle}>
    {mobile && <div style={backdropStyle} onClick={onClose} />}
    <div style={headerStyle}>
      <span style={{ fontWeight: 600, fontSize: 13 }}>Backlinks</span>
      <button aria-label="Close backlinks" onClick={onClose} style={closeStyle}>✕</button>
    </div>
    <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
      {!loaded && <div style={{ padding: 16, fontSize: 12, color: 'var(--text-tertiary)' }}>Loading…</div>}
      {loaded && backlinks.length === 0 && <div style={emptyStyle}>
        No pages link here yet.<br />
        <span style={{ fontSize: 11 }}>Embed this page in another page using the <kbd style={kbdStyle}>/</kbd> menu to create a backlink.</span>
      </div>}
      {backlinks.map(backlink => <button type="button" key={backlink.id} onClick={() => onNavigate(backlink.id)} style={rowStyle}
        onMouseEnter={event => { event.currentTarget.style.background = 'var(--sidebar-hover)' }}
        onMouseLeave={event => { event.currentTarget.style.background = 'none' }}>
        <span style={{ fontSize: 16, flexShrink: 0 }}>{backlink.icon || '📄'}</span>
        <span style={titleStyle}>{backlink.title || 'Untitled'}</span>
      </button>)}
    </div>
  </div>
}

const panelStyle: React.CSSProperties = { width: 260, background: 'var(--surface)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flexShrink: 0 }
const backdropStyle: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 199 }
const headerStyle: React.CSSProperties = { padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }
const closeStyle: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 16 }
const emptyStyle: React.CSSProperties = { padding: '20px 16px', fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.5 }
const kbdStyle: React.CSSProperties = { background: 'var(--sidebar-bg)', border: '1px solid var(--border)', borderRadius: 3, padding: '1px 4px' }
const rowStyle: React.CSSProperties = { border: 0, width: '100%', background: 'none', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', cursor: 'pointer', fontFamily: 'var(--font-sans)', textAlign: 'left' }
const titleStyle: React.CSSProperties = { fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }

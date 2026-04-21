'use client'
import { useState, useEffect } from 'react'
import { NodeViewWrapper } from '@tiptap/react'
import { createClient } from '@/lib/supabase/client'

type Props = {
  node: any
  updateAttributes: (attrs: any) => void
  deleteNode: () => void
  selected: boolean
}

export default function SubpageBlock({ node, updateAttributes, deleteNode, selected }: Props) {
  const [expanded, setExpanded] = useState(node.attrs.expanded ?? true)
  const [page, setPage] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    if (!node.attrs.pageId) { setLoading(false); return }
    supabase.from('pages').select('id, title, icon, content').eq('id', node.attrs.pageId).single()
      .then(({ data }) => { setPage(data); setLoading(false) })
  }, [node.attrs.pageId])

  function toggle() {
    const next = !expanded
    setExpanded(next)
    updateAttributes({ expanded: next })
  }

  function openPage() {
    window.location.href = `/app/page/${node.attrs.pageId}`
  }

  if (loading) return (
    <NodeViewWrapper>
      <div style={{ border: '1px solid var(--border)', borderRadius: '6px', padding: '10px 14px', margin: '4px 0', color: 'var(--text-tertiary)', fontSize: '13px' }}>
        Loading…
      </div>
    </NodeViewWrapper>
  )

  if (!page) return (
    <NodeViewWrapper>
      <div style={{ border: '1px dashed var(--border)', borderRadius: '6px', padding: '10px 14px', margin: '4px 0', color: 'var(--text-tertiary)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span>📄</span>
        <span>Page not found</span>
        <button onClick={deleteNode} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: '12px' }}>✕</button>
      </div>
    </NodeViewWrapper>
  )

  return (
    <NodeViewWrapper>
      <div
        style={{
          border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: '6px',
          margin: '6px 0',
          overflow: 'hidden',
          background: 'var(--surface)',
        }}
      >
        {/* Header */}
        <div
          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'var(--sidebar-bg)', cursor: 'pointer', userSelect: 'none' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-bg)' }}
        >
          <span onClick={toggle} style={{ fontSize: '16px', color: 'var(--text-secondary)', transition: 'transform 0.15s', display: 'inline-block', transform: expanded ? 'rotate(90deg)' : 'none', flexShrink: 0, width: '22px', cursor: 'pointer', textAlign: 'center' }}>▶</span>
          <span style={{ fontSize: '15px', flexShrink: 0 }}>{page.icon || '📄'}</span>
          <span onClick={toggle} style={{ flex: 1, fontSize: '13.5px', fontWeight: 500, color: 'var(--text)' }}>{page.title || 'Untitled'}</span>
          <button
            onClick={openPage}
            title="Open page"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: '11px', padding: '2px 6px', borderRadius: '4px', fontFamily: 'var(--font-sans)', flexShrink: 0 }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = 'var(--accent)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; (e.currentTarget as HTMLElement).style.color = 'var(--text-tertiary)' }}
          >
            ↗ Open
          </button>
        </div>

        {/* Content preview when expanded */}
        {expanded && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', maxHeight: '300px', overflowY: 'auto' }}>
            <SubpagePreview content={page.content} />
          </div>
        )}
      </div>
    </NodeViewWrapper>
  )
}

function SubpagePreview({ content }: { content: any }) {
  if (!content || (!content.content && !Array.isArray(content))) {
    return <p style={{ color: 'var(--text-tertiary)', fontSize: '13px', fontStyle: 'italic' }}>Empty page</p>
  }

  const nodes = Array.isArray(content) ? content : (content.content || [])

  function renderNode(node: any, i: number): React.ReactNode {
    if (!node) return null
    const text = extractText(node)
    switch (node.type) {
      case 'heading':
        const sizes: any = { 1: '1.3rem', 2: '1.1rem', 3: '1rem' }
        return <div key={i} style={{ fontSize: sizes[node.attrs?.level] || '1rem', fontWeight: 600, margin: '6px 0 2px', color: 'var(--text)' }}>{text}</div>
      case 'paragraph':
        return text ? <p key={i} style={{ fontSize: '13px', margin: '2px 0', color: 'var(--text)', lineHeight: 1.6 }}>{text}</p> : null
      case 'bulletList':
        return <ul key={i} style={{ paddingLeft: '16px', margin: '2px 0' }}>{(node.content || []).map((li: any, j: number) => <li key={j} style={{ fontSize: '13px', color: 'var(--text)' }}>{extractText(li)}</li>)}</ul>
      case 'taskList':
        return <div key={i}>{(node.content || []).map((li: any, j: number) => (
          <div key={j} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text)' }}>
            <span style={{ fontSize: '14px' }}>{li.attrs?.checked ? '✅' : '⬜'}</span>
            {extractText(li)}
          </div>
        ))}</div>
      case 'horizontalRule':
        return <hr key={i} style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '6px 0' }} />
      default:
        return text ? <p key={i} style={{ fontSize: '13px', margin: '2px 0', color: 'var(--text)' }}>{text}</p> : null
    }
  }

  function extractText(node: any): string {
    if (!node) return ''
    if (node.text) return node.text
    if (node.content) return node.content.map(extractText).join('')
    return ''
  }

  return (
    <div style={{ pointerEvents: 'none' }}>
      {nodes.slice(0, 8).map(renderNode)}
      {nodes.length > 8 && <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '4px' }}>…and {nodes.length - 8} more blocks</p>}
    </div>
  )
}

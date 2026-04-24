'use client'
import { useState, useEffect } from 'react'
import { NodeViewWrapper } from '@tiptap/react'
import { createClient } from '@/lib/supabase/client'
import dynamic from 'next/dynamic'

const Editor = dynamic(() => import('./Editor'), { ssr: false })

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
    supabase.from('pages').select('*').eq('id', node.attrs.pageId).single()
      .then(({ data }) => { setPage(data); setLoading(false) })
  }, [node.attrs.pageId])

  async function saveContent(content: any) {
    if (!page) return
    await supabase.from('pages').update({ content, updated_at: new Date().toISOString() }).eq('id', page.id)
    setPage((p: any) => ({ ...p, content }))
  }

  function toggle() {
    const next = !expanded
    setExpanded(next)
    updateAttributes({ expanded: next })
  }

  if (loading) return (
    <NodeViewWrapper>
      <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '10px 14px', margin: '4px 0', color: 'var(--text-tertiary)', fontSize: 13 }}>Loading…</div>
    </NodeViewWrapper>
  )

  if (!page) return (
    <NodeViewWrapper>
      <div style={{ border: '1px dashed var(--border)', borderRadius: 6, padding: '10px 14px', margin: '4px 0', color: 'var(--text-tertiary)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>📄</span><span>Page not found</span>
        <button onClick={deleteNode} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}>✕</button>
      </div>
    </NodeViewWrapper>
  )

  return (
    <NodeViewWrapper>
      <div style={{ border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 8, margin: '6px 0', overflow: 'hidden', background: 'var(--surface)', boxShadow: selected ? '0 0 0 2px var(--accent-light)' : 'none' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--sidebar-bg)', cursor: 'pointer', userSelect: 'none' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-bg)' }}>
          <span onClick={toggle} style={{ fontSize: 11, color: 'var(--text-tertiary)', transition: 'transform 0.15s', display: 'inline-block', transform: expanded ? 'rotate(90deg)' : 'none', flexShrink: 0, width: 18, textAlign: 'center', cursor: 'pointer' }}>▶</span>
          <span style={{ fontSize: 16, flexShrink: 0 }}>{page.icon || '📄'}</span>
          <span onClick={toggle} style={{ flex: 1, fontSize: 13.5, fontWeight: 500 }}>{page.title || 'Untitled'}</span>
          <button onClick={() => window.location.href = `/app/page/${page.id}`}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 11, padding: '2px 8px', borderRadius: 4, fontFamily: 'var(--font-sans)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--accent)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-tertiary)' }}>
            ↗ Open
          </button>
        </div>

        {/* Full editor when expanded */}
        {expanded && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
            <Editor
              content={page.content}
              editable={true}
              onUpdate={saveContent}
            />
          </div>
        )}
      </div>
    </NodeViewWrapper>
  )
}

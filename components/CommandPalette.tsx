'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Page = { id: string; title: string; icon: string; is_database: boolean }

type Action = {
  id: string
  label: string
  icon: string
  section: string
  action: () => void
  keywords?: string
}

type Props = {
  workspaceId: string
  onCreatePage: () => void
  onCreateDatabase: () => void
}

export default function CommandPalette({ workspaceId, onCreatePage, onCreateDatabase }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [pages, setPages] = useState<Page[]>([])
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const supabase = createClient()

  // Open on Cmd+K
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(o => !o)
        setQuery('')
        setSelected(0)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
      loadPages()
    }
  }, [open])

  async function loadPages() {
    const { data } = await supabase.from('pages').select('id, title, icon, is_database').eq('workspace_id', workspaceId).order('updated_at', { ascending: false })
    setPages(data || [])
  }

  function navigate(path: string) { router.push(path); setOpen(false) }

  const actions: Action[] = [
    { id: 'new-page', label: 'New page', icon: '📄', section: 'Actions', action: () => { onCreatePage(); setOpen(false) }, keywords: 'create add' },
    { id: 'new-db', label: 'New database', icon: '🗄️', section: 'Actions', action: () => { onCreateDatabase(); setOpen(false) }, keywords: 'create add table' },
    { id: 'home', label: 'Go to home', icon: '🏠', section: 'Actions', action: () => navigate('/app') },
    { id: 'focus', label: 'Toggle focus mode', icon: '🎯', section: 'Actions', action: () => { document.body.classList.toggle('focus-mode'); setOpen(false) }, keywords: 'distraction free zen' },
  ]

  // Filter results
  const q = query.toLowerCase().trim()
  const filteredActions = q ? actions.filter(a => a.label.toLowerCase().includes(q) || (a.keywords || '').includes(q)) : actions
  const filteredPages = pages.filter(p => !q || (p.title || 'Untitled').toLowerCase().includes(q))

  const allResults: { type: 'action' | 'page'; data: Action | Page; section: string }[] = [
    ...filteredActions.map(a => ({ type: 'action' as const, data: a, section: a.section })),
    ...filteredPages.map(p => ({ type: 'page' as const, data: p, section: 'Pages' })),
  ]

  function runResult(r: typeof allResults[0]) {
    if (r.type === 'action') (r.data as Action).action()
    else { const p = r.data as Page; navigate(`/app/page/${p.id}`) }
  }

  // Keyboard navigation
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, allResults.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)) }
    if (e.key === 'Enter' && allResults[selected]) { runResult(allResults[selected]) }
    if (e.key === 'Escape') setOpen(false)
  }

  if (!open) return (
    <div style={{ position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)', zIndex: 10, pointerEvents: 'none' }}>
      {/* Invisible trigger */}
    </div>
  )

  let lastSection = ''

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 4999, backdropFilter: 'blur(2px)' }}
        onClick={() => setOpen(false)} />
      <div className="cmd-palette fade-in">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '0 16px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: '16px', color: 'var(--text-tertiary)' }}>🔍</span>
          <input
            ref={inputRef}
            className="cmd-input"
            style={{ padding: '16px 0' }}
            value={query}
            onChange={e => { setQuery(e.target.value); setSelected(0) }}
            onKeyDown={onKeyDown}
            placeholder="Search pages or type a command…"
          />
          <kbd style={{ background: 'var(--sidebar-bg)', border: '1px solid var(--border)', borderRadius: '4px', padding: '2px 6px', fontSize: '11px', color: 'var(--text-tertiary)', flexShrink: 0, fontFamily: 'var(--font-sans)' }}>ESC</kbd>
        </div>

        <div style={{ maxHeight: '400px', overflowY: 'auto', padding: '6px' }}>
          {allResults.length === 0 && (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '13px' }}>No results for "{query}"</div>
          )}
          {allResults.map((r, i) => {
            const showSection = r.section !== lastSection
            lastSection = r.section
            const isPage = r.type === 'page'
            const p = r.data as any
            return (
              <div key={isPage ? p.id : p.id + i}>
                {showSection && <div className="cmd-section">{r.section}</div>}
                <div className={`cmd-result ${i === selected ? 'selected' : ''}`}
                  onClick={() => runResult(r)}
                  onMouseEnter={() => setSelected(i)}>
                  <div className="cmd-result-icon">
                    {isPage ? (p.icon || (p.is_database ? '🗄️' : '📄')) : p.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13.5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{isPage ? (p.title || 'Untitled') : p.label}</div>
                  </div>
                  {i === selected && <kbd style={{ background: 'var(--sidebar-bg)', border: '1px solid var(--border)', borderRadius: '4px', padding: '2px 6px', fontSize: '11px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-sans)', flexShrink: 0 }}>↵</kbd>}
                </div>
              </div>
            )
          })}
        </div>

        <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: '12px', fontSize: '11px', color: 'var(--text-tertiary)' }}>
          <span>↑↓ Navigate</span>
          <span>↵ Open</span>
          <span>ESC Close</span>
          <span style={{ marginLeft: 'auto' }}>⌘K to open</span>
        </div>
      </div>
    </>
  )
}

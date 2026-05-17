'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

type Result = { id: string; title: string; icon: string; is_database: boolean }

type Props = {
  workspaceId: string
  onNavigate: (pageId: string) => void
  onClose: () => void
}

export default function SearchModal({ workspaceId, onNavigate, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [selected, setSelected] = useState(0)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    if (!query.trim()) { setResults([]); setLoading(false); return }
    setLoading(true)
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('pages')
        .select('id, title, icon, is_database')
        .eq('workspace_id', workspaceId)
        .ilike('title', `%${query.trim()}%`)
        .limit(20)
      setResults(data || [])
      setSelected(0)
      setLoading(false)
    }, 180)
    return () => clearTimeout(timer)
  }, [query, workspaceId])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)) }
    else if (e.key === 'Enter' && results[selected]) { onNavigate(results[selected].id); onClose() }
    else if (e.key === 'Escape') onClose()
  }

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,0.35)' }} onClick={onClose} />
      <div style={{ position: 'fixed', top: '18%', left: '50%', transform: 'translateX(-50%)', width: 'min(90vw, 560px)', background: 'var(--surface)', borderRadius: 12, boxShadow: '0 12px 48px rgba(0,0,0,0.22)', zIndex: 1000, overflow: 'hidden' }}>
        {/* Search input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 16, color: 'var(--text-tertiary)', flexShrink: 0 }}>🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search pages…"
            style={{ flex: 1, border: 'none', outline: 'none', fontSize: 15, background: 'transparent', color: 'var(--text)', fontFamily: 'var(--font-sans)' }}
          />
          {loading
            ? <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>…</span>
            : <kbd style={{ fontSize: 11, background: 'var(--sidebar-bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 6px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-sans)', flexShrink: 0 }}>Esc</kbd>
          }
        </div>

        {/* Results */}
        <div style={{ maxHeight: 360, overflowY: 'auto' }}>
          {!query.trim() && (
            <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
              Type to search across all pages
            </div>
          )}
          {query.trim() && !loading && results.length === 0 && (
            <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
              No results for <strong>"{query}"</strong>
            </div>
          )}
          {results.map((r, i) => (
            <div key={r.id}
              onClick={() => { onNavigate(r.id); onClose() }}
              onMouseEnter={() => setSelected(i)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px', cursor: 'pointer', background: selected === i ? 'var(--accent-light)' : 'transparent', borderLeft: `3px solid ${selected === i ? 'var(--accent)' : 'transparent'}` }}>
              <span style={{ fontSize: 17, flexShrink: 0 }}>{r.icon || (r.is_database ? '🗄️' : '📄')}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: selected === i ? 'var(--accent)' : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.title || 'Untitled'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{r.is_database ? 'Database' : 'Page'}</div>
              </div>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)', flexShrink: 0 }}>↵</span>
            </div>
          ))}
        </div>

        {results.length > 0 && (
          <div style={{ padding: '6px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 14, fontSize: 11, color: 'var(--text-tertiary)' }}>
            <span>↑↓ navigate</span><span>↵ open</span><span>esc close</span>
          </div>
        )}
      </div>
    </>
  )
}

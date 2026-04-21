'use client'
import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Workspace, Page, SharedPage, User } from '@/lib/types'

type Props = {
  user: User
  workspaces: Workspace[]
  currentWorkspace: Workspace
  pages: Page[]
  sharedPages: SharedPage[]
  children: React.ReactNode
}

export default function AppShell({ user, workspaces: initialWorkspaces, currentWorkspace: initialWs, pages: initialPages, sharedPages, children }: Props) {
  const [workspaces, setWorkspaces] = useState(initialWorkspaces)
  const [currentWs, setCurrentWs] = useState(initialWs)
  const [pages, setPages] = useState(initialPages)
  const [expandedPages, setExpandedPages] = useState<Set<string>>(new Set())
  const [expandedShared, setExpandedShared] = useState<Set<string>>(new Set())
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [wsMenuOpen, setWsMenuOpen] = useState(false)
  const [renamingWs, setRenamingWs] = useState(false)
  const [wsNameInput, setWsNameInput] = useState('')
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; pageId: string } | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  const currentPageId = pathname.match(/\/app\/page\/([^\/]+)/)?.[1] || null
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Close sidebar on mobile when navigating
  useEffect(() => {
    if (isMobile) setSidebarOpen(false)
  }, [pathname])

  // ── PAGE ACTIONS ────────────────────────────────────────────
  async function createPage(parentId: string | null = null) {
    const maxPos = pages.filter(p => p.parent_id === parentId).reduce((m, p) => Math.max(m, p.position), 0)
    const { data, error } = await supabase.from('pages').insert({
      workspace_id: currentWs.id,
      parent_id: parentId,
      title: 'Untitled',
      icon: '',
      content: [],
      position: maxPos + 1,
      is_database: false,
      link_permission: 'none'
    }).select().single()
    if (!error && data) {
      setPages(p => [...p, data])
      if (parentId) setExpandedPages(e => new Set([...e, parentId]))
      router.push(`/app/page/${data.id}`)
    }
  }

  async function createDatabase(parentId: string | null = null) {
    const { data, error } = await supabase.from('pages').insert({
      workspace_id: currentWs.id,
      parent_id: parentId,
      title: 'Untitled database',
      icon: '🗄️',
      content: [],
      position: Date.now(),
      is_database: true,
      link_permission: 'none'
    }).select().single()
    if (!error && data) {
      setPages(p => [...p, data])
      router.push(`/app/page/${data.id}`)
    }
  }

  async function deletePage(pageId: string) {
    await supabase.from('pages').delete().eq('id', pageId)
    setPages(p => p.filter(x => x.id !== pageId))
    if (currentPageId === pageId) router.push('/app')
    setContextMenu(null)
  }

  async function duplicatePage(pageId: string) {
    const page = pages.find(p => p.id === pageId)
    if (!page) return
    const { data, error } = await supabase.from('pages').insert({
      ...page, id: undefined, title: page.title + ' (copy)', created_at: undefined, updated_at: undefined
    }).select().single()
    if (!error && data) {
      setPages(p => [...p, data])
      router.push(`/app/page/${data.id}`)
    }
    setContextMenu(null)
  }

  async function renamePage(pageId: string, title: string) {
    await supabase.from('pages').update({ title }).eq('id', pageId)
    setPages(p => p.map(x => x.id === pageId ? { ...x, title } : x))
  }

  async function movePage(pageId: string, newParentId: string | null) {
    if (pageId === newParentId) return
    await supabase.from('pages').update({ parent_id: newParentId }).eq('id', pageId)
    setPages(p => p.map(x => x.id === pageId ? { ...x, parent_id: newParentId } : x))
  }

  // ── WORKSPACE ACTIONS ────────────────────────────────────────
  async function createWorkspace() {
    const { data, error } = await supabase.from('workspaces').insert({
      name: 'New Workspace', icon: '📁'
    }).select().single()
    if (!error && data) {
      setWorkspaces(w => [...w, data])
      switchWorkspace(data)
    }
    setWsMenuOpen(false)
  }

  async function deleteWorkspace(wsId: string) {
    if (!confirm('Delete this workspace and all its pages? This cannot be undone.')) return
    await supabase.from('pages').delete().eq('workspace_id', wsId)
    await supabase.from('workspaces').delete().eq('id', wsId)
    setWorkspaces(w => w.filter(x => x.id !== wsId))
    if (currentWs.id === wsId && workspaces.length > 1) {
      const next = workspaces.find(w => w.id !== wsId)!
      switchWorkspace(next)
    }
  }

  async function renameWorkspace(name: string) {
    await supabase.from('workspaces').update({ name }).eq('id', currentWs.id)
    setCurrentWs(w => ({ ...w, name }))
    setWorkspaces(ws => ws.map(w => w.id === currentWs.id ? { ...w, name } : w))
    setRenamingWs(false)
  }

  function switchWorkspace(ws: Workspace) {
    setCurrentWs(ws)
    router.push('/app')
    setWsMenuOpen(false)
  }

  // ── DRAG & DROP ──────────────────────────────────────────────
  function handleDragStart(e: React.DragEvent, pageId: string) {
    setDraggingId(pageId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('pageId', pageId)
  }

  function handleDragOver(e: React.DragEvent, targetId: string | null) {
    e.preventDefault()
    setDragOverId(targetId)
  }

  function handleDrop(e: React.DragEvent, targetParentId: string | null) {
    e.preventDefault()
    const pageId = e.dataTransfer.getData('pageId')
    if (pageId && pageId !== targetParentId) movePage(pageId, targetParentId)
    setDragOverId(null)
    setDraggingId(null)
  }

  // ── CONTEXT MENU ─────────────────────────────────────────────
  function openContextMenu(e: React.MouseEvent, pageId: string) {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, pageId })
  }

  // ── RENDER PAGE TREE ─────────────────────────────────────────
  function renderPageTree(parentId: string | null, depth = 0): React.ReactNode {
    const children = pages
      .filter(p => p.parent_id === parentId && p.workspace_id === currentWs.id)
      .sort((a, b) => a.position - b.position)
    return children.map(page => {
      const hasChildren = pages.some(p => p.parent_id === page.id)
      const isExpanded = expandedPages.has(page.id)
      const isActive = currentPageId === page.id
      const isDragOver = dragOverId === page.id
      return (
        <div key={page.id}>
          <div
            draggable
            onDragStart={e => handleDragStart(e, page.id)}
            onDragOver={e => handleDragOver(e, page.id)}
            onDrop={e => handleDrop(e, page.id)}
            onDragEnd={() => { setDraggingId(null); setDragOverId(null) }}
            onContextMenu={e => openContextMenu(e, page.id)}
            onClick={() => router.push(`/app/page/${page.id}`)}
            style={{
              display: 'flex', alignItems: 'center', gap: '2px',
              paddingLeft: `${8 + depth * 14}px`, paddingRight: '8px',
              paddingTop: '3px', paddingBottom: '3px',
              borderRadius: '4px', cursor: 'pointer',
              background: isActive ? 'var(--sidebar-active)' : isDragOver ? 'var(--accent-light)' : 'transparent',
              opacity: draggingId === page.id ? 0.5 : 1,
              margin: '1px 4px', userSelect: 'none',
            }}
            className="sidebar-item"
          >
            {/* Expand toggle */}
            <span
              onClick={e => { e.stopPropagation(); setExpandedPages(s => { const n = new Set(s); n.has(page.id) ? n.delete(page.id) : n.add(page.id); return n }) }}
              style={{ width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--text-tertiary)', fontSize: '10px', borderRadius: '3px', opacity: hasChildren ? 1 : 0 }}
            >
              {isExpanded ? '▾' : '▸'}
            </span>
            {/* Icon */}
            <span style={{ fontSize: '14px', flexShrink: 0, width: '18px', textAlign: 'center' }}>
              {page.icon || (page.is_database ? '🗄️' : '📄')}
            </span>
            {/* Title */}
            <span style={{ flex: 1, fontSize: '13.5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: isActive ? 'var(--text)' : 'var(--text)' }}>
              {page.title || 'Untitled'}
            </span>
            {/* Actions */}
            <span className="actions" onClick={e => e.stopPropagation()} style={{ gap: '2px' }}>
              <SbBtn onClick={() => createPage(page.id)} title="Add sub-page">+</SbBtn>
              <SbBtn onClick={e => openContextMenu(e as any, page.id)} title="More">···</SbBtn>
            </span>
          </div>
          {isExpanded && hasChildren && (
            <div>{renderPageTree(page.id, depth + 1)}</div>
          )}
        </div>
      )
    })
  }

  function renderSharedTree(parentId: string | null, depth = 0): React.ReactNode {
    const children = sharedPages.filter(p => p.parent_id === parentId)
    return children.map(page => {
      const hasChildren = sharedPages.some(p => p.parent_id === page.id)
      const isExpanded = expandedShared.has(page.id)
      const isActive = currentPageId === page.id
      return (
        <div key={page.id}>
          <div
            onClick={() => router.push(`/app/page/${page.id}`)}
            style={{ display: 'flex', alignItems: 'center', gap: '2px', paddingLeft: `${8 + depth * 14}px`, paddingRight: '8px', paddingTop: '3px', paddingBottom: '3px', borderRadius: '4px', cursor: 'pointer', background: isActive ? 'var(--sidebar-active)' : 'transparent', margin: '1px 4px', userSelect: 'none' }}
            className="sidebar-item"
          >
            <span onClick={e => { e.stopPropagation(); setExpandedShared(s => { const n = new Set(s); n.has(page.id) ? n.delete(page.id) : n.add(page.id); return n }) }}
              style={{ width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--text-tertiary)', fontSize: '10px', opacity: hasChildren ? 1 : 0 }}>
              {isExpanded ? '▾' : '▸'}
            </span>
            <span style={{ fontSize: '14px', flexShrink: 0, width: '18px', textAlign: 'center' }}>{page.icon || '📄'}</span>
            <span style={{ flex: 1, fontSize: '13.5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{page.title || 'Untitled'}</span>
            <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{page.permission === 'edit' ? '✎' : '👁'}</span>
            <span className="actions" onClick={e => e.stopPropagation()} style={{ gap: '2px' }}>
              <SbBtn onClick={() => removeSharedPage(page.id)} title="Remove from my workspace">✕</SbBtn>
            </span>
          </div>
          {isExpanded && <div>{renderSharedTree(page.id, depth + 1)}</div>}
        </div>
      )
    })
  }

  async function removeSharedPage(pageId: string) {
    const supabaseClient = createClient()
    await supabaseClient.from('page_shares').delete().eq('page_id', pageId).eq('user_id', user.id)
    // Remove from local state by reloading
    window.location.reload()
  }

  const rootShared = sharedPages.filter(p => !sharedPages.some(s => s.id === p.parent_id))

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg)' }}>
      {/* Mobile overlay */}
      {!sidebarOpen && (
        <div className="sidebar-overlay" style={{ display: 'none' }} onClick={() => setSidebarOpen(false)} />
      )}

      {/* Mobile overlay */}
      {isMobile && sidebarOpen && (
        <div className="sidebar-mobile-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      {/* SIDEBAR */}
      <aside
        className={isMobile ? 'sidebar-mobile' : ''}
        style={{
          width: sidebarOpen ? '240px' : (isMobile ? '0' : '0'),
          minWidth: sidebarOpen ? '240px' : '0',
          background: 'var(--sidebar-bg)',
          borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column',
          height: '100vh', overflow: 'hidden',
          transition: 'width 0.2s, min-width 0.2s',
          flexShrink: isMobile ? 0 : 0,
        }}>
        {/* Workspace switcher */}
        <div style={{ padding: '10px 8px 4px', flexShrink: 0 }}>
          <div
            onClick={() => setWsMenuOpen(o => !o)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: '6px', cursor: 'pointer', userSelect: 'none' }}
            className="sidebar-item"
          >
            <span style={{ fontSize: '16px' }}>{currentWs.icon}</span>
            {renamingWs
              ? <input autoFocus value={wsNameInput} onChange={e => setWsNameInput(e.target.value)}
                  onBlur={() => renameWorkspace(wsNameInput)}
                  onKeyDown={e => { if (e.key === 'Enter') renameWorkspace(wsNameInput); if (e.key === 'Escape') setRenamingWs(false) }}
                  onClick={e => e.stopPropagation()}
                  style={{ flex: 1, border: 'none', background: 'transparent', fontFamily: 'var(--font-sans)', fontSize: '14px', fontWeight: 600, color: 'var(--text)', outline: 'none' }} />
              : <span style={{ flex: 1, fontSize: '14px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentWs.name}</span>
            }
            <span style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>⌄</span>
          </div>

          {/* Workspace dropdown */}
          {wsMenuOpen && (
            <div style={{ position: 'absolute', top: '52px', left: '8px', width: '224px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', boxShadow: 'var(--shadow-lg)', zIndex: 200, padding: '6px' }}
              className="scale-in">
              {workspaces.map(ws => (
                <div key={ws.id}
                  onClick={() => switchWorkspace(ws)}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px', borderRadius: '5px', cursor: 'pointer', background: ws.id === currentWs.id ? 'var(--sidebar-active)' : 'transparent' }}
                  className="sidebar-item">
                  <span>{ws.icon}</span>
                  <span style={{ flex: 1, fontSize: '13px' }}>{ws.name}</span>
                  {ws.id === currentWs.id && <span style={{ fontSize: '11px', color: 'var(--accent)' }}>✓</span>}
                  {ws.id !== currentWs.id && (
                    <span onClick={e => { e.stopPropagation(); deleteWorkspace(ws.id) }}
                      style={{ fontSize: '11px', color: 'var(--text-tertiary)', padding: '1px 4px', borderRadius: '3px' }}>✕</span>
                  )}
                </div>
              ))}
              <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
              <div onClick={() => { setWsNameInput(currentWs.name); setRenamingWs(true); setWsMenuOpen(false) }}
                style={{ padding: '7px 10px', borderRadius: '5px', cursor: 'pointer', fontSize: '13px', color: 'var(--text-secondary)' }}
                className="sidebar-item">
                ✎ Rename workspace
              </div>
              <div onClick={createWorkspace}
                style={{ padding: '7px 10px', borderRadius: '5px', cursor: 'pointer', fontSize: '13px', color: 'var(--text-secondary)' }}
                className="sidebar-item">
                + New workspace
              </div>
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div style={{ padding: '2px 8px 8px', display: 'flex', gap: '2px', flexShrink: 0 }}>
          <QuickBtn onClick={() => createPage(null)} title="New page">
            <span style={{ fontSize: '14px' }}>✦</span>
            <span style={{ fontSize: '12px' }}>New page</span>
          </QuickBtn>
          <QuickBtn onClick={() => createDatabase(null)} title="New database">
            <span style={{ fontSize: '14px' }}>🗄</span>
            <span style={{ fontSize: '12px' }}>Database</span>
          </QuickBtn>
        </div>

        {/* Pages tree */}
        <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '8px' }}>
          {/* Section label */}
          <SectionLabel>Pages</SectionLabel>
          <div
            onDragOver={e => handleDragOver(e, null)}
            onDrop={e => handleDrop(e, null)}
            style={{ minHeight: '4px', outline: dragOverId === null && draggingId ? '2px dashed var(--accent)' : 'none', borderRadius: '4px', margin: '0 4px' }}
          />
          {renderPageTree(null)}

          {/* Shared with me */}
          {sharedPages.length > 0 && (
            <>
              <SectionLabel style={{ marginTop: '8px' }}>Shared with me</SectionLabel>
              {renderSharedTree(null)}
            </>
          )}
        </div>

        {/* User */}
        <div style={{ padding: '8px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: '6px' }} className="sidebar-item"
            onClick={async () => { await supabase.auth.signOut(); router.push('/login') }}>
            <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 600, color: '#fff', flexShrink: 0 }}>
              {user.name[0]?.toUpperCase()}
            </div>
            <span style={{ flex: 1, fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name}</span>
            <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }} title="Sign out">⏻</span>
          </div>
        </div>
      </aside>

      {/* MAIN */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {/* Top bar */}
        <div style={{ height: '44px', padding: '0 12px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <button onClick={() => setSidebarOpen(o => !o)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '16px', padding: '4px 6px', borderRadius: '4px', lineHeight: 1, flexShrink: 0 }}
            title="Toggle sidebar">
            ☰
          </button>
          {/* Breadcrumb */}
          {currentPageId && (() => {
            const crumbs: { id: string; title: string; icon: string }[] = []
            let cur = pages.find(p => p.id === currentPageId)
            while (cur) {
              crumbs.unshift({ id: cur.id, title: cur.title || 'Untitled', icon: cur.icon || (cur.is_database ? '🗄️' : '📄') })
              cur = cur.parent_id ? pages.find(p => p.id === cur!.parent_id) : undefined
            }
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', overflow: 'hidden', flex: 1 }}>
                {crumbs.map((crumb, i) => (
                  <div key={crumb.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: i < crumbs.length - 1 ? 1 : 0, minWidth: 0 }}>
                    {i > 0 && <span style={{ color: 'var(--text-tertiary)', fontSize: '12px', flexShrink: 0 }}>/</span>}
                    <button onClick={() => router.push(`/app/page/${crumb.id}`)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: '13px', color: i === crumbs.length - 1 ? 'var(--text)' : 'var(--text-secondary)', padding: '2px 4px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: i < crumbs.length - 1 ? '120px' : 'none', fontWeight: i === crumbs.length - 1 ? 500 : 400 }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}>
                      <span style={{ fontSize: '13px' }}>{crumb.icon}</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{crumb.title}</span>
                    </button>
                  </div>
                ))}
              </div>
            )
          })()}
        </div>
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>{children}</div>
      </main>

      {/* Context menu */}
      {contextMenu && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 1999 }} onClick={() => setContextMenu(null)} />
          <div className="context-menu scale-in"
            style={{ position: 'fixed', left: contextMenu.x, top: contextMenu.y, zIndex: 2000 }}>
            <div className="context-menu-item" onClick={() => { router.push(`/app/page/${contextMenu.pageId}`); setContextMenu(null) }}>
              <span>↗</span> Open
            </div>
            <div className="context-menu-item" onClick={() => duplicatePage(contextMenu.pageId)}>
              <span>⧉</span> Duplicate
            </div>
            <div className="context-menu-item" onClick={() => createPage(contextMenu.pageId)}>
              <span>+</span> Add sub-page
            </div>
            <div className="context-menu-item" onClick={() => { createDatabase(contextMenu.pageId); setContextMenu(null) }}>
              <span>🗄</span> Add database
            </div>
            <div className="context-menu-sep" />
            <div className="context-menu-item danger" onClick={() => deletePage(contextMenu.pageId)}>
              <span>🗑</span> Delete
            </div>
          </div>
        </>
      )}

      {/* Click outside ws menu */}
      {wsMenuOpen && <div style={{ position: 'fixed', inset: 0, zIndex: 199 }} onClick={() => setWsMenuOpen(false)} />}
    </div>
  )
}

function SbBtn({ onClick, title, children }: { onClick: (e: React.MouseEvent) => void; title: string; children: React.ReactNode }) {
  return (
    <button onClick={e => { e.stopPropagation(); onClick(e) }} title={title}
      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: '2px 5px', borderRadius: '3px', fontSize: '13px', lineHeight: 1, fontFamily: 'var(--font-sans)' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-active)'; (e.currentTarget as HTMLElement).style.color = 'var(--text)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; (e.currentTarget as HTMLElement).style.color = 'var(--text-tertiary)' }}>
      {children}
    </button>
  )
}

function QuickBtn({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={title}
      style={{ flex: 1, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '5px 8px', borderRadius: '5px', fontSize: '12px', fontFamily: 'var(--font-sans)', display: 'flex', alignItems: 'center', gap: '6px' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}>
      {children}
    </button>
  )
}

function SectionLabel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ padding: '8px 14px 2px', fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', userSelect: 'none', ...style }}>
      {children}
    </div>
  )
}

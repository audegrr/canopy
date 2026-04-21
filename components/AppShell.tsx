'use client'
import { useState, useRef, useCallback, useEffect, useTransition } from 'react'
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
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [navigating, setNavigating] = useState(false)
  const [renamingPageId, setRenamingPageId] = useState<string | null>(null)
  const [renameVal, setRenameVal] = useState('')
  const [toast, setToast] = useState('')
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  const currentPageId = pathname.match(/\/app\/page\/([^\/]+)/)?.[1] || null

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    if (isMobile) setSidebarOpen(false)
    setNavigating(false)
  }, [pathname])

  // Auto-expand ancestors of current page
  useEffect(() => {
    if (!currentPageId) return
    const ancestors = new Set<string>()
    let cur = pages.find(p => p.id === currentPageId)
    while (cur?.parent_id) {
      ancestors.add(cur.parent_id)
      cur = pages.find(p => p.id === cur!.parent_id)
    }
    if (ancestors.size > 0) setExpandedPages(e => new Set([...e, ...ancestors]))
  }, [currentPageId, pages])

  function navigate(path: string) {
    setNavigating(true)
    router.push(path)
  }

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 2500) }

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
      setPages(p => [...p, data as Page])
      if (parentId) setExpandedPages(e => new Set([...e, parentId]))
      navigate(`/app/page/${data.id}`)
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
      setPages(p => [...p, data as Page])
      navigate(`/app/page/${data.id}`)
    }
  }

  async function deletePage(pageId: string) {
    await supabase.from('pages').delete().eq('id', pageId)
    setPages(p => p.filter(x => x.id !== pageId))
    if (currentPageId === pageId) navigate('/app')
    setContextMenu(null)
  }

  async function duplicatePage(pageId: string) {
    const page = pages.find(p => p.id === pageId)
    if (!page) return
    const { data } = await supabase.from('pages').select('*').eq('id', pageId).single()
    if (!data) return
    const { data: copy } = await supabase.from('pages').insert({
      ...data, id: undefined, title: (data.title || 'Untitled') + ' (copy)',
      created_at: undefined, updated_at: undefined
    }).select().single()
    if (copy) {
      setPages(p => [...p, copy as Page])
      navigate(`/app/page/${copy.id}`)
    }
    setContextMenu(null)
  }

  async function renamePage(pageId: string, title: string) {
    await supabase.from('pages').update({ title }).eq('id', pageId)
    setPages(p => p.map(x => x.id === pageId ? { ...x, title } : x))
    setRenamingPageId(null)
  }

  async function movePage(pageId: string, newParentId: string | null) {
    if (pageId === newParentId) return
    await supabase.from('pages').update({ parent_id: newParentId }).eq('id', pageId)
    setPages(p => p.map(x => x.id === pageId ? { ...x, parent_id: newParentId } : x))
  }

  // Update page in list when icon/title changes (called from outside via event)
  useEffect(() => {
    function onPageUpdate(e: any) {
      const { id, title, icon } = e.detail
      setPages(p => p.map(x => x.id === id ? { ...x, ...(title !== undefined ? { title } : {}), ...(icon !== undefined ? { icon } : {}) } : x))
    }
    window.addEventListener('canopy:pageUpdate', onPageUpdate)
    return () => window.removeEventListener('canopy:pageUpdate', onPageUpdate)
  }, [])

  // ── WORKSPACE ACTIONS ────────────────────────────────────────
  async function createWorkspace() {
    const { data } = await supabase.from('workspaces').insert({ name: 'New Workspace', icon: '📁' }).select().single()
    if (data) { setWorkspaces(w => [...w, data]); switchWorkspace(data) }
    setWsMenuOpen(false)
  }

  async function deleteWorkspace(wsId: string) {
    if (!confirm('Delete this workspace and all its pages? This cannot be undone.')) return
    await supabase.from('pages').delete().eq('workspace_id', wsId)
    await supabase.from('workspaces').delete().eq('id', wsId)
    setWorkspaces(w => w.filter(x => x.id !== wsId))
    if (currentWs.id === wsId) {
      const next = workspaces.find(w => w.id !== wsId)
      if (next) switchWorkspace(next)
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
    navigate('/app')
    setWsMenuOpen(false)
  }

  // ── DRAG & DROP (sidebar) ─────────────────────────────────────
  function handleDragStart(e: React.DragEvent, pageId: string) {
    setDraggingId(pageId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('pageId', pageId)
  }

  function handleDrop(e: React.DragEvent, targetId: string | null) {
    e.preventDefault()
    const pageId = e.dataTransfer.getData('pageId')
    if (pageId && pageId !== targetId) movePage(pageId, targetId)
    setDragOverId(null); setDraggingId(null)
  }

  async function removeSharedPage(pageId: string) {
    await supabase.from('page_shares').delete().eq('page_id', pageId).eq('user_id', user.id)
    window.location.reload()
  }

  function copyPageUrl(pageId: string) {
    navigator.clipboard?.writeText(`${window.location.origin}/app/page/${pageId}`)
    showToast('URL copied!')
    setContextMenu(null)
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
            onDragOver={e => { e.preventDefault(); setDragOverId(page.id) }}
            onDragLeave={() => setDragOverId(null)}
            onDrop={e => handleDrop(e, page.id)}
            onDragEnd={() => { setDraggingId(null); setDragOverId(null) }}
            onContextMenu={e => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, pageId: page.id }) }}
            onClick={() => navigate(`/app/page/${page.id}`)}
            style={{
              display: 'flex', alignItems: 'center', gap: '2px',
              paddingLeft: `${8 + depth * 16}px`, paddingRight: '6px',
              paddingTop: '3px', paddingBottom: '3px',
              borderRadius: '5px', cursor: 'pointer',
              background: isActive ? 'var(--sidebar-active)' : isDragOver ? 'var(--accent-light)' : 'transparent',
              opacity: draggingId === page.id ? 0.4 : 1,
              margin: '1px 4px',
              userSelect: 'none',
              outline: isActive ? 'none' : 'none',
              borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
            }}
            onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)' }}
            onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = isDragOver ? 'var(--accent-light)' : 'transparent' }}
          >
            {/* Expand toggle — distinct from add button */}
            <span
              onClick={e => { e.stopPropagation(); setExpandedPages(s => { const n = new Set(s); n.has(page.id) ? n.delete(page.id) : n.add(page.id); return n }) }}
              style={{
                width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, color: 'var(--text-tertiary)', fontSize: '10px', borderRadius: '3px',
                visibility: hasChildren ? 'visible' : 'hidden',
                transition: 'transform 0.15s',
                transform: isExpanded ? 'rotate(90deg)' : 'none',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--border)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}
              title={isExpanded ? 'Collapse' : 'Expand'}
            >
              ▸
            </span>

            {/* Icon */}
            <span style={{ fontSize: '14px', flexShrink: 0, width: '18px', textAlign: 'center', lineHeight: 1 }}>
              {page.icon || (page.is_database ? '🗄️' : '📄')}
            </span>

            {/* Title — inline rename */}
            {renamingPageId === page.id ? (
              <input
                autoFocus
                value={renameVal}
                onChange={e => setRenameVal(e.target.value)}
                onBlur={() => renamePage(page.id, renameVal)}
                onKeyDown={e => { if (e.key === 'Enter') renamePage(page.id, renameVal); if (e.key === 'Escape') setRenamingPageId(null) }}
                onClick={e => e.stopPropagation()}
                style={{ flex: 1, border: 'none', borderBottom: '1px solid var(--accent)', background: 'transparent', fontFamily: 'var(--font-sans)', fontSize: '13.5px', color: 'var(--text)', outline: 'none', padding: '0 2px' }}
              />
            ) : (
              <span style={{ flex: 1, fontSize: '13.5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: isActive ? 'var(--text)' : 'var(--text)', fontWeight: isActive ? 500 : 400 }}>
                {page.title || 'Untitled'}
              </span>
            )}

            {/* Actions — shown on hover */}
            <span className="actions" onClick={e => e.stopPropagation()} style={{ gap: '1px', flexShrink: 0 }}>
              <SbBtn onClick={() => createPage(page.id)} title="New sub-page">+</SbBtn>
              <SbBtn onClick={e => { e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, pageId: page.id }) }} title="More options">•••</SbBtn>
            </span>
          </div>

          {isExpanded && <div>{renderPageTree(page.id, depth + 1)}</div>}
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
            onClick={() => navigate(`/app/page/${page.id}`)}
            style={{ display: 'flex', alignItems: 'center', gap: '2px', paddingLeft: `${8 + depth * 16}px`, paddingRight: '6px', paddingTop: '3px', paddingBottom: '3px', borderRadius: '5px', cursor: 'pointer', background: isActive ? 'var(--sidebar-active)' : 'transparent', margin: '1px 4px', userSelect: 'none', borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent' }}
            onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)' }}
            onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
          >
            <span
              onClick={e => { e.stopPropagation(); setExpandedShared(s => { const n = new Set(s); n.has(page.id) ? n.delete(page.id) : n.add(page.id); return n }) }}
              style={{ width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--text-tertiary)', fontSize: '10px', visibility: hasChildren ? 'visible' : 'hidden', transition: 'transform 0.15s', transform: isExpanded ? 'rotate(90deg)' : 'none', borderRadius: '3px' }}>
              ▸
            </span>
            <span style={{ fontSize: '14px', flexShrink: 0, width: '18px', textAlign: 'center' }}>{page.icon || '📄'}</span>
            <span style={{ flex: 1, fontSize: '13.5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: isActive ? 500 : 400 }}>{page.title || 'Untitled'}</span>
            <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', flexShrink: 0 }}>{page.permission === 'edit' ? '✎' : '👁'}</span>
            <span className="actions" onClick={e => e.stopPropagation()}>
              <SbBtn onClick={() => removeSharedPage(page.id)} title="Remove from workspace">✕</SbBtn>
            </span>
          </div>
          {isExpanded && <div>{renderSharedTree(page.id, depth + 1)}</div>}
        </div>
      )
    })
  }

  const rootShared = sharedPages.filter(p => !sharedPages.some(s => s.id === p.parent_id))

  // Breadcrumb
  const breadcrumbs = (() => {
    if (!currentPageId) return []
    const crumbs: { id: string; title: string; icon: string }[] = []
    let cur = pages.find(p => p.id === currentPageId)
    while (cur) {
      crumbs.unshift({ id: cur.id, title: cur.title || 'Untitled', icon: cur.icon || (cur.is_database ? '🗄️' : '📄') })
      cur = cur.parent_id ? pages.find(p => p.id === cur!.parent_id) : undefined
    }
    return crumbs
  })()

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg)' }}>
      {/* Mobile overlay */}
      {isMobile && sidebarOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 39, backdropFilter: 'blur(2px)' }}
          onClick={() => setSidebarOpen(false)} />
      )}

      {/* SIDEBAR */}
      <aside style={{
        width: sidebarOpen ? '260px' : '0',
        minWidth: sidebarOpen ? '260px' : '0',
        background: 'var(--sidebar-bg)',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        height: '100vh', overflow: 'hidden',
        transition: 'width 0.2s, min-width 0.2s',
        flexShrink: 0,
        ...(isMobile ? { position: 'fixed', left: 0, top: 0, bottom: 0, zIndex: 40, boxShadow: '4px 0 24px rgba(0,0,0,0.15)' } : {}),
      }}>
        {/* Workspace switcher */}
        <div style={{ padding: '10px 8px 4px', flexShrink: 0, position: 'relative' }}>
          <div onClick={() => setWsMenuOpen(o => !o)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px', borderRadius: '6px', cursor: 'pointer', userSelect: 'none' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}>
            <span style={{ fontSize: '18px', lineHeight: 1 }}>{currentWs.icon}</span>
            {renamingWs ? (
              <input autoFocus value={wsNameInput} onChange={e => setWsNameInput(e.target.value)}
                onBlur={() => renameWorkspace(wsNameInput)}
                onKeyDown={e => { if (e.key === 'Enter') renameWorkspace(wsNameInput); if (e.key === 'Escape') setRenamingWs(false) }}
                onClick={e => e.stopPropagation()}
                style={{ flex: 1, border: 'none', background: 'transparent', fontFamily: 'var(--font-sans)', fontSize: '14px', fontWeight: 600, color: 'var(--text)', outline: 'none', borderBottom: '1px solid var(--accent)' }} />
            ) : (
              <span style={{ flex: 1, fontSize: '14px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentWs.name}</span>
            )}
            <span style={{ color: 'var(--text-tertiary)', fontSize: '11px', flexShrink: 0 }}>⌄</span>
          </div>

          {wsMenuOpen && (
            <div style={{ position: 'absolute', top: '54px', left: '8px', width: '244px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', boxShadow: 'var(--shadow-lg)', zIndex: 200, padding: '6px' }} className="scale-in">
              {workspaces.map(ws => (
                <div key={ws.id} onClick={() => switchWorkspace(ws)}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px', borderRadius: '5px', cursor: 'pointer', background: ws.id === currentWs.id ? 'var(--sidebar-active)' : 'transparent' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ws.id === currentWs.id ? 'var(--sidebar-active)' : 'transparent' }}>
                  <span style={{ fontSize: '16px' }}>{ws.icon}</span>
                  <span style={{ flex: 1, fontSize: '13px', fontWeight: 500 }}>{ws.name}</span>
                  {ws.id === currentWs.id && <span style={{ fontSize: '11px', color: 'var(--accent)' }}>✓</span>}
                  {ws.id !== currentWs.id && (
                    <span onClick={e => { e.stopPropagation(); deleteWorkspace(ws.id) }}
                      style={{ fontSize: '11px', color: 'var(--text-tertiary)', padding: '1px 4px', borderRadius: '3px' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--red)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-tertiary)' }}>✕</span>
                  )}
                </div>
              ))}
              <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
              <div onClick={() => { setWsNameInput(currentWs.name); setRenamingWs(true); setWsMenuOpen(false) }}
                style={{ padding: '7px 10px', borderRadius: '5px', cursor: 'pointer', fontSize: '13px', color: 'var(--text-secondary)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}>
                ✎ Rename workspace
              </div>
              <div onClick={createWorkspace}
                style={{ padding: '7px 10px', borderRadius: '5px', cursor: 'pointer', fontSize: '13px', color: 'var(--text-secondary)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}>
                + New workspace
              </div>
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div style={{ padding: '2px 10px 8px', display: 'flex', gap: '4px', flexShrink: 0 }}>
          <QuickBtn onClick={() => createPage(null)} title="New page">
            <span>✦</span><span style={{ fontSize: '12px' }}>New page</span>
          </QuickBtn>
          <QuickBtn onClick={() => createDatabase(null)} title="New database">
            <span>🗄</span>
          </QuickBtn>
        </div>

        {/* Pages tree */}
        <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '8px' }}>
          <SectionLabel>Pages</SectionLabel>
          <div onDragOver={e => e.preventDefault()} onDrop={e => handleDrop(e, null)}
            style={{ minHeight: '4px' }} />
          {renderPageTree(null)}

          {/* Shared with me */}
          {sharedPages.length > 0 && (
            <>
              <SectionLabel style={{ marginTop: '12px' }}>Shared with me</SectionLabel>
              {renderSharedTree(null)}
            </>
          )}
        </div>

        {/* User */}
        <div style={{ padding: '8px 10px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: '6px', cursor: 'pointer' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}
            onClick={async () => { await supabase.auth.signOut(); router.push('/login') }}>
            <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: '#fff', flexShrink: 0 }}>
              {user.name[0]?.toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '13px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</div>
            </div>
            <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }} title="Sign out">⏻</span>
          </div>
        </div>
      </aside>

      {/* MAIN */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {/* Top bar */}
        <div style={{ height: '44px', padding: '0 12px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <button onClick={() => setSidebarOpen(o => !o)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '16px', padding: '4px 6px', borderRadius: '4px', lineHeight: 1, flexShrink: 0, transition: 'background 0.1s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}
            title="Toggle sidebar">☰</button>

          {/* Breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px', overflow: 'hidden', flex: 1 }}>
            {breadcrumbs.map((crumb, i) => (
              <div key={crumb.id} style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: i < breadcrumbs.length - 1 ? 1 : 0, minWidth: 0 }}>
                {i > 0 && <span style={{ color: 'var(--text-tertiary)', fontSize: '12px', flexShrink: 0, margin: '0 2px' }}>/</span>}
                <button onClick={() => navigate(`/app/page/${crumb.id}`)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: '13px', color: i === breadcrumbs.length - 1 ? 'var(--text)' : 'var(--text-secondary)', padding: '3px 6px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '4px', overflow: 'hidden', maxWidth: i < breadcrumbs.length - 1 ? '100px' : 'none', fontWeight: i === breadcrumbs.length - 1 ? 500 : 400, whiteSpace: 'nowrap' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}>
                  <span style={{ fontSize: '13px', flexShrink: 0 }}>{crumb.icon}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{crumb.title}</span>
                </button>
              </div>
            ))}
          </div>

          {/* Navigation loading indicator */}
          {navigating && (
            <div style={{ width: '16px', height: '16px', border: '2px solid var(--border)', borderTop: '2px solid var(--accent)', borderRadius: '50%', animation: 'spin 0.6s linear infinite', flexShrink: 0 }} />
          )}
        </div>

        {/* Loading bar */}
        {navigating && (
          <div style={{ height: '2px', background: 'var(--accent)', position: 'absolute', top: '44px', left: sidebarOpen ? '260px' : '0', right: 0, zIndex: 10, animation: 'loadingBar 0.8s ease-out forwards' }} />
        )}

        <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>{children}</div>
      </main>

      {/* Context menu */}
      {contextMenu && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 1999 }} onClick={() => setContextMenu(null)} />
          <div className="context-menu scale-in"
            style={{ position: 'fixed', left: Math.min(contextMenu.x, window.innerWidth - 220), top: Math.min(contextMenu.y, window.innerHeight - 200), zIndex: 2000 }}>
            <div className="context-menu-item" onClick={() => { navigate(`/app/page/${contextMenu.pageId}`); setContextMenu(null) }}>
              <span>↗</span> Open
            </div>
            <div className="context-menu-item" onClick={() => { setRenamingPageId(contextMenu.pageId); setRenameVal(pages.find(p => p.id === contextMenu.pageId)?.title || ''); setContextMenu(null) }}>
              <span>✎</span> Rename
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
            <div className="context-menu-item" onClick={() => copyPageUrl(contextMenu.pageId)}>
              <span>🔗</span> Copy URL
            </div>
            <div className="context-menu-sep" />
            <div className="context-menu-item danger" onClick={() => deletePage(contextMenu.pageId)}>
              <span>🗑</span> Delete
            </div>
          </div>
        </>
      )}

      {/* WS menu backdrop */}
      {wsMenuOpen && <div style={{ position: 'fixed', inset: 0, zIndex: 199 }} onClick={() => setWsMenuOpen(false)} />}

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: '24px', right: '24px', background: '#37352f', color: '#fff', padding: '10px 16px', borderRadius: '8px', fontSize: '13px', zIndex: 300, boxShadow: 'var(--shadow-lg)' }} className="fade-in">
          {toast}
        </div>
      )}
    </div>
  )
}

function SbBtn({ onClick, title, children }: { onClick: (e: React.MouseEvent) => void; title: string; children: React.ReactNode }) {
  return (
    <button onClick={e => { e.stopPropagation(); onClick(e) }} title={title}
      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: '2px 4px', borderRadius: '3px', fontSize: '12px', lineHeight: 1, fontFamily: 'var(--font-sans)', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '18px', height: '18px' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = 'var(--text)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; (e.currentTarget as HTMLElement).style.color = 'var(--text-tertiary)' }}>
      {children}
    </button>
  )
}

function QuickBtn({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={title}
      style={{ flex: title === 'New page' ? 1 : 0, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '5px 8px', borderRadius: '5px', fontSize: '13px', fontFamily: 'var(--font-sans)', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}>
      {children}
    </button>
  )
}

function SectionLabel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ padding: '8px 14px 3px', fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', userSelect: 'none', ...style }}>
      {children}
    </div>
  )
}

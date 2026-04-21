'use client'
import { useState, useRef, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Workspace, Page, SharedPage, User } from '@/lib/types'
import CommandPalette from './CommandPalette'

type Props = {
  user: User
  workspaces: Workspace[]
  currentWorkspace: Workspace
  pages: Page[]
  sharedPages: SharedPage[]
  children: React.ReactNode
}

export default function AppShell({ user, workspaces: initWS, currentWorkspace: initCWS, pages: initPages, sharedPages, children }: Props) {
  const [workspaces, setWorkspaces] = useState(initWS)
  const [currentWs, setCurrentWs] = useState(initCWS)
  const [pages, setPages] = useState(initPages)
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
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [showDeleteAccount, setShowDeleteAccount] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  const currentPageId = pathname.match(/\/app\/page\/([^/]+)/)?.[1] || null

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Restore last active workspace from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('canopy_workspace')
    if (saved) {
      const found = workspaces.find(w => w.id === saved)
      if (found) setCurrentWs(found)
    }
  }, [])

  useEffect(() => {
    if (isMobile) setSidebarOpen(false)
    setNavigating(false)
  }, [pathname])

  useEffect(() => {
    if (!currentPageId) return
    const ancestors = new Set<string>()
    let cur = pages.find(p => p.id === currentPageId)
    while (cur?.parent_id) {
      ancestors.add(cur.parent_id)
      cur = pages.find(p => p.id === cur!.parent_id)
    }
    if (ancestors.size > 0) setExpandedPages(e => new Set([...e, ...ancestors]))
  }, [currentPageId])

  useEffect(() => {
    function onPageUpdate(e: any) {
      const { id, title, icon } = e.detail
      setPages(p => p.map(x => x.id === id ? { ...x, ...(title !== undefined ? { title } : {}), ...(icon !== undefined ? { icon } : {}) } : x))
    }
    window.addEventListener('canopy:pageUpdate', onPageUpdate)
    return () => window.removeEventListener('canopy:pageUpdate', onPageUpdate)
  }, [])

  function navigate(path: string) { setNavigating(true); router.push(path) }
  function prefetch(path: string) { router.prefetch(path) }
  function showToastMsg(msg: string) { setToast(msg); setTimeout(() => setToast(''), 2500) }

  // ── PAGE ACTIONS ────────────────────────────────────────────
  async function createPage(parentId: string | null = null) {
    const maxPos = pages.filter(p => p.parent_id === parentId).reduce((m, p) => Math.max(m, p.position), 0)
    const { data } = await supabase.from('pages').insert({
      workspace_id: currentWs.id, parent_id: parentId, title: 'Untitled',
      icon: '', content: [], position: maxPos + 1, is_database: false, link_permission: 'none'
    }).select().single()
    if (data) {
      setPages(p => [...p, data as Page])
      if (parentId) setExpandedPages(e => new Set([...e, parentId]))
      navigate(`/app/page/${data.id}`)
    }
    setContextMenu(null)
  }

  async function createDatabase(parentId: string | null = null) {
    const { data } = await supabase.from('pages').insert({
      workspace_id: currentWs.id, parent_id: parentId, title: 'Untitled database',
      icon: '🗄️', content: [], position: Date.now(), is_database: true, link_permission: 'none'
    }).select().single()
    if (data) { setPages(p => [...p, data as Page]); navigate(`/app/page/${data.id}`) }
    setContextMenu(null)
  }

  async function deletePage(pageId: string) {
    await supabase.from('pages').delete().eq('id', pageId)
    setPages(p => p.filter(x => x.id !== pageId))
    if (currentPageId === pageId) navigate('/app')
    setContextMenu(null)
  }

  async function duplicatePage(pageId: string) {
    const { data } = await supabase.from('pages').select('*').eq('id', pageId).single()
    if (!data) return
    const { data: copy } = await supabase.from('pages').insert({
      ...data, id: undefined, title: (data.title || 'Untitled') + ' (copy)', created_at: undefined, updated_at: undefined
    }).select().single()
    if (copy) { setPages(p => [...p, copy as Page]); navigate(`/app/page/${copy.id}`) }
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

  function copyPageUrl(pageId: string) {
    navigator.clipboard?.writeText(`${window.location.origin}/app/page/${pageId}`)
    showToastMsg('URL copied!')
    setContextMenu(null)
  }

  // Get any page (own or shared) by id for context menu
  function getAnyPage(pageId: string) {
    return pages.find(p => p.id === pageId) || sharedPages.find(p => p.id === pageId) || null
  }

  // Is this page owned by the current user?
  function isOwnPage(pageId: string) {
    return pages.some(p => p.id === pageId)
  }

  async function removeSharedPage(pageId: string) {
    await supabase.from('page_shares').delete().eq('page_id', pageId).eq('user_id', user.id)
    window.location.reload()
  }

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
    if (currentWs.id === wsId) { const next = workspaces.find(w => w.id !== wsId); if (next) switchWorkspace(next) }
  }

  async function renameWorkspace(name: string) {
    await supabase.from('workspaces').update({ name }).eq('id', currentWs.id)
    setCurrentWs(w => ({ ...w, name }))
    setWorkspaces(ws => ws.map(w => w.id === currentWs.id ? { ...w, name } : w))
    setRenamingWs(false)
  }

  function switchWorkspace(ws: Workspace) {
    setCurrentWs(ws)
    localStorage.setItem('canopy_workspace', ws.id)
    navigate('/app')
    setWsMenuOpen(false)
  }

  async function handleSignOut() { await supabase.auth.signOut(); router.push('/login') }

  async function handleDeleteAccount() {
    if (!confirm('Delete your account permanently? All your data will be lost.')) return
    // Delete all user data then sign out
    await supabase.from('pages').delete().eq('owner_id', user.id)
    await supabase.from('workspaces').delete().eq('owner_id', user.id)
    await supabase.auth.signOut()
    router.push('/login')
  }

  // ── DRAG & DROP (sidebar pages) ──────────────────────────────
  function handleDragStart(e: React.DragEvent, pageId: string) {
    setDraggingId(pageId); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('pageId', pageId)
  }
  function handleDrop(e: React.DragEvent, targetId: string | null) {
    e.preventDefault()
    const id = e.dataTransfer.getData('pageId')
    if (id && id !== targetId) movePage(id, targetId)
    setDragOverId(null); setDraggingId(null)
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
          <PageRow
            page={page} depth={depth} isActive={isActive} isDragOver={isDragOver}
            hasChildren={hasChildren} isExpanded={isExpanded}
            isRenaming={renamingPageId === page.id} renameVal={renameVal}
            onRenameChange={setRenameVal}
            onRenameSubmit={() => renamePage(page.id, renameVal)}
            onRenameCancel={() => setRenamingPageId(null)}
            onToggle={() => setExpandedPages(s => { const n = new Set(s); n.has(page.id) ? n.delete(page.id) : n.add(page.id); return n })}
            onClick={() => navigate(`/app/page/${page.id}`)}
            onHover={() => prefetch(`/app/page/${page.id}`)}
            onDragStart={(e: React.DragEvent) => handleDragStart(e, page.id)}
            onDragOver={(e: React.DragEvent) => { e.preventDefault(); setDragOverId(page.id) }}
            onDragLeave={() => setDragOverId(null)}
            onDrop={(e: React.DragEvent) => handleDrop(e, page.id)}
            onDragEnd={() => { setDraggingId(null); setDragOverId(null) }}
            onContextMenu={(e: React.MouseEvent) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, pageId: page.id }) }}
            onAddSubpage={() => createPage(page.id)}
            onMoreMenu={(e: React.MouseEvent) => { e.stopPropagation(); setContextMenu({ x: (e.target as HTMLElement).getBoundingClientRect().right, y: (e.target as HTMLElement).getBoundingClientRect().bottom + 4, pageId: page.id }) }}
            isDragging={draggingId === page.id}
          />
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
          <PageRow
            page={page as any} depth={depth} isActive={isActive} isDragOver={false}
            hasChildren={hasChildren} isExpanded={isExpanded}
            isRenaming={false} renameVal='' onRenameChange={() => {}} onRenameSubmit={() => {}} onRenameCancel={() => {}}
            onToggle={() => setExpandedShared(s => { const n = new Set(s); n.has(page.id) ? n.delete(page.id) : n.add(page.id); return n })}
            onClick={() => navigate(`/app/page/${page.id}`)}
            onDragStart={() => {}} onDragOver={() => {}} onDragLeave={() => {}} onDrop={() => {}} onDragEnd={() => {}}
            onContextMenu={() => {}}
            onAddSubpage={() => {}} onMoreMenu={() => {}}
            isDragging={false}
            badge={page.permission === 'edit' ? '✏️' : '👁️'}
          />
          {isExpanded && <div>{renderSharedTree(page.id, depth + 1)}</div>}
        </div>
      )
    })
  }

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
      {isMobile && sidebarOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 39, backdropFilter: 'blur(2px)' }} onClick={() => setSidebarOpen(false)} />
      )}

      {/* SIDEBAR */}
      <aside style={{
        width: sidebarOpen ? '260px' : '0', minWidth: sidebarOpen ? '260px' : '0',
        background: 'var(--sidebar-bg)', borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden',
        transition: 'width 0.2s, min-width 0.2s', flexShrink: 0,
        ...(isMobile ? { position: 'fixed', left: 0, top: 0, bottom: 0, zIndex: 40, boxShadow: '4px 0 24px rgba(0,0,0,0.15)' } : {}),
      }}>
        {/* Workspace switcher */}
        <div style={{ padding: '10px 8px 4px', flexShrink: 0, position: 'relative' }}>
          <div onClick={() => setWsMenuOpen(o => !o)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px', borderRadius: '6px', cursor: 'pointer', userSelect: 'none' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}>
            <span style={{ fontSize: '24px', lineHeight: 1 }}>{currentWs.icon}</span>
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
                      style={{ fontSize: '11px', color: 'var(--text-tertiary)', padding: '2px 5px', borderRadius: '3px' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--red)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-tertiary)' }}>✕</span>
                  )}
                </div>
              ))}
              <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
              <MenuItem onClick={() => { setWsNameInput(currentWs.name); setRenamingWs(true); setWsMenuOpen(false) }}>✎ Rename workspace</MenuItem>
              <MenuItem onClick={createWorkspace}>+ New workspace</MenuItem>
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div style={{ padding: '2px 10px 8px', display: 'flex', gap: '4px', flexShrink: 0 }}>
          <QuickBtn onClick={() => createPage(null)} title="New page" flex>
            <span style={{ fontSize: '15px' }}>📄</span>
            <span style={{ fontSize: '12.5px' }}>New page</span>
          </QuickBtn>
          <QuickBtn onClick={() => createDatabase(null)} title="New database" flex>
            <span style={{ fontSize: '15px' }}>🗄️</span>
            <span style={{ fontSize: '12.5px' }}>Database</span>
          </QuickBtn>
        </div>

        {/* Pages tree */}
        <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '8px' }}>
          <SectionLabel>Pages</SectionLabel>
          <div onDragOver={e => e.preventDefault()} onDrop={e => handleDrop(e, null)} style={{ minHeight: '4px' }} />
          {renderPageTree(null)}
          {sharedPages.length > 0 && (
            <>
              <SectionLabel style={{ marginTop: '12px' }}>Shared with me</SectionLabel>
              {renderSharedTree(null)}
            </>
          )}
        </div>

        {/* User — click for settings, separate sign out button */}
        <div style={{ padding: '8px 10px', borderTop: '1px solid var(--border)', flexShrink: 0, position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: '6px' }}>
            <div onClick={() => setUserMenuOpen(o => !o)}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, cursor: 'pointer', borderRadius: '5px', padding: '2px 4px', minWidth: 0 }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}>
              <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                {user.name[0]?.toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</div>
              </div>
            </div>
            {/* Sign out button — only the power icon */}
            <button onClick={handleSignOut} title="Sign out"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: '16px', padding: '4px 6px', borderRadius: '4px', lineHeight: 1, flexShrink: 0 }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)'; (e.currentTarget as HTMLElement).style.color = 'var(--text)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; (e.currentTarget as HTMLElement).style.color = 'var(--text-tertiary)' }}>
              ⏻
            </button>
          </div>

          {/* User settings menu */}
          {userMenuOpen && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 299 }} onClick={() => setUserMenuOpen(false)} />
              <div style={{ position: 'absolute', bottom: '64px', left: '8px', right: '8px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', boxShadow: 'var(--shadow-lg)', zIndex: 300, padding: '8px' }} className="scale-in">
                {/* Profile info */}
                <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', marginBottom: '4px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '2px' }}>{user.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{user.email}</div>
                </div>
                <MenuItem onClick={() => { setUserMenuOpen(false); setWsMenuOpen(true) }}>⚙️ Workspace settings</MenuItem>
                <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
                <MenuItem onClick={() => { handleSignOut(); setUserMenuOpen(false) }}>🚪 Sign out</MenuItem>
                <MenuItem danger onClick={() => { setShowDeleteAccount(true); setUserMenuOpen(false) }}>🗑️ Delete account</MenuItem>
              </div>
            </>
          )}
        </div>
      </aside>

      {/* MAIN */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {/* Top bar */}
        <div style={{ height: '44px', padding: '0 12px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <button onClick={() => setSidebarOpen(o => !o)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '16px', padding: '4px 6px', borderRadius: '4px', lineHeight: 1, flexShrink: 0 }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}
            title="Toggle sidebar">☰</button>

          {/* Breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px', overflow: 'hidden', flex: 1 }}>
            {breadcrumbs.map((crumb, i) => (
              <div key={crumb.id} style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: i < breadcrumbs.length - 1 ? 1 : 0, minWidth: 0 }}>
                {i > 0 && <span style={{ color: 'var(--text-tertiary)', fontSize: '12px', flexShrink: 0, margin: '0 1px' }}>/</span>}
                <button onClick={() => navigate(`/app/page/${crumb.id}`)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: '13px', color: i === breadcrumbs.length - 1 ? 'var(--text)' : 'var(--text-secondary)', padding: '3px 5px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '4px', maxWidth: i < breadcrumbs.length - 1 ? '100px' : 'none', fontWeight: i === breadcrumbs.length - 1 ? 500 : 400, whiteSpace: 'nowrap', overflow: 'hidden' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}>
                  <span style={{ fontSize: '13px', flexShrink: 0 }}>{crumb.icon}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{crumb.title}</span>
                </button>
              </div>
            ))}
          </div>

          {/* Cmd+K button */}
          <button
            onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', metaKey: true, bubbles: true }))}
            style={{ background: 'var(--sidebar-bg)', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '13px', padding: '5px 12px', borderRadius: '6px', fontFamily: 'var(--font-sans)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, whiteSpace: 'nowrap', transition: 'all 0.15s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--text-tertiary)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-bg)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
            title="Search & commands (⌘F)">
            🔍 Search <kbd style={{ fontSize: '11px', background: 'var(--border)', border: 'none', borderRadius: '3px', padding: '1px 5px', fontFamily: 'var(--font-sans)', color: 'var(--text-secondary)' }}>⌘F</kbd>
          </button>

          {navigating && (
            <div style={{ width: '16px', height: '16px', border: '2px solid var(--border)', borderTop: '2px solid var(--accent)', borderRadius: '50%', animation: 'spin 0.6s linear infinite', flexShrink: 0 }} />
          )}
        </div>

        {navigating && (
          <div style={{ height: '2px', background: 'var(--accent)', position: 'absolute', top: '44px', left: sidebarOpen && !isMobile ? '260px' : '0', right: 0, zIndex: 10, animation: 'loadingBar 0.8s ease-out forwards' }} />
        )}

        <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>{children}</div>
      </main>

      {/* Context menu */}
      {contextMenu && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 1999 }} onClick={() => setContextMenu(null)} />
          <div className="context-menu scale-in"
            style={{ position: 'fixed', left: Math.min(contextMenu.x, window.innerWidth - 220), top: Math.min(contextMenu.y, window.innerHeight - 220), zIndex: 2000 }}>
            <MenuItem onClick={() => { navigate(`/app/page/${contextMenu.pageId}`); setContextMenu(null) }}>↗️ Open</MenuItem>
            {isOwnPage(contextMenu.pageId) && <>
              <MenuItem onClick={() => { setRenamingPageId(contextMenu.pageId); setRenameVal(pages.find(p => p.id === contextMenu.pageId)?.title || ''); setContextMenu(null) }}>✏️ Rename</MenuItem>
              <MenuItem onClick={() => duplicatePage(contextMenu.pageId)}>📋 Duplicate</MenuItem>
              <MenuItem onClick={() => createPage(contextMenu.pageId)}>📄 Add sub-page</MenuItem>
              <MenuItem onClick={() => createDatabase(contextMenu.pageId)}>🗄️ Add database</MenuItem>
            </>}
            <MenuItem onClick={() => copyPageUrl(contextMenu.pageId)}>🔗 Copy URL</MenuItem>
            <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
            <MenuItem onClick={() => {
              const pid = contextMenu.pageId; setContextMenu(null)
              navigate(`/app/page/${pid}?panel=share`)
            }}>🔒 Share…</MenuItem>
            <MenuItem onClick={() => {
              const pid = contextMenu.pageId; setContextMenu(null)
              navigate(`/app/page/${pid}?panel=export`)
            }}>⬇️ Export…</MenuItem>
            {isOwnPage(contextMenu.pageId) && <>
              <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
              <MenuItem danger onClick={() => deletePage(contextMenu.pageId)}>🗑️ Delete</MenuItem>
            </>}
          </div>
        </>
      )}

      {/* Delete account confirmation */}
      {showDeleteAccount && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 500 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '28px', width: '380px', boxShadow: 'var(--shadow-lg)', zIndex: 501 }} className="scale-in">
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '10px', color: 'var(--red)' }}>Delete account?</h2>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '20px', lineHeight: 1.5 }}>
              This will permanently delete all your pages, workspaces and data. This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowDeleteAccount(false)} style={{ background: 'var(--sidebar-bg)', border: 'none', padding: '8px 16px', borderRadius: '7px', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: '13px' }}>Cancel</button>
              <button onClick={handleDeleteAccount} style={{ background: 'var(--red)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '7px', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 600 }}>Delete permanently</button>
            </div>
          </div>
        </>
      )}

      {wsMenuOpen && <div style={{ position: 'fixed', inset: 0, zIndex: 199 }} onClick={() => setWsMenuOpen(false)} />}

      <CommandPalette
        workspaceId={currentWs.id}
        onCreatePage={() => createPage(null)}
        onCreateDatabase={() => createDatabase(null)}
      />

      {toast && (
        <div style={{ position: 'fixed', bottom: '24px', right: '24px', background: '#37352f', color: '#fff', padding: '10px 16px', borderRadius: '8px', fontSize: '13px', zIndex: 300, boxShadow: 'var(--shadow-lg)' }} className="fade-in">
          {toast}
        </div>
      )}
    </div>
  )
}

// ── PAGE ROW COMPONENT ───────────────────────────────────────
function PageRow({ page, depth, isActive, isDragOver, hasChildren, isExpanded, isRenaming, renameVal, onRenameChange, onRenameSubmit, onRenameCancel, onToggle, onClick, onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd, onContextMenu, onAddSubpage, onMoreMenu, isDragging, badge, onRemove, onHover }: any) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      draggable={!isRenaming}
      onDragStart={onDragStart} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} onDragEnd={onDragEnd}
      onContextMenu={onContextMenu}
      onClick={onClick}
      onMouseEnter={() => { setHovered(true); onHover?.() }}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center',
        paddingLeft: `${6 + depth * 16}px`, paddingRight: '6px',
        paddingTop: '6px', paddingBottom: '6px',
        borderRadius: '5px', cursor: 'pointer',
        background: isActive ? 'var(--sidebar-active)' : isDragOver ? 'var(--accent-light)' : hovered ? 'var(--sidebar-hover)' : 'transparent',
        opacity: isDragging ? 0.4 : 1,
        margin: '0 4px',
        userSelect: 'none',
        borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
        transition: 'background 0.08s',
      }}
    >
      {/* Expand toggle — big arrow, only visible when has children */}
      <span
        onClick={e => { e.stopPropagation(); if (hasChildren) onToggle() }}
        style={{
          width: '20px', height: '20px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, borderRadius: '4px',
          color: hasChildren ? 'var(--text-secondary)' : 'transparent',
          fontSize: '13px',
          transition: 'transform 0.15s',
          transform: isExpanded ? 'rotate(90deg)' : 'none',
          cursor: hasChildren ? 'pointer' : 'default',
        }}
        onMouseEnter={e => { if (hasChildren) (e.currentTarget as HTMLElement).style.background = 'var(--border)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}
        title={hasChildren ? (isExpanded ? 'Collapse' : 'Expand') : ''}
      >
        {hasChildren ? '▶' : ''}
      </span>

      {/* Page icon */}
      <span style={{ fontSize: '15px', flexShrink: 0, width: '20px', textAlign: 'center', lineHeight: 1, marginRight: '2px' }}>
        {page.icon || (page.is_database ? '🗄️' : '📄')}
      </span>

      {/* Title or rename input */}
      {isRenaming ? (
        <input autoFocus value={renameVal} onChange={e => onRenameChange(e.target.value)}
          onBlur={onRenameSubmit}
          onKeyDown={e => { if (e.key === 'Enter') onRenameSubmit(); if (e.key === 'Escape') onRenameCancel() }}
          onClick={e => e.stopPropagation()}
          style={{ flex: 1, border: 'none', borderBottom: '1px solid var(--accent)', background: 'transparent', fontFamily: 'var(--font-sans)', fontSize: '13.5px', color: 'var(--text)', outline: 'none', padding: '0 2px' }} />
      ) : (
        <span style={{ flex: 1, fontSize: '13.5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: isActive ? 500 : 400 }}>
          {page.title || 'Untitled'}
        </span>
      )}

      {/* Badge (shared pages) */}
      {badge && <span style={{ fontSize: '13px', flexShrink: 0, marginRight: '2px' }}>{badge}</span>}

      {/* Actions row — always on same line */}
      {hovered && !isRenaming && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          {onRemove ? (
            <SbBtn onClick={onRemove} title="Remove">✕</SbBtn>
          ) : (
            <>
              <SbBtn onClick={onAddSubpage} title="New sub-page">+</SbBtn>
              <SbBtn onClick={onMoreMenu} title="More options">•••</SbBtn>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── SMALL COMPONENTS ─────────────────────────────────────────
function SbBtn({ onClick, title, children }: { onClick: (e: React.MouseEvent) => void; title: string; children: React.ReactNode }) {
  return (
    <button onClick={e => { e.stopPropagation(); onClick(e) }} title={title}
      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: '3px 5px', borderRadius: '4px', fontSize: '12px', lineHeight: 1, fontFamily: 'var(--font-sans)', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '20px', minWidth: '20px' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = 'var(--text)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; (e.currentTarget as HTMLElement).style.color = 'var(--text-tertiary)' }}>
      {children}
    </button>
  )
}

function QuickBtn({ onClick, title, flex, children }: { onClick: () => void; title: string; flex?: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={title}
      style={{ flex: flex ? 1 : 'none', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '5px 8px', borderRadius: '5px', fontSize: '13px', fontFamily: 'var(--font-sans)', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
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

function MenuItem({ onClick, children, danger }: { onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <div onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px', borderRadius: '5px', cursor: 'pointer', fontSize: '13px', color: danger ? 'var(--red)' : 'var(--text)' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = danger ? '#fff0f0' : 'var(--sidebar-hover)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}>
      {children}
    </div>
  )
}

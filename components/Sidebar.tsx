'use client'
import { useState, useRef, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Workspace, Page, SharedPage, User } from '@/lib/types'

interface SidebarProps {
  user: User
  workspaces: Workspace[]
  currentWorkspace: Workspace
  pages: Page[]
  sharedPages: SharedPage[]
}

export default function Sidebar({ user, workspaces: initialWorkspaces, currentWorkspace: initialWs, pages: initialPages, sharedPages }: SidebarProps) {
  const [workspaces, setWorkspaces] = useState(initialWorkspaces)
  const [currentWs, setCurrentWs] = useState(initialWs)
  const [pages, setPages] = useState(initialPages)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [wsMenuOpen, setWsMenuOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [dragging, setDragging] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; pageId: string } | null>(null)
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  const currentPageId = pathname.startsWith('/app/page/') ? pathname.split('/app/page/')[1] : null

  // ── WORKSPACE ACTIONS ───────────────────────────────────────
  async function createWorkspace() {
    const name = prompt('Workspace name:', 'New Workspace')
    if (!name) return
    const { data } = await supabase.from('workspaces').insert({ name, icon: '🌿' }).select().single()
    if (data) { setWorkspaces(w => [...w, data]); switchWorkspace(data) }
  }

  async function renameWorkspace(ws: Workspace) {
    const name = prompt('Rename workspace:', ws.name)
    if (!name) return
    await supabase.from('workspaces').update({ name }).eq('id', ws.id)
    setWorkspaces(w => w.map(x => x.id === ws.id ? { ...x, name } : x))
    if (currentWs.id === ws.id) setCurrentWs(c => ({ ...c, name }))
  }

  async function deleteWorkspace(ws: Workspace) {
    if (!confirm(`Delete "${ws.name}" and all its pages? This cannot be undone.`)) return
    await supabase.from('workspaces').delete().eq('id', ws.id)
    const remaining = workspaces.filter(w => w.id !== ws.id)
    setWorkspaces(remaining)
    if (currentWs.id === ws.id && remaining.length > 0) switchWorkspace(remaining[0])
  }

  function switchWorkspace(ws: Workspace) {
    setCurrentWs(ws)
    setWsMenuOpen(false)
    router.push('/app')
    // Reload pages for this workspace
    supabase.from('pages').select('*').eq('workspace_id', ws.id).order('position').then(({ data }) => {
      setPages(data || [])
    })
  }

  // ── PAGE ACTIONS ────────────────────────────────────────────
  async function createPage(parentId: string | null = null) {
    const siblings = pages.filter(p => p.parent_id === parentId && p.workspace_id === currentWs.id)
    const position = siblings.length > 0 ? Math.max(...siblings.map(p => p.position)) + 1 : 0
    const { data } = await supabase.from('pages').insert({
      workspace_id: currentWs.id,
      parent_id: parentId,
      title: 'Untitled',
      icon: '',
      content: [],
      position,
      is_database: false
    }).select().single()
    if (data) {
      setPages(p => [...p, data])
      if (parentId) setExpanded(e => new Set([...e, parentId]))
      router.push(`/app/page/${data.id}`)
    }
  }

  async function createDatabase(parentId: string | null = null) {
    const siblings = pages.filter(p => p.parent_id === parentId && p.workspace_id === currentWs.id)
    const position = siblings.length > 0 ? Math.max(...siblings.map(p => p.position)) + 1 : 0
    const { data } = await supabase.from('pages').insert({
      workspace_id: currentWs.id,
      parent_id: parentId,
      title: 'Untitled Database',
      icon: '🗄️',
      content: [],
      position,
      is_database: true
    }).select().single()
    if (data) {
      setPages(p => [...p, data])
      router.push(`/app/page/${data.id}`)
    }
  }

  async function deletePage(pageId: string) {
    await supabase.from('pages').delete().eq('id', pageId)
    setPages(p => p.filter(x => x.id !== pageId))
    if (currentPageId === pageId) router.push('/app')
    setCtxMenu(null)
  }

  async function duplicatePage(pageId: string) {
    const page = pages.find(p => p.id === pageId)
    if (!page) return
    const { data } = await supabase.from('pages').insert({
      ...page, id: undefined, title: page.title + ' (copy)',
      created_at: undefined, updated_at: undefined, position: page.position + 0.5
    }).select().single()
    if (data) { setPages(p => [...p, data]); router.push(`/app/page/${data.id}`) }
    setCtxMenu(null)
  }

  async function renamePage(pageId: string) {
    const page = pages.find(p => p.id === pageId)
    if (!page) return
    const title = prompt('Rename:', page.title)
    if (!title) return
    await supabase.from('pages').update({ title }).eq('id', pageId)
    setPages(p => p.map(x => x.id === pageId ? { ...x, title } : x))
    setCtxMenu(null)
  }

  // ── DRAG & DROP ──────────────────────────────────────────────
  async function handleDrop(dragId: string, targetId: string | null) {
    if (dragId === targetId) return
    const target = targetId ? pages.find(p => p.id === targetId) : null
    const newParentId = target?.id || null
    await supabase.from('pages').update({ parent_id: newParentId }).eq('id', dragId)
    setPages(p => p.map(x => x.id === dragId ? { ...x, parent_id: newParentId } : x))
    if (newParentId) setExpanded(e => new Set([...e, newParentId]))
    setDragging(null); setDragOver(null)
  }

  // ── RENDER PAGE TREE ─────────────────────────────────────────
  function renderPages(parentId: string | null, depth = 0): React.ReactNode {
    const children = pages
      .filter(p => p.parent_id === parentId && p.workspace_id === currentWs.id)
      .sort((a, b) => a.position - b.position)
    return children.map(page => {
      const hasChildren = pages.some(p => p.parent_id === page.id)
      const isExpanded = expanded.has(page.id)
      const isActive = currentPageId === page.id
      const isDraggedOver = dragOver === page.id
      return (
        <div key={page.id}>
          <div
            draggable
            onDragStart={() => setDragging(page.id)}
            onDragOver={e => { e.preventDefault(); setDragOver(page.id) }}
            onDragLeave={() => setDragOver(null)}
            onDrop={e => { e.preventDefault(); if (dragging) handleDrop(dragging, page.id) }}
            onContextMenu={e => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, pageId: page.id }) }}
            style={{
              display: 'flex', alignItems: 'center', gap: '2px',
              padding: `3px 8px 3px ${8 + depth * 16}px`,
              borderRadius: 'var(--radius)', margin: '1px 4px',
              cursor: 'pointer', userSelect: 'none',
              background: isActive ? 'var(--bg-active)' : isDraggedOver ? 'var(--accent-light)' : 'transparent',
              color: isActive ? 'var(--text)' : 'var(--text)',
              outline: isDraggedOver ? '1px dashed var(--accent)' : 'none',
              transition: 'background 0.1s'
            }}
            onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)' }}
            onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
          >
            {/* Toggle */}
            <button onClick={e => { e.stopPropagation(); setExpanded(ex => { const n = new Set(ex); n.has(page.id) ? n.delete(page.id) : n.add(page.id); return n }) }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', borderRadius: '3px', color: 'var(--text-tertiary)', fontSize: '10px', width: '16px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: hasChildren ? 1 : 0 }}>
              <span style={{ display: 'inline-block', transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>▶</span>
            </button>
            {/* Icon + title */}
            <div onClick={() => router.push(`/app/page/${page.id}`)} style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: '14px', flexShrink: 0, width: '18px', textAlign: 'center' }}>
                {page.icon || (page.is_database ? '🗄️' : '📄')}
              </span>
              <span style={{ fontSize: '13.5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                {page.title || 'Untitled'}
              </span>
            </div>
            {/* Actions on hover */}
            <div className="page-actions" style={{ display: 'none', gap: '1px', flexShrink: 0 }}>
              <ActionBtn onClick={e => { e.stopPropagation(); createPage(page.id) }} title="Add sub-page">+</ActionBtn>
            </div>
          </div>
          {isExpanded && <div>{renderPages(page.id, depth + 1)}</div>}
        </div>
      )
    })
  }

  if (collapsed) return (
    <div style={{ width: '40px', background: 'var(--sidebar-bg)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px 0', gap: '8px' }}>
      <button onClick={() => setCollapsed(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '16px', padding: '6px', borderRadius: 'var(--radius)' }}>☰</button>
    </div>
  )

  return (
    <>
      <aside style={{ width: 'var(--sidebar-width)', background: 'var(--sidebar-bg)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', height: '100vh', flexShrink: 0, overflow: 'hidden' }}>

        {/* WORKSPACE SWITCHER */}
        <div style={{ padding: '10px 10px 6px', flexShrink: 0 }}>
          <button onClick={() => setWsMenuOpen(o => !o)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: 'var(--radius)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', transition: 'background 0.1s' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
            <span style={{ fontSize: '18px', flexShrink: 0 }}>{currentWs.icon}</span>
            <span style={{ flex: 1, fontSize: '14px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }}>{currentWs.name}</span>
            <span style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>⇅</span>
          </button>
        </div>

        {/* NAV ACTIONS */}
        <div style={{ padding: '2px 8px 4px', flexShrink: 0 }}>
          {[
            { icon: '🔍', label: 'Search', action: () => {} },
            { icon: '🏠', label: 'Home', action: () => router.push('/app') },
          ].map(item => (
            <button key={item.label} onClick={item.action}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 8px', borderRadius: 'var(--radius)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13.5px', color: 'var(--text-secondary)', transition: 'background 0.1s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; (e.currentTarget as HTMLElement).style.color = 'var(--text)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)' }}>
              <span style={{ fontSize: '14px', width: '20px', textAlign: 'center' }}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>

        <div style={{ height: '1px', background: 'var(--border)', margin: '4px 8px' }} />

        {/* PAGES TREE */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
          <SectionHeader label="Pages" onAdd={() => createPage(null)} />
          {renderPages(null)}

          {/* Shared with me */}
          {sharedPages.length > 0 && (
            <>
              <div style={{ height: '1px', background: 'var(--border)', margin: '8px 8px 4px' }} />
              <SectionHeader label="Shared with me" />
              {sharedPages.filter(p => !p.parent_id || !sharedPages.find(s => s.id === p.parent_id)).map(page => (
                <div key={page.id}>
                  <div onClick={() => router.push(`/app/page/${page.id}`)}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 8px', borderRadius: 'var(--radius)', margin: '1px 4px', cursor: 'pointer', background: currentPageId === page.id ? 'var(--bg-active)' : 'transparent', transition: 'background 0.1s' }}
                    onMouseEnter={e => { if (currentPageId !== page.id) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)' }}
                    onMouseLeave={e => { if (currentPageId !== page.id) (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
                    <span style={{ fontSize: '14px', width: '18px', textAlign: 'center' }}>{page.icon || '📄'}</span>
                    <span style={{ fontSize: '13.5px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{page.title || 'Untitled'}</span>
                    <span style={{ fontSize: '10px', color: page.permission === 'edit' ? 'var(--green)' : 'var(--text-tertiary)', flexShrink: 0 }}>{page.permission === 'edit' ? '✎' : '👁'}</span>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        {/* BOTTOM: new page + user */}
        <div style={{ flexShrink: 0, borderTop: '1px solid var(--border)' }}>
          <button onClick={() => createPage(null)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13.5px', color: 'var(--text-secondary)', transition: 'background 0.1s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; (e.currentTarget as HTMLElement).style.color = 'var(--text)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)' }}>
            <span style={{ fontSize: '16px' }}>+</span> New page
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderTop: '1px solid var(--border)' }}>
            <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--bg-active)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 600, color: 'var(--text)', flexShrink: 0 }}>
              {user.name[0]?.toUpperCase()}
            </div>
            <span style={{ flex: 1, fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name}</span>
            <button onClick={async () => { await createClient().auth.signOut(); router.push('/login') }}
              title="Sign out" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: '14px', padding: '2px', borderRadius: 'var(--radius-sm)' }}>⏻</button>
          </div>
        </div>
      </aside>

      {/* WORKSPACE MENU */}
      {wsMenuOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50 }} onClick={() => setWsMenuOpen(false)}>
          <div style={{ position: 'absolute', top: '52px', left: '10px', width: '260px', background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', padding: '8px', zIndex: 51 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-tertiary)', padding: '4px 8px 6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{user.email}</div>
            {workspaces.map(ws => (
              <div key={ws.id}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: 'var(--radius)', cursor: 'pointer', background: ws.id === currentWs.id ? 'var(--bg-hover)' : 'transparent' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ws.id === currentWs.id ? 'var(--bg-hover)' : 'transparent'}>
                <span style={{ fontSize: '16px' }}>{ws.icon}</span>
                <span style={{ flex: 1, fontSize: '13.5px', fontWeight: 500 }} onClick={() => switchWorkspace(ws)}>{ws.name}</span>
                {ws.id === currentWs.id && <span style={{ fontSize: '11px', color: 'var(--accent)' }}>✓</span>}
                <button onClick={() => renameWorkspace(ws)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: '12px', padding: '2px 4px' }}>✎</button>
                {workspaces.length > 1 && <button onClick={() => deleteWorkspace(ws)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: '12px', padding: '2px 4px' }}>✕</button>}
              </div>
            ))}
            <div style={{ height: '1px', background: 'var(--border)', margin: '6px 0' }} />
            <button onClick={createWorkspace}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: 'var(--radius)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13.5px', color: 'var(--text-secondary)' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; (e.currentTarget as HTMLElement).style.color = 'var(--text)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)' }}>
              + Create workspace
            </button>
          </div>
        </div>
      )}

      {/* CONTEXT MENU */}
      {ctxMenu && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100 }} onClick={() => setCtxMenu(null)}>
          <div className="ctx-menu fade-in" style={{ position: 'absolute', top: ctxMenu.y, left: ctxMenu.x }} onClick={e => e.stopPropagation()}>
            <div className="ctx-menu-item" onClick={() => { router.push(`/app/page/${ctxMenu.pageId}`); setCtxMenu(null) }}>
              <span>📄</span> Open
            </div>
            <div className="ctx-menu-item" onClick={() => renamePage(ctxMenu.pageId)}>
              <span>✎</span> Rename
            </div>
            <div className="ctx-menu-item" onClick={() => createPage(ctxMenu.pageId)}>
              <span>+</span> Add sub-page
            </div>
            <div className="ctx-menu-item" onClick={() => duplicatePage(ctxMenu.pageId)}>
              <span>⧉</span> Duplicate
            </div>
            <div className="ctx-menu-sep" />
            <div className="ctx-menu-item danger" onClick={() => deletePage(ctxMenu.pageId)}>
              <span>🗑</span> Delete
            </div>
          </div>
        </div>
      )}

      <style>{`.page-actions{display:none!important}div:hover>.page-actions{display:flex!important}`}</style>
    </>
  )
}

function SectionHeader({ label, onAdd }: { label: string; onAdd?: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '4px 8px 2px', margin: '0 4px' }}>
      <span style={{ flex: 1, fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>{label}</span>
      {onAdd && <button onClick={onAdd} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: '14px', padding: '1px 4px', borderRadius: '3px', lineHeight: 1 }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; (e.currentTarget as HTMLElement).style.color = 'var(--text)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; (e.currentTarget as HTMLElement).style.color = 'var(--text-tertiary)' }}>+</button>}
    </div>
  )
}

function ActionBtn({ onClick, title, children }: any) {
  return (
    <button onClick={onClick} title={title}
      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: '2px 4px', borderRadius: '3px', fontSize: '13px', lineHeight: 1 }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; (e.currentTarget as HTMLElement).style.color = 'var(--text)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; (e.currentTarget as HTMLElement).style.color = 'var(--text-tertiary)' }}>
      {children}
    </button>
  )
}

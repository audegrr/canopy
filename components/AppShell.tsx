'use client'
import { useState, useRef, useEffect, useMemo } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Workspace, Page, SharedPage, User, MemberWorkspace, WsMember, PendingInvite } from '@/lib/types'
import PageView from './PageView'
import CommandPalette from './CommandPalette'
import SearchModal from './SearchModal'
import ShortcutsModal from './ShortcutsModal'
import { useNotifications } from '@/hooks/useNotifications'
import { useTheme } from '@/hooks/useTheme'
import { exportPageAsPDF, exportPageAsWord, exportPageAsCSV } from '@/lib/export'
import EmojiPicker from './EmojiPicker'
import { Icon } from './Icons'

type Props = {
  user: User
  workspaces: Workspace[]
  currentWorkspace: Workspace
  pages: Page[]
  sharedPages: SharedPage[]
  memberWorkspaces?: MemberWorkspace[]
  children: React.ReactNode
}

function InstantPageView({ data, onNavigate, isFavorite, onToggleFavorite }: { data: any; onNavigate: (path: string) => void; isFavorite?: boolean; onToggleFavorite?: () => void }) {
  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', animation: 'fadeIn 0.12s ease' }}>
      <PageView
        page={data.page}
        canEdit={data.canEdit}
        isOwner={data.isOwner}
        userId={data.userId}
        isFavorite={isFavorite}
        onToggleFavorite={onToggleFavorite}
      />
    </div>
  )
}

export default function AppShell({ user, workspaces: initWS, currentWorkspace: initCWS, pages: initPages, sharedPages: initSharedPages, memberWorkspaces = [], children }: Props) {
  const [workspaces, setWorkspaces] = useState(initWS)
  const [currentWs, setCurrentWs] = useState(initCWS)
  const [pages, setPages] = useState(initPages)
  const [sharedPages, setSharedPages] = useState(initSharedPages)
  const [expandedPages, setExpandedPages] = useState<Set<string>>(new Set())
  const [expandedShared, setExpandedShared] = useState<Set<string>>(new Set())
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [wsMenuOpen, setWsMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState<'profile'|'appearance'|'danger'>('profile')
  const [wsSettingsOpen, setWsSettingsOpen] = useState(false)
  const [wsSettingsTab, setWsSettingsTab] = useState<'general'|'members'|'danger'>('general')
  const [sharedCollapsed, setSharedCollapsed] = useState(false)
  const { theme, setTheme } = useTheme()
  const [wsMembers, setWsMembers] = useState<WsMember[]>([])
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'member'|'viewer'>('member')
  const [profileName, setProfileName] = useState(user.name)
  const [renamingWs, setRenamingWs] = useState(false)
  const [wsNameInput, setWsNameInput] = useState('')
  const [wsRowHovered, setWsRowHovered] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; pageId: string } | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [navigating, setNavigating] = useState(false)
  const [renamingPageId, setRenamingPageId] = useState<string | null>(null)
  const [renameVal, setRenameVal] = useState('')
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [showDeleteAccount, setShowDeleteAccount] = useState(false)
  const [exportMenu, setExportMenu] = useState<{ x: number; y: number; pageId: string } | null>(null)
  const [moveToWsMenu, setMoveToWsMenu] = useState<string | null>(null)
  const [newWsModal, setNewWsModal] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const ZOOM_LEVELS = [0.8, 0.9, 1.0, 1.1, 1.2]
  const [zoom, setZoom] = useState<number>(() => {
    if (typeof window === 'undefined') return 1.0
    const saved = parseFloat(localStorage.getItem('canopy_zoom') || '1')
    return ZOOM_LEVELS.includes(saved) ? saved : 1.0
  })
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [newWsName, setNewWsName] = useState('')
  const [newWsIcon, setNewWsIcon] = useState('🌿')
  const [instantPage, setInstantPage] = useState<{ page: any; canEdit: boolean; isOwner: boolean; userId: string } | null>(null)
  const [templatePicker, setTemplatePicker] = useState<{ parentId: string | null } | null>(null)
  const [trashOpen, setTrashOpen] = useState(false)
  const [trashedPages, setTrashedPages] = useState<Page[]>([])
  const [trashLoading, setTrashLoading] = useState(false)
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set())
  const [favoritesCollapsed, setFavoritesCollapsed] = useState(false)
  const [keyFocusId, setKeyFocusId] = useState<string | null>(null)
  const sidebarTreeRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  const { notifications, notifOpen, setNotifOpen, unreadCount, markAllRead, clearAll: clearAllNotifications, browserPermission, requestBrowserPermission, pushEnabled, togglePush } = useNotifications(user.id, supabase)
  const currentPageId = pathname.match(/\/app\/page\/([^/]+)/)?.[1] || null

  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth < 768
      setIsMobile(mobile)
      if (!mobile) setSidebarOpen(true)
    }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    const onEnter = () => setSidebarOpen(false)
    const onExit = () => setSidebarOpen(true)
    const onOpen = () => setSidebarOpen(true)
    window.addEventListener('canopy:enterFocus', onEnter)
    window.addEventListener('canopy:exitFocus', onExit)
    window.addEventListener('canopy:openSidebar', onOpen)
    return () => {
      window.removeEventListener('canopy:enterFocus', onEnter)
      window.removeEventListener('canopy:exitFocus', onExit)
      window.removeEventListener('canopy:openSidebar', onOpen)
    }
  }, [])

  useEffect(() => {
    document.body.style.setProperty('--content-zoom', String(zoom))
  }, [zoom])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName
      const isEditing = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setSearchOpen(o => !o) }
      if (e.key === '?' && !isEditing) { setShortcutsOpen(o => !o) }
      if (e.key === 'Escape') { setSearchOpen(false); setShortcutsOpen(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Prewarm ALL pages into cache as soon as sidebar loads
  useEffect(() => {
    if (pages.length === 0) return
    const allPages = [...pages, ...sharedPages]
    let i = 0
    function warmNext() {
      if (i >= allPages.length) return
      const p = allPages[i++]
      ;(async () => {
        try {
          const { data: page } = await supabase.from('pages').select('*').eq('id', p.id).single()
          if (page) {
            const isOwner = page.owner_id === user.id
            // Resolve canEdit from available context without extra queries
            const memberWs = memberWorkspaces.find(ws => ws.id === page.workspace_id)
            const sharedWithEdit = (p as (Page | SharedPage) & { permission?: string }).permission === 'edit'
            const canEdit = isOwner
              || page.link_permission === 'edit'
              || sharedWithEdit
              || (memberWs != null && ['member', 'owner'].includes(memberWs._memberRole))
            ;(window as any).__pageCache = (window as any).__pageCache || new Map()
            ;(window as any).__pageCache.set(p.id, {
              page, isOwner, canEdit, userId: user.id,
            })
          }
        } catch {}
        setTimeout(warmNext, 100)
      })()
    }
    // Start warming after 500ms (let the UI render first)
    setTimeout(warmNext, 500)
  }, [currentWs.id, pages.length])

  // Restore last active workspace + page from localStorage
  useEffect(() => {
    const savedWs = localStorage.getItem('canopy_workspace')
    const savedPage = localStorage.getItem('canopy_last_page')
    if (savedWs) {
      const found = ([...workspaces, ...memberWorkspaces] as Workspace[]).find(w => w.id === savedWs)
      if (found && found.id !== currentWs.id) {
        // Load all pages for workspace (including those created by other members)
        supabase.from('pages')
          .select('id, workspace_id, parent_id, title, icon, position, is_database, link_permission, owner_id')
          .eq('workspace_id', found.id)
          .is('deleted_at', null)
          .order('position')
          .then(({ data }) => {
          if (data) {
            setPages(data.map(p => ({
              ...p, content: [], cover_url: '', created_at: '', updated_at: '',
              icon: p.icon || '', parent_id: p.parent_id ?? null,
              link_permission: p.link_permission || 'none',
            })))
          }
          setCurrentWs(found)
          if (savedPage && savedPage !== '/app' && pathname === '/app') {
            router.replace(savedPage)
          }
        })
      } else if (savedPage && savedPage !== '/app' && pathname === '/app') {
        router.replace(savedPage)
      }
    } else if (savedPage && savedPage !== '/app' && pathname === '/app') {
      router.replace(savedPage)
    }
  }, [])

  useEffect(() => {
    if (isMobile) setSidebarOpen(false)
    setNavigating(false)
  }, [pathname])

  // Realtime sync: new pages/databases created by other members appear instantly
  useEffect(() => {
    if (!currentWs.id) return
    const channel = supabase.channel(`ws_pages_${currentWs.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pages' }, (payload: any) => {
        const p = payload.new
        if (p.workspace_id !== currentWs.id) return
        setPages(prev => {
          if (prev.find(x => x.id === p.id)) return prev
          return [...prev, {
            ...p,
            content: [], cover_url: '',
            icon: p.icon || '', parent_id: p.parent_id ?? null,
            link_permission: p.link_permission || 'none',
          }]
        })
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pages' }, (payload: any) => {
        const p = payload.new
        if (p.workspace_id !== currentWs.id) return
        if (p.deleted_at) setPages(prev => prev.filter(x => x.id !== p.id))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'pages' }, (payload: any) => {
        const p = payload.old
        if (p.workspace_id !== currentWs.id) return
        setPages(prev => prev.filter(x => x.id !== p.id))
      })
      .subscribe()
    return () => { channel.unsubscribe() }
  }, [currentWs.id])

  // Remove pages from "Shared with me" when the owner revokes access or deletes the page
  useEffect(() => {
    const sharesChannel = supabase
      .channel(`my_shares_${user.id}`)
      .on('postgres_changes', {
        event: 'DELETE', schema: 'public', table: 'page_shares',
        filter: `user_id=eq.${user.id}`,
      }, (payload: any) => {
        const removedPageId: string = payload.old?.page_id
        if (!removedPageId) return
        setSharedPages(sp => {
          const toRemove = new Set<string>([removedPageId])
          let changed = true
          while (changed) {
            changed = false
            for (const p of sp) {
              if (p.parent_id && toRemove.has(p.parent_id) && !toRemove.has(p.id)) {
                toRemove.add(p.id); changed = true
              }
            }
          }
          return sp.filter(x => !toRemove.has(x.id))
        })
      })
      .subscribe()
    return () => { sharesChannel.unsubscribe() }
  }, [user.id])

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
    function onPageReady() { setNavigating(false) }
    window.addEventListener('canopy:pageReady', onPageReady)
    return () => window.removeEventListener('canopy:pageReady', onPageReady)
  }, [])

  useEffect(() => {
    function onNewSubPage(e: Event) {
      const d = (e as CustomEvent).detail
      if (!d?.id) return
      setSharedPages(sp => {
        if (sp.some(p => p.id === d.id)) return sp
        return [...sp, { id: d.id, title: d.title, icon: d.icon, owner_id: d.owner_id, permission: d.permission, parent_id: d.parent_id, workspace_id: d.workspace_id, is_database: d.is_database }]
      })
      if (d.parent_id) setExpandedShared(s => new Set([...s, d.parent_id]))
    }
    window.addEventListener('canopy:newSubPage', onNewSubPage)
    return () => window.removeEventListener('canopy:newSubPage', onNewSubPage)
  }, [])

  useEffect(() => {
    function onPageUpdate(e: any) {
      const { id, title, icon } = e.detail
      setPages(p => p.map(x => x.id === id ? { ...x, ...(title !== undefined ? { title } : {}), ...(icon !== undefined ? { icon } : {}) } : x))
    }
    window.addEventListener('canopy:pageUpdate', onPageUpdate)
    const onNavigate = (e: Event) => navigate((e as CustomEvent).detail.path)
    window.addEventListener('canopy:navigate', onNavigate)
    return () => {
      window.removeEventListener('canopy:pageUpdate', onPageUpdate)
      window.removeEventListener('canopy:navigate', onNavigate)
    }
  }, [])


  useEffect(() => {
    supabase.from('page_favorites').select('page_id').eq('user_id', user.id).then(({ data }) => {
      if (data) setFavoriteIds(new Set(data.map((f: any) => f.page_id)))
    })
  }, [])

  async function toggleFavorite(pageId: string) {
    if (favoriteIds.has(pageId)) {
      await supabase.from('page_favorites').delete().eq('user_id', user.id).eq('page_id', pageId)
      setFavoriteIds(s => { const n = new Set(s); n.delete(pageId); return n })
    } else {
      await supabase.from('page_favorites').insert({ user_id: user.id, page_id: pageId })
      setFavoriteIds(s => new Set([...s, pageId]))
    }
  }

  function navigate(path: string) {
    // Persist last page for refresh restore
    if (path.startsWith('/app')) localStorage.setItem('canopy_last_page', path)
    // Already on this path — clear any overlay but don't trigger loading state
    if (path === pathname) { setInstantPage(null); return }
    const pageId = path.match(/\/app\/page\/([^?]+)/)?.[1]
    if (pageId) {
      const cached = (window as any).__pageCache?.get(pageId)
      // Only use instant page when canEdit is definitively known (not null/undefined),
      // otherwise fall through to router.push so the route computes real permissions.
      if (cached && cached.canEdit != null) {
        // Show instantly from cache — no router navigation needed
        setInstantPage(cached)
        // Update URL silently
        window.history.pushState({}, '', path)
        // Update current page ID for sidebar highlight
        setNavigating(false)
        return
      }
    }
    setInstantPage(null)
    setNavigating(true)
    router.push(path)
  }

  const onExportDone = () => setExportMenu(null)

  function prefetch(path: string) { router.prefetch(path) }

  // Pre-warm page content cache on hover
  async function prewarmPage(pageId: string) {
    // Dispatch to the client page cache
    window.dispatchEvent(new CustomEvent('canopy:prewarm', { detail: { pageId } }))
  }

  async function movePageToWorkspace(pageId: string, targetWsId: string) {
    await supabase.from('pages').update({ workspace_id: targetWsId, parent_id: null }).eq('id', pageId)
    const { data: subIds } = await supabase.rpc('get_all_subpage_ids', { page_id: pageId })
    if (subIds) for (const row of subIds) {
      await supabase.from('pages').update({ workspace_id: targetWsId }).eq('id', row.id)
    }
    // Update local state: change workspace_id (don't remove from pages array)
    const movedIds = new Set([pageId, ...(subIds || []).map((s: any) => s.id)])
    setPages(p => p.map(x => movedIds.has(x.id) ? { ...x, workspace_id: targetWsId, parent_id: x.id === pageId ? null : x.parent_id } : x))
    // Switch to target workspace so user can see the moved page
    const targetWs = workspaces.find(w => w.id === targetWsId)
    if (targetWs) switchWorkspace(targetWs)
    setMoveToWsMenu(null)
    showToastMsg('Page moved to ' + (targetWs?.name || 'workspace'))
  }

  function showToastMsg(msg: string) { setToast({ msg, type: 'success' }); setTimeout(() => setToast(null), 2500) }
  function showError(msg: string) { setToast({ msg, type: 'error' }); setTimeout(() => setToast(null), 7000) }

  // ── PAGE ACTIONS ────────────────────────────────────────────
  async function createPage(parentId: string | null = null) {
    setContextMenu(null)
    setTemplatePicker({ parentId })
  }

  async function createPageWithTemplate(parentId: string | null, template: PageTemplate) {
    // If creating under a shared page, use that page's workspace, not the current user's
    const parentShared = parentId ? sharedPages.find(p => p.id === parentId) : null
    const targetWorkspaceId = parentShared?.workspace_id ?? currentWs.id

    const maxPos = pages.filter(p => p.parent_id === parentId).reduce((m, p) => Math.max(m, p.position), 0)
    const { data, error } = await supabase.from('pages').insert({
      workspace_id: targetWorkspaceId, parent_id: parentId, title: template.title,
      icon: template.icon, content: template.content, position: maxPos + 1, is_database: false, link_permission: 'none', owner_id: user.id
    }).select().single()
    if (error) { showError('Failed to create page'); return }
    if (data) {
      if (parentShared) {
        // Sub-page lives in the shared workspace — give current user access and add to shared list
        await supabase.from('page_shares').upsert(
          { page_id: data.id, user_id: user.id, permission: 'edit' },
          { onConflict: 'page_id,user_id' }
        )
        setSharedPages(sp => [...sp, { id: data.id, title: data.title, icon: data.icon || '', owner_id: data.owner_id, permission: 'edit', parent_id: parentId, workspace_id: targetWorkspaceId, is_database: false }])
        if (parentId) setExpandedShared(s => new Set([...s, parentId]))
      } else {
        setPages(p => [...p, data as Page])
        if (parentId) setExpandedPages(e => new Set([...e, parentId]))
      }
      const instantData = { page: data as Page, canEdit: true, isOwner: true, userId: user.id }
      if (!(window as any).__pageCache) (window as any).__pageCache = new Map()
      ;(window as any).__pageCache.set(data.id, instantData)
      setInstantPage(instantData)
      window.history.pushState({}, '', `/app/page/${data.id}`)
      setNavigating(false)
    }
  }

  async function duplicateSharedPage(pageId: string) {
    setContextMenu(null)
    const maxPos = pages.filter(p => !p.parent_id).reduce((m, p) => Math.max(m, p.position), 0)

    async function copyTree(srcId: string, newParentId: string | null, isRoot: boolean): Promise<string | null> {
      const { data: src } = await supabase.from('pages').select('*').eq('id', srcId).single()
      if (!src) return null
      const { data: copy, error } = await supabase.from('pages').insert({
        workspace_id: currentWs.id,
        parent_id: newParentId,
        title: isRoot ? (src.title || 'Untitled') + ' (copy)' : (src.title || ''),
        icon: src.icon,
        content: src.content,
        position: isRoot ? maxPos + 1 : src.position,
        is_database: src.is_database,
        link_permission: 'none',
        owner_id: user.id,
      }).select().single()
      if (error || !copy) return null
      setPages(p => [...p, copy as Page])
      const { data: children } = await supabase.from('pages')
        .select('id').eq('parent_id', srcId).is('deleted_at', null).order('position')
      if (children) {
        for (const child of children) await copyTree(child.id, copy.id, false)
      }
      return copy.id
    }

    const rootId = await copyTree(pageId, null, true)
    if (rootId) navigate(`/app/page/${rootId}`)
    else showError('Failed to duplicate page')
  }

  async function createDatabase(parentId: string | null = null) {
    const parentShared = parentId ? sharedPages.find(p => p.id === parentId) : null
    const targetWorkspaceId = parentShared?.workspace_id ?? currentWs.id
    const maxPos = [...pages, ...sharedPages].filter(p => p.parent_id === parentId).reduce((m, p) => Math.max(m, (p as any).position ?? 0), 0)
    const { data, error } = await supabase.from('pages').insert({
      workspace_id: targetWorkspaceId, parent_id: parentId, title: 'Untitled database',
      icon: '🗄️', content: [], position: maxPos + 1, is_database: true, link_permission: 'none'
    }).select().single()
    if (error) { showError('Failed to create database'); setContextMenu(null); return }
    if (data) {
      if (parentShared) {
        await supabase.from('page_shares').upsert({ page_id: data.id, user_id: user.id, permission: 'edit' }, { onConflict: 'page_id,user_id' })
        setSharedPages(sp => [...sp, { id: data.id, title: data.title, icon: data.icon || '', owner_id: data.owner_id, permission: 'edit', parent_id: parentId, workspace_id: targetWorkspaceId, is_database: true }])
        if (parentId) setExpandedShared(s => new Set([...s, parentId]))
      } else {
        setPages(p => [...p, data as Page])
      }
      navigate(`/app/page/${data.id}`)
    }
    setContextMenu(null)
  }

  async function deletePage(pageId: string) {
    const { error } = await supabase.from('pages').update({ deleted_at: new Date().toISOString() }).eq('id', pageId)
    if (error) { showError('Failed to delete page'); setContextMenu(null); return }
    // Collect all descendant IDs to remove from state
    const toRemove = new Set<string>([pageId])
    let prev = pages
    let changed = true
    while (changed) {
      changed = false
      for (const p of prev) {
        if (p.parent_id && toRemove.has(p.parent_id) && !toRemove.has(p.id)) {
          toRemove.add(p.id); changed = true
        }
      }
    }
    setPages(p => p.filter(x => !toRemove.has(x.id)))
    if (currentPageId && toRemove.has(currentPageId)) navigate('/app')
    // Remove shares for all deleted pages — this triggers realtime DELETE on page_shares
    // for every user who had access, removing the page from their "Shared with me"
    supabase.from('page_shares').delete().in('page_id', [...toRemove]).then(() => {})
    setContextMenu(null)
    showToastMsg('Page moved to trash')
  }

  async function loadTrash() {
    setTrashLoading(true)
    const { data } = await supabase
      .from('pages')
      .select('id, title, icon, deleted_at, workspace_id, parent_id, is_database, owner_id, position, cover_url, link_permission, created_at, updated_at')
      .eq('workspace_id', currentWs.id)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false })
    setTrashedPages((data || []).map(p => ({ ...p, content: [] })) as Page[])
    setTrashLoading(false)
  }

  async function restorePage(pageId: string) {
    const { error } = await supabase.from('pages').update({ deleted_at: null }).eq('id', pageId)
    if (error) { showError('Failed to restore page'); return }
    const restored = trashedPages.find(p => p.id === pageId)
    if (restored) setPages(prev => [...prev, { ...restored, deleted_at: null }])
    setTrashedPages(p => p.filter(x => x.id !== pageId))
    showToastMsg('Page restored')
  }

  async function permanentlyDeletePage(pageId: string) {
    const { error } = await supabase.from('pages').delete().eq('id', pageId)
    if (error) { showError('Failed to permanently delete page'); return }
    setTrashedPages(p => p.filter(x => x.id !== pageId))
  }

  async function emptyTrash() {
    const { error } = await supabase.from('pages').delete().eq('workspace_id', currentWs.id).not('deleted_at', 'is', null)
    if (error) { showError('Failed to empty trash'); return }
    setTrashedPages([])
    showToastMsg('Trash emptied')
  }

  async function duplicatePage(pageId: string) {
    const { data } = await supabase.from('pages').select('*').eq('id', pageId).single()
    if (!data) { showError('Page not found'); setContextMenu(null); return }
    const { data: copy, error } = await supabase.from('pages').insert({
      ...data, id: undefined, title: (data.title || 'Untitled') + ' (copy)', created_at: undefined, updated_at: undefined
    }).select().single()
    if (error) { showError('Failed to duplicate page'); setContextMenu(null); return }
    if (copy) { setPages(p => [...p, copy as Page]); navigate(`/app/page/${copy.id}`) }
    setContextMenu(null)
  }

  async function renamePage(pageId: string, title: string) {
    const { error } = await supabase.from('pages').update({ title }).eq('id', pageId)
    if (error) { showError('Failed to rename page'); return }
    setPages(p => p.map(x => x.id === pageId ? { ...x, title } : x))
    setSharedPages(sp => sp.map(x => x.id === pageId ? { ...x, title } : x))
    window.dispatchEvent(new CustomEvent('canopy:pageUpdate', { detail: { id: pageId, title } }))
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
    const { error } = await supabase.from('page_shares').delete().eq('page_id', pageId).eq('user_id', user.id)
    if (error) { showError('Failed to remove shared page'); return }
    setSharedPages(sp => sp.filter(p => p.id !== pageId))
    if (currentPageId === pageId) navigate('/app')
    setContextMenu(null)
  }

  // ── WORKSPACE ACTIONS ────────────────────────────────────────
  async function createWorkspace() {
    setNewWsName('')
    setNewWsIcon('🌿')
    setNewWsModal(true)
    setWsMenuOpen(false)
  }

  async function confirmCreateWorkspace() {
    if (!newWsName.trim()) return
    const { data, error } = await supabase.from('workspaces').insert({ name: newWsName.trim(), icon: newWsIcon, owner_id: user.id }).select().single()
    if (error) { showError('Failed to create workspace'); return }
    if (data) {
      const gettingStartedContent = {
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Welcome to ' + newWsName.trim() + '!' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'This is your workspace. Here are a few things you can do:' }] },
          { type: 'bulletList', content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Create pages' }, { type: 'text', text: ' — click the + button in the sidebar to add a new page.' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Create databases' }, { type: 'text', text: ' — use ⊞ in the sidebar to track structured data with table, board, and gallery views.' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Organise with drag & drop' }, { type: 'text', text: ' — reorder pages by dragging them in the sidebar.' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Invite teammates' }, { type: 'text', text: ' — open workspace settings to share access.' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Share pages' }, { type: 'text', text: ' — right-click any page to share it via a public link.' }] }] },
          ]},
          { type: 'paragraph', content: [{ type: 'text', text: 'Feel free to delete this page once you\'re up and running.' }] },
        ]
      }
      await supabase.from('pages').insert({ workspace_id: data.id, title: 'Getting started', icon: '👋', content: gettingStartedContent, position: 1, is_database: false, owner_id: user.id })
      setWorkspaces(w => [...w, data])
      switchWorkspace(data)
    }
    setNewWsModal(false)
  }

  async function deleteWorkspace(wsId: string) {
    if (!confirm('Delete this workspace and all its pages? This cannot be undone.')) return
    const { error: pagesErr } = await supabase.from('pages').delete().eq('workspace_id', wsId)
    if (pagesErr) { showError('Failed to delete workspace pages'); return }
    const { error } = await supabase.from('workspaces').delete().eq('id', wsId)
    if (error) { showError('Failed to delete workspace'); return }
    setWorkspaces(w => w.filter(x => x.id !== wsId))
    if (currentWs.id === wsId) { const next = workspaces.find(w => w.id !== wsId); if (next) switchWorkspace(next) }
  }

  async function renameWorkspace(name: string) {
    await supabase.from('workspaces').update({ name }).eq('id', currentWs.id)
    setCurrentWs(w => ({ ...w, name }))
    setWorkspaces(ws => ws.map(w => w.id === currentWs.id ? { ...w, name } : w))
    setRenamingWs(false)
  }

  async function switchWorkspace(ws: Workspace | MemberWorkspace) {
    setCurrentWs(ws)
    localStorage.setItem('canopy_workspace', ws.id)
    setWsMenuOpen(false)
    setNavigating(true)

    // Load all pages for workspace (including those created by other members)
    const { data: wsPages } = await supabase
      .from('pages')
      .select('id, workspace_id, parent_id, title, icon, position, is_database, link_permission, owner_id')
      .eq('workspace_id', ws.id)
      .is('deleted_at', null)
      .order('position')
    setPages((wsPages || []).map(p => ({
      ...p,
      content: [], cover_url: '', created_at: '', updated_at: '',
      icon: p.icon || '', parent_id: p.parent_id ?? null,
      link_permission: p.link_permission || 'none',
    })))

    setNavigating(false)
    if (isMobile) setSidebarOpen(false)
    navigate('/app')
  }


  async function loadWsMembers() {
    const { data, error } = await supabase
      .from('workspace_members')
      .select('id, user_id, role, workspace_id')
      .eq('workspace_id', currentWs.id)
    if (error) { console.error('loadWsMembers:', error); return }
    if (!data || data.length === 0) { setWsMembers([]) }
    else {
      // Enrich with profile data
      const userIds = data.map(m => m.user_id)
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, email, full_name')
        .in('id', userIds)
      const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p]))
      setWsMembers(data.map(m => ({ ...m, profile: profileMap[m.user_id] || null })))
    }
    // Load pending invites (invited_email set, not yet accepted)
    const { data: invites } = await supabase
      .from('workspace_invites')
      .select('id, invited_email, role, expires_at')
      .eq('workspace_id', currentWs.id)
      .not('invited_email', 'is', null)
    setPendingInvites((invites ?? []).filter(i => new Date(i.expires_at) > new Date()) as PendingInvite[])
  }

  async function inviteMember() {
    const email = inviteEmail.trim().toLowerCase()
    if (!email) return

    const res = await fetch('/api/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, workspace_id: currentWs.id, role: inviteRole })
    })

    if (!res.ok) {
      const { error: msg } = await res.json()
      showError('Error: ' + (msg ?? 'unknown error'))
      return
    }

    const body = await res.json()
    setInviteEmail('')
    await loadWsMembers()

    if (body.alreadyMember) {
      showToastMsg('Already a member')
    } else if (body.addedDirectly) {
      // Confirmed account → notify them in-app
      fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: body.userId,
          type: 'workspace_invite',
          title: `Added to workspace "${currentWs.name}"`,
          body: `${user.name} invited you as ${inviteRole === 'member' ? 'member' : 'viewer'}.`,
          data: { workspace_id: currentWs.id, workspace_name: currentWs.name }
        })
      }).catch(() => {})
      showToastMsg('Member added!')
    } else if (body.alreadyInvited) {
      await navigator.clipboard.writeText(body.inviteLink).catch(() => {})
      showToastMsg('Already invited — link copied to clipboard!')
    } else {
      showToastMsg('Invitation email sent!')
    }
  }

  async function removeMember(userId: string) {
    await supabase.from('workspace_members').delete().eq('workspace_id', currentWs.id).eq('user_id', userId)
    loadWsMembers()
  }

  async function saveProfile() {
    await supabase.from('profiles').update({ full_name: profileName }).eq('id', user.id)
    showToastMsg('Profile saved!')
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
  const [dropPosition, setDropPosition] = useState<{ id: string; side: 'above' | 'below' | 'inside' } | null>(null)

  function handleDragStart(e: React.DragEvent, pageId: string) {
    setDraggingId(pageId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('pageId', pageId)
  }

  function handleDragOverPage(e: React.DragEvent, pageId: string) {
    e.preventDefault()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const y = e.clientY - rect.top
    const pct = y / rect.height
    // Top 25% = above, bottom 25% = below, middle = inside (nest)
    if (pct < 0.3) setDropPosition({ id: pageId, side: 'above' })
    else if (pct > 0.7) setDropPosition({ id: pageId, side: 'below' })
    else setDropPosition({ id: pageId, side: 'inside' })
    setDragOverId(pageId)
  }

  async function handleDropOnPage(e: React.DragEvent, targetPageId: string) {
    e.preventDefault()
    const draggedId = e.dataTransfer.getData('pageId')
    if (!draggedId || draggedId === targetPageId) { resetDrag(); return }
    const pos = dropPosition
    if (!pos) { resetDrag(); return }

    if (pos.side === 'inside') {
      // Nest inside target
      await movePage(draggedId, targetPageId)
    } else {
      // Reorder: move to same parent as target, adjust position
      const target = pages.find(p => p.id === targetPageId)
      if (!target) { resetDrag(); return }
      await movePage(draggedId, target.parent_id ?? null)
      // Update positions
      const siblings = pages.filter(p => p.parent_id === (target.parent_id ?? null) && p.id !== draggedId)
        .sort((a, b) => a.position - b.position)
      const targetIdx = siblings.findIndex(p => p.id === targetPageId)
      const insertIdx = pos.side === 'above' ? targetIdx : targetIdx + 1
      const newOrder = [...siblings.slice(0, insertIdx), { id: draggedId, position: 0 }, ...siblings.slice(insertIdx)]
      for (let i = 0; i < newOrder.length; i++) {
        if (newOrder[i].id !== draggedId) {
          await supabase.from('pages').update({ position: (i + 1) * 10 }).eq('id', newOrder[i].id)
        } else {
          await supabase.from('pages').update({ position: (i + 1) * 10 }).eq('id', draggedId)
        }
      }
      setPages(p => p.map(x => {
        const idx = newOrder.findIndex(n => n.id === x.id)
        return idx >= 0 ? { ...x, position: (idx + 1) * 10 } : x
      }))
    }
    resetDrag()
  }

  function resetDrag() { setDragOverId(null); setDraggingId(null); setDropPosition(null) }

  function handleDrop(e: React.DragEvent, targetId: string | null) {
    e.preventDefault()
    const id = e.dataTransfer.getData('pageId')
    if (id && id !== targetId) movePage(id, targetId)
    resetDrag()
  }

  // ── RENDER PAGE TREE ─────────────────────────────────────────
  // Build ordered flat list of visible pages for keyboard nav
  function getFlatVisiblePages(): Page[] {
    const result: Page[] = []
    function walk(parentId: string | null) {
      pages
        .filter(p => p.parent_id === parentId && p.workspace_id === currentWs.id)
        .sort((a, b) => a.position - b.position)
        .forEach(p => { result.push(p); if (expandedPages.has(p.id)) walk(p.id) })
    }
    walk(null)
    return result
  }

  function handleSidebarKeyDown(e: React.KeyboardEvent) {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(e.key)) return
    e.preventDefault()
    const flat = getFlatVisiblePages()
    if (flat.length === 0) return
    const curIdx = keyFocusId ? flat.findIndex(p => p.id === keyFocusId) : -1

    if (e.key === 'ArrowDown') {
      const next = flat[Math.min(curIdx + 1, flat.length - 1)]
      setKeyFocusId(next.id)
      setTimeout(() => sidebarTreeRef.current?.querySelector(`[data-page-id="${next.id}"]`)?.scrollIntoView({ block: 'nearest' }), 0)
    } else if (e.key === 'ArrowUp') {
      if (curIdx <= 0) return
      const prev = flat[curIdx - 1]
      setKeyFocusId(prev.id)
      setTimeout(() => sidebarTreeRef.current?.querySelector(`[data-page-id="${prev.id}"]`)?.scrollIntoView({ block: 'nearest' }), 0)
    } else if (e.key === 'Enter' && keyFocusId) {
      navigate(`/app/page/${keyFocusId}`)
    } else if (e.key === 'ArrowRight' && keyFocusId) {
      const hasChildren = pages.some(p => p.parent_id === keyFocusId)
      if (hasChildren && !expandedPages.has(keyFocusId))
        setExpandedPages(s => { const n = new Set(s); n.add(keyFocusId); return n })
      else if (!hasChildren)
        navigate(`/app/page/${keyFocusId}`)
    } else if (e.key === 'ArrowLeft' && keyFocusId) {
      if (expandedPages.has(keyFocusId)) {
        setExpandedPages(s => { const n = new Set(s); n.delete(keyFocusId); return n })
      } else {
        const p = pages.find(x => x.id === keyFocusId)
        if (p?.parent_id) setKeyFocusId(p.parent_id)
      }
    }
  }

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
            isKeyFocused={keyFocusId === page.id}
            onRenameChange={setRenameVal}
            onRenameSubmit={() => renamePage(page.id, renameVal)}
            onRenameCancel={() => setRenamingPageId(null)}
            onToggle={() => setExpandedPages(s => { const n = new Set(s); n.has(page.id) ? n.delete(page.id) : n.add(page.id); return n })}
            onClick={() => { navigate(`/app/page/${page.id}`) }}
            onHover={() => { prefetch(`/app/page/${page.id}`); prewarmPage(page.id) }}
            onDragStart={(e: React.DragEvent) => handleDragStart(e, page.id)}
            onDragOver={(e: React.DragEvent) => handleDragOverPage(e, page.id)}
            onDragLeave={() => { setDragOverId(null); setDropPosition(null) }}
            onDrop={(e: React.DragEvent) => handleDropOnPage(e, page.id)}
            onDragEnd={() => { setDraggingId(null); setDragOverId(null) }}
            onContextMenu={(e: React.MouseEvent) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, pageId: page.id }) }}
            onAddSubpage={() => createPage(page.id)}
            onMoreMenu={(e: React.MouseEvent) => { e.stopPropagation(); setContextMenu({ x: (e.target as HTMLElement).getBoundingClientRect().right, y: (e.target as HTMLElement).getBoundingClientRect().bottom + 4, pageId: page.id }) }}
            isDragging={draggingId === page.id}
            dropIndicator={dragOverId === page.id ? dropPosition?.side : undefined}
            isFavorite={favoriteIds.has(page.id)}
            onToggleFavorite={() => toggleFavorite(page.id)}
          />
          {isExpanded && <div>{renderPageTree(page.id, depth + 1)}</div>}
        </div>
      )
    })
  }

  function renderSharedTree(parentId: string | null, depth = 0): React.ReactNode {
    const children = sharedPages.filter(p => p.parent_id === parentId)
    return children.map(page => renderSharedPage(page, depth))
  }

  function renderSharedPage(page: typeof sharedPages[0], depth: number): React.ReactNode {
    const hasChildren = sharedPages.some(p => p.parent_id === page.id)
    const isExpanded = expandedShared.has(page.id)
    const isActive = currentPageId === page.id
    return (
      <div key={page.id}>
        <PageRow
          page={page} depth={depth} isActive={isActive} isDragOver={false}
          hasChildren={hasChildren} isExpanded={isExpanded}
          isRenaming={renamingPageId === page.id} renameVal={renameVal}
          onRenameChange={setRenameVal}
          onRenameSubmit={() => renamePage(page.id, renameVal)}
          onRenameCancel={() => setRenamingPageId(null)}
          onToggle={() => setExpandedShared(s => { const n = new Set(s); n.has(page.id) ? n.delete(page.id) : n.add(page.id); return n })}
          onClick={() => navigate(`/app/page/${page.id}`)}
          onDragStart={() => {}} onDragOver={() => {}} onDragLeave={() => {}} onDrop={() => {}} onDragEnd={() => {}}
          onContextMenu={(e: React.MouseEvent) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, pageId: page.id }) }}
          onAddSubpage={page.permission === 'edit' ? () => createPage(page.id) : undefined}
          onMoreMenu={(e: React.MouseEvent) => { e.stopPropagation(); const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); setContextMenu({ x: r.right + 4, y: r.bottom, pageId: page.id }) }}
          isDragging={false}
          badge={page.permission === 'edit' ? 'edit' : 'view'}
          isShared={true}
        />
        {isExpanded && <div>{renderSharedTree(page.id, depth + 1)}</div>}
      </div>
    )
  }

  const breadcrumbs = useMemo(() => {
    if (!currentPageId) return []
    const crumbs: { id: string; title: string; icon: string }[] = []
    let cur = pages.find(p => p.id === currentPageId)
    while (cur) {
      crumbs.unshift({ id: cur.id, title: cur.title || 'Untitled', icon: cur.icon || (cur.is_database ? '🗄️' : '📄') })
      cur = cur.parent_id ? pages.find(p => p.id === cur!.parent_id) : undefined
    }
    return crumbs
  }, [currentPageId, pages])

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg)' }}>
      {isMobile && sidebarOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 39, cursor: 'pointer', touchAction: 'none' }}
          onTouchMove={e => e.preventDefault()}
          onTouchEnd={e => { e.preventDefault(); setSidebarOpen(false) }}
          onClick={() => setSidebarOpen(false)}
        />
      )}
      {/* SIDEBAR */}
      <aside
        style={{
          width: sidebarOpen ? '256px' : '0', minWidth: sidebarOpen ? '256px' : '0',
          background: 'var(--sidebar-bg)', borderRight: '1px solid var(--side-border)',
          color: 'var(--side-text)',
          display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden',
          transition: 'width 0.2s, min-width 0.2s', flexShrink: 0,
          ...(isMobile ? { position: 'fixed', left: 0, top: 0, bottom: 0, height: 'auto', zIndex: 300, boxShadow: '4px 0 24px rgba(0,0,0,0.15)' } : {}),
        }}
        onTouchStart={isMobile ? e => { (e.currentTarget as any)._swipeStartX = e.touches[0].clientX } : undefined}
        onTouchEnd={isMobile ? e => {
          const startX = (e.currentTarget as any)._swipeStartX ?? 0
          if (e.changedTouches[0].clientX - startX < -50) setSidebarOpen(false)
        } : undefined}
      >
        {/* Home + Workspace switcher */}
        <div style={{ padding: '10px 8px 4px', flexShrink: 0 }}>
          {/* Logo row */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '8px 10px 12px' }}>
            <button onClick={() => navigate('/app')}
              style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, background: 'none', border: 'none', cursor: 'pointer', minWidth: 0 }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.75' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1' }}>
              <img src="/canopy_favicon_no_bg.ico" alt="Canopy" style={{ width: 30, height: 30, objectFit: 'contain', flexShrink: 0 }} />
              <span style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--font-head)', letterSpacing: '-0.01em', transform: 'translateY(1.5px)', display: 'inline-block' }}>Canopy</span>
            </button>
            {isMobile && (
              <button
                onClick={() => setSidebarOpen(false)}
                style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '22px', lineHeight: 1, padding: '10px 12px', borderRadius: '6px', touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent', minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                aria-label="Close sidebar"
              >×</button>
            )}
          </div>
          <div onClick={() => setWsMenuOpen(o => !o)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px', borderRadius: '6px', cursor: 'pointer', userSelect: 'none' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)'; setWsRowHovered(true) }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; setWsRowHovered(false) }}>
            <div style={{ width: 26, height: 26, borderRadius: '6px', background: 'var(--sidebar-active)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', lineHeight: 1, flexShrink: 0 }}>{currentWs.icon}</div>
            {renamingWs ? (
              <input autoFocus value={wsNameInput} onChange={e => setWsNameInput(e.target.value)}
                onBlur={() => renameWorkspace(wsNameInput)}
                onKeyDown={e => { if (e.key === 'Enter') renameWorkspace(wsNameInput); if (e.key === 'Escape') setRenamingWs(false) }}
                onClick={e => e.stopPropagation()}
                style={{ flex: 1, border: 'none', background: 'transparent', fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 600, color: 'var(--text)', outline: 'none', borderBottom: '1px solid var(--accent)' }} />
            ) : (
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }}>{currentWs.name}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Workspace</div>
              </div>
            )}
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: '1px' }} xmlns="http://www.w3.org/2000/svg">
              <path d="M4 6l4 4 4-4" stroke="var(--text-tertiary)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>

          {wsMenuOpen && (
            <div style={{ position: 'absolute', top: '54px', left: '8px', width: '250px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', zIndex: 200, padding: '6px' }} className="scale-in">
              <MenuItem onClick={() => { setWsMenuOpen(false); setWsSettingsTab('general'); setWsSettingsOpen(true); loadWsMembers() }}><Icon name="gear" size={15} /> Workspace settings</MenuItem>
              <MenuItem onClick={() => { setWsMenuOpen(false); setWsSettingsTab('members'); setWsSettingsOpen(true); loadWsMembers() }}><Icon name="users" size={15} /> Invite members</MenuItem>
              <MenuItem onClick={() => { setWsMenuOpen(false); createWorkspace() }}><Icon name="plus" size={15} /> New workspace</MenuItem>
              <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
              {workspaces.map(ws => (
                <div key={ws.id} onClick={() => switchWorkspace(ws)}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px', borderRadius: '5px', cursor: 'pointer', background: ws.id === currentWs.id ? 'var(--sidebar-active)' : 'transparent' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ws.id === currentWs.id ? 'var(--sidebar-active)' : 'transparent' }}>
                  <span style={{ fontSize: '16px' }}>{ws.icon}</span>
                  <span style={{ flex: 1, fontSize: '13px', fontWeight: 500 }}>{ws.name}</span>
                  {ws.id === currentWs.id && <span style={{ fontSize: '14px', color: 'var(--accent)', fontWeight: 700, lineHeight: 1 }}>✓</span>}
                </div>
              ))}
              <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
              {memberWorkspaces.length > 0 && <>
                <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
                <div style={{ padding: '4px 12px 2px', fontSize: '10.5px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Shared with me</div>
                {memberWorkspaces.map((ws) => (
                  <div key={ws.id} onClick={() => { switchWorkspace(ws); setWsMenuOpen(false) }}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px', borderRadius: '5px', cursor: 'pointer', background: ws.id === currentWs.id ? 'var(--sidebar-active)' : 'transparent' }}
                    onMouseEnter={e => { if (ws.id !== currentWs.id) (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)' }}
                    onMouseLeave={e => { if (ws.id !== currentWs.id) (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
                    <span style={{ fontSize: '20px', flexShrink: 0 }}>{ws.icon}</span>
                    <span style={{ flex: 1, fontSize: '13px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ws.name}</span>
                    <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '8px', background: 'var(--sidebar-active)', color: 'var(--text-tertiary)', flexShrink: 0 }}>{ws._memberRole}</span>
                    {ws.id === currentWs.id && <span style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: 700 }}>✓</span>}
                  </div>
                ))}
              </>}
            </div>
          )}
        </div>
        {/* Quick actions */}
        <div style={{ padding: '8px 10px 8px', display: 'flex', gap: '4px', flexShrink: 0 }}>
          <QuickBtn onClick={() => createPage(null)} title="New page" flex>
            <span style={{ fontSize: '14px' }}>📄</span>
            <span style={{ fontSize: '12.5px' }}>New page</span>
          </QuickBtn>
          <QuickBtn onClick={() => createDatabase(null)} title="New database" flex>
            <span style={{ fontSize: '14px' }}>🗄️</span>
            <span style={{ fontSize: '12.5px' }}>New database</span>
          </QuickBtn>
        </div>

        {/* Pages tree */}
        <div ref={sidebarTreeRef} tabIndex={0} onKeyDown={handleSidebarKeyDown}
          style={{ flex: 1, overflowY: 'auto', paddingBottom: '8px', outline: 'none', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' } as React.CSSProperties}>
          {/* Favorites */}
          {favoriteIds.size > 0 && (() => {
            const favPages = [...pages, ...sharedPages].filter(p => favoriteIds.has(p.id))
            if (favPages.length === 0) return null
            return (
              <>
                <div style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '8px 14px 3px', gap: '4px' }}
                  onClick={() => setFavoritesCollapsed(o => !o)}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--side-text-2)', textTransform: 'uppercase', letterSpacing: '.05em', flex: 1, userSelect: 'none', fontFamily: 'var(--font-body)', opacity: 0.68 }}>Favorites</div>
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, transition: 'transform 0.15s', transform: favoritesCollapsed ? 'rotate(-90deg)' : 'none', marginRight: '2px' }}>
                    <path d="M4 6l4 4 4-4" stroke="var(--text-tertiary)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                {!favoritesCollapsed && favPages.map(p => (
                  <div key={p.id}
                    onClick={() => navigate(`/app/page/${p.id}`)}
                    onContextMenu={e => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, pageId: p.id }) }}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 14px 5px 16px', cursor: 'pointer', borderRadius: '5px', margin: '0 6px', background: currentPageId === p.id ? 'var(--sidebar-active)' : 'transparent', fontSize: '13.5px' }}
                    onMouseEnter={e => { if (currentPageId !== p.id) (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = currentPageId === p.id ? 'var(--sidebar-active)' : 'transparent' }}>
                    <span style={{ flexShrink: 0, fontSize: '14px' }}>{p.icon || '📄'}</span>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title || 'Untitled'}</span>
                    <span onClick={e => { e.stopPropagation(); toggleFavorite(p.id) }} title="Remove from favorites"
                      style={{ flexShrink: 0, color: 'var(--accent)', fontSize: '13px', lineHeight: 1, opacity: 0.7 }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '1' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '0.7' }}>★</span>
                  </div>
                ))}
                <div style={{ margin: '6px 12px 0', borderTop: '1px solid var(--border)' }} />
              </>
            )
          })()}
          <SectionLabel>Pages</SectionLabel>
          <div onDragOver={e => e.preventDefault()} onDrop={e => handleDrop(e, null)} style={{ minHeight: '4px' }} />
          {renderPageTree(null)}
          {sharedPages.length > 0 && (
            <>
              <div style={{ margin: '10px 12px 0', borderTop: '1px solid var(--border)' }} />
              <div style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '8px 14px 3px', gap: '4px' }}
                onClick={() => setSharedCollapsed(o => !o)}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--side-text-2)', textTransform: 'uppercase', letterSpacing: '.05em', flex: 1, userSelect: 'none', fontFamily: 'var(--font-body)', opacity: 0.68 }}>Shared with me</div>
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, transition: 'transform 0.15s', transform: sharedCollapsed ? 'rotate(-90deg)' : 'none', marginRight: '2px' }}>
                  <path d="M4 6l4 4 4-4" stroke="var(--text-tertiary)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              {!sharedCollapsed && renderSharedTree(null)}
            </>
          )}
        </div>

        {/* Trash */}
        <div style={{ borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          <div onClick={() => { setTrashOpen(o => !o); if (!trashOpen) loadTrash() }}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', cursor: 'pointer', fontSize: '13px', color: 'var(--side-text)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--side-hover)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}>
            <Icon name="trash" size={14} style={{ color: 'var(--side-text-2)', flexShrink: 0 }} />
            <span style={{ flex: 1, fontFamily: 'var(--font-body)', fontSize: '13px' }}>Trash</span>
            {trashedPages.length > 0 && <span style={{ fontSize: '11px', color: 'var(--side-text-2)' }}>{trashedPages.length}</span>}
            <span style={{ color: 'var(--side-text-2)', transition: 'transform 0.15s', transform: trashOpen ? 'rotate(90deg)' : 'none', display: 'flex' }}><Icon name="chev-right" size={12} /></span>
          </div>
          {trashOpen && (
            <div style={{ background: 'var(--sidebar-bg)', borderBottom: '1px solid var(--border)', maxHeight: '280px', overflowY: 'auto' }}>
              {trashLoading ? (
                <div style={{ padding: '12px 14px', fontSize: '12px', color: 'var(--text-tertiary)' }}>Loading…</div>
              ) : trashedPages.length === 0 ? (
                <div style={{ padding: '16px 14px', fontSize: '12px', color: 'var(--text-tertiary)', textAlign: 'center' }}>Trash is empty</div>
              ) : (
                <>
                  <div style={{ padding: '6px 14px', display: 'flex', justifyContent: 'flex-end' }}>
                    <span onClick={() => { if (confirm('Permanently delete all trashed pages? This cannot be undone.')) emptyTrash() }}
                      style={{ fontSize: '11px', color: 'var(--text-tertiary)', cursor: 'pointer', padding: '2px 6px', borderRadius: 4 }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#eb5757' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-tertiary)' }}>
                      Empty trash
                    </span>
                  </div>
                  {trashedPages.map(p => (
                    <div key={p.id} className="trash-item" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 10px 5px 14px', fontSize: '13px', color: 'var(--side-text)', position: 'relative' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--side-hover)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}>
                      <span style={{ flexShrink: 0, fontSize: '14px', lineHeight: 1 }}>{p.icon || <Icon name="doc" size={13} style={{ color: 'var(--side-text-2)' }} />}</span>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title || 'Untitled'}</span>
                      <span className="t-acts" style={{ display: 'flex', gap: '1px', flexShrink: 0 }}>
                        <span title="Restore" onClick={() => restorePage(p.id)}
                          style={{ cursor: 'pointer', padding: '3px 6px', borderRadius: 5, color: 'var(--side-text-2)', display: 'flex', alignItems: 'center' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--accent-light)'; (e.currentTarget as HTMLElement).style.color = 'var(--accent)' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; (e.currentTarget as HTMLElement).style.color = 'var(--side-text-2)' }}>
                          <Icon name="restore" size={14} />
                        </span>
                        <span title="Delete permanently" onClick={() => { if (confirm('Permanently delete this page?')) permanentlyDeletePage(p.id) }}
                          style={{ cursor: 'pointer', padding: '3px 6px', borderRadius: 5, color: 'var(--side-text-2)', display: 'flex', alignItems: 'center' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#eb575718'; (e.currentTarget as HTMLElement).style.color = '#eb5757' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; (e.currentTarget as HTMLElement).style.color = 'var(--side-text-2)' }}>
                          <Icon name="trash" size={14} />
                        </span>
                      </span>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {/* User — click for settings, separate sign out button */}
        <div style={{ padding: '8px 10px', paddingBottom: isMobile ? 'calc(8px + env(safe-area-inset-bottom))' : '8px', borderTop: '1px solid var(--border)', flexShrink: 0, position: 'relative' }}>
          <div onClick={() => setUserMenuOpen(o => !o)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', borderRadius: '7px', cursor: 'pointer' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--side-hover)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}>
            <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: '#fff', flexShrink: 0 }}>
              {user.name[0]?.toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--side-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-body)' }}>{user.name}</div>
              <div style={{ fontSize: '11px', color: 'var(--side-text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</div>
            </div>
          </div>

          {/* User settings menu */}
          {userMenuOpen && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 299 }} onClick={() => setUserMenuOpen(false)} />
              <div style={{ position: 'absolute', bottom: 'calc(100% + 2px)', left: '9px', right: '9px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', boxShadow: '0 -10px 30px rgba(0,0,0,.14)', zIndex: 300, padding: '6px' }} className="scale-in">
                {/* Avatar header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '6px 7px 8px', borderBottom: '1px solid var(--border)', marginBottom: '4px' }}>
                  <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 600, color: '#fff', flexShrink: 0 }}>
                    {user.name[0]?.toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>{user.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</div>
                  </div>
                </div>
                <MenuItem onClick={() => { setUserMenuOpen(false); setSettingsTab('profile'); setSettingsOpen(true) }}><Icon name="gear" size={15} /> Settings</MenuItem>
                <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
                <MenuItem onClick={() => { handleSignOut(); setUserMenuOpen(false) }}><Icon name="power" size={15} /> Sign out</MenuItem>
              </div>
            </>
          )}
        </div>
      </aside>

      {/* MAIN */}
      <main
        style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}
        onTouchStart={e => { (e.currentTarget as any)._touchStartX = e.touches[0].clientX }}
        onTouchEnd={e => {
          const startX = (e.currentTarget as any)._touchStartX ?? 999
          if (isMobile && !sidebarOpen && startX < 24 && e.changedTouches[0].clientX - startX > 60) setSidebarOpen(true)
        }}
      >
        {/* Top bar */}
        <div style={{ height: '52px', padding: '0 16px', borderBottom: '1px solid var(--border)', background: 'var(--topbar-bg)', backdropFilter: 'saturate(180%) blur(8px)', WebkitBackdropFilter: 'saturate(180%) blur(8px)', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, position: 'sticky', top: 0, zIndex: 10 }}>
          <button onClick={() => setSidebarOpen(o => !o)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '18px', padding: isMobile ? '10px 12px' : '4px 6px', borderRadius: '4px', lineHeight: 1, flexShrink: 0, touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent', minWidth: isMobile ? '44px' : undefined, minHeight: isMobile ? '44px' : undefined, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}
            title="Toggle sidebar"><Icon name="menu" size={17} /></button>

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

          {/* Font zoom controls */}
          <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0, border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden' }}>
            <button
              onClick={() => { const i = ZOOM_LEVELS.indexOf(zoom); if (i > 0) { const v = ZOOM_LEVELS[i-1]; setZoom(v); localStorage.setItem('canopy_zoom', String(v)) } }}
              disabled={zoom === ZOOM_LEVELS[0]}
              style={{ background: 'none', border: 'none', cursor: zoom === ZOOM_LEVELS[0] ? 'default' : 'pointer', color: zoom === ZOOM_LEVELS[0] ? 'var(--text-tertiary)' : 'var(--text-secondary)', fontSize: isMobile ? '16px' : '14px', fontWeight: 400, padding: isMobile ? '10px 14px' : '5px 8px', fontFamily: 'var(--font-sans)', lineHeight: 1, borderRight: '1px solid var(--border)', touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' as any, minWidth: isMobile ? '44px' : undefined, minHeight: isMobile ? '44px' : undefined, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onMouseEnter={e => { if (zoom !== ZOOM_LEVELS[0]) (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}
              title="Smaller text">−</button>
            {!isMobile && (
              <button
                onClick={() => { setZoom(1.0); localStorage.setItem('canopy_zoom', '1') }}
                style={{ background: zoom !== 1.0 ? 'var(--accent-light)' : 'none', border: 'none', cursor: zoom !== 1.0 ? 'pointer' : 'default', color: zoom !== 1.0 ? 'var(--accent)' : 'var(--text-tertiary)', fontSize: '11px', fontWeight: 500, padding: '5px 6px', fontFamily: 'var(--font-sans)', lineHeight: 1, minWidth: '34px', textAlign: 'center' }}
                title={zoom !== 1.0 ? 'Reset to 100%' : 'Text size'}>{Math.round(zoom * 100)}%</button>
            )}
            <button
              onClick={() => { const i = ZOOM_LEVELS.indexOf(zoom); if (i < ZOOM_LEVELS.length - 1) { const v = ZOOM_LEVELS[i+1]; setZoom(v); localStorage.setItem('canopy_zoom', String(v)) } }}
              disabled={zoom === ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}
              style={{ background: 'none', border: 'none', cursor: zoom === ZOOM_LEVELS[ZOOM_LEVELS.length-1] ? 'default' : 'pointer', color: zoom === ZOOM_LEVELS[ZOOM_LEVELS.length-1] ? 'var(--text-tertiary)' : 'var(--text-secondary)', fontSize: isMobile ? '16px' : '14px', fontWeight: 400, padding: isMobile ? '10px 14px' : '5px 8px', fontFamily: 'var(--font-sans)', lineHeight: 1, borderLeft: '1px solid var(--border)', touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' as any, minWidth: isMobile ? '44px' : undefined, minHeight: isMobile ? '44px' : undefined, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onMouseEnter={e => { if (zoom !== ZOOM_LEVELS[ZOOM_LEVELS.length-1]) (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}
              title="Larger text">+</button>
          </div>

          {/* Cmd+K button */}
          <button
            onClick={() => setSearchOpen(true)}
            style={{ background: 'var(--hover)', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '13px', padding: isMobile ? '10px 12px' : '5px 10px', borderRadius: 'var(--radius)', fontFamily: 'var(--font-body)', fontWeight: 400, display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, whiteSpace: 'nowrap', transition: 'border-color 0.12s', touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent', minHeight: isMobile ? '44px' : undefined }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-strong)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
            title="Search pages (⌘K)">
            <Icon name="search" size={14} />
            {!isMobile && <>Search <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10.5px', padding: '2px 5px', borderRadius: '4px', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)', lineHeight: 1 }}>⌘K</span></>}
          </button>

          {/* Notification bell */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <button
              onClick={() => { const opening = !notifOpen; setNotifOpen(o => !o); if (opening) markAllRead() }}
              style={{ position: 'relative', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: isMobile ? '10px 12px' : '5px 7px', borderRadius: '6px', fontSize: '18px', lineHeight: 1, display: 'flex', alignItems: 'center', touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent', minWidth: isMobile ? '44px' : undefined, minHeight: isMobile ? '44px' : undefined, justifyContent: 'center' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}
              title="Notifications">
              <Icon name="bell" size={18} />
              {unreadCount > 0 && (
                <span style={{ position: 'absolute', top: '2px', right: '2px', minWidth: '15px', height: '15px', borderRadius: '50%', background: '#eb5757', color: '#fff', fontSize: '9px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, padding: '0 2px' }}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            {notifOpen && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 199 }} onClick={() => setNotifOpen(false)} />
                <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 'min(300px, calc(100vw - 16px))', maxHeight: '380px', overflowY: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', boxShadow: 'var(--shadow-lg)', zIndex: 200 }} className="scale-in">
                  <div style={{ padding: '11px 14px', fontWeight: 600, fontSize: '13px', borderBottom: '1px solid var(--border)', color: 'var(--text)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Notifications</span>
                    {notifications.length > 0 && (
                      <button onClick={clearAllNotifications} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', color: 'var(--text-tertiary)', padding: '2px 6px', borderRadius: '4px', fontFamily: 'var(--font-sans)' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-tertiary)' }}>
                        Clear all
                      </button>
                    )}
                  </div>
                  {browserPermission !== 'denied' && (
                    <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {pushEnabled ? 'Push notifications on' : 'Get notified when you\'re away'}
                      </span>
                      <button
                        onClick={browserPermission === 'granted' ? togglePush : requestBrowserPermission}
                        style={{ flexShrink: 0, background: pushEnabled ? 'var(--sidebar-hover)' : 'var(--accent)', color: pushEnabled ? 'var(--text)' : '#fff', border: pushEnabled ? '1px solid var(--border)' : 'none', borderRadius: 5, padding: '4px 10px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                        {pushEnabled ? 'Turn off' : 'Enable'}
                      </button>
                    </div>
                  )}
                  {notifications.length === 0 ? (
                    <div style={{ padding: '28px 14px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '13px' }}>No notifications</div>
                  ) : notifications.map(n => {
                    const isClickable = !!(n.data?.page_id || n.data?.workspace_id)
                    return (
                    <div key={n.id}
                      style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', background: n.read ? 'transparent' : 'var(--accent-light)', cursor: isClickable ? 'pointer' : 'default' }}
                      onClick={() => {
                        if (n.data?.page_id) { navigate(`/app/page/${n.data.page_id}`); setNotifOpen(false) }
                        else if (n.data?.workspace_id) {
                          const ws = [...workspaces, ...memberWorkspaces].find(w => w.id === n.data?.workspace_id)
                          if (ws) { switchWorkspace(ws); setNotifOpen(false) }
                        }
                      }}
                      onMouseEnter={e => { if (isClickable) (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = n.read ? 'transparent' : 'var(--accent-light)' }}>
                      <div style={{ fontSize: '13px', fontWeight: n.read ? 400 : 600, color: 'var(--text)', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ flexShrink: 0, color: 'var(--accent)' }}><Icon name={n.type === 'mention' || n.type === 'comment' ? 'comment' : n.type === 'invite' ? 'users' : 'bell'} size={14} /></span>
                        {n.title}
                      </div>
                      {n.body && <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{n.body}</div>}
                      <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '3px' }}>
                        {new Date(n.created_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>

          {navigating && (
            <div style={{ width: '16px', height: '16px', border: '2px solid var(--border)', borderTop: '2px solid var(--accent)', borderRadius: '50%', animation: 'spin 0.6s linear infinite', flexShrink: 0 }} />
          )}
        </div>

        {navigating && (
          <div style={{ height: '2px', background: 'var(--accent)', position: 'absolute', top: '44px', left: sidebarOpen && !isMobile ? '256px' : '0', right: 0, zIndex: 10, animation: 'loadingBar 0.8s ease-out forwards' }} />
        )}

        <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
          {instantPage
            ? <InstantPageView key={instantPage.page.id} data={instantPage} onNavigate={navigate} isFavorite={favoriteIds.has(instantPage.page.id)} onToggleFavorite={() => toggleFavorite(instantPage.page.id)} />
            : children}
        </div>
      </main>

      {/* New workspace modal */}
      {newWsModal && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 2000 }} onClick={() => setNewWsModal(false)} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', width: 'min(320px, calc(100vw - 24px))', boxShadow: 'var(--shadow-lg)', zIndex: 2001 }} className="scale-in-center"
            onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', color: 'var(--text)' }}>New workspace</h3>
            {/* Emoji picker */}
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '6px' }}>Icon</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                {['🌿','🌲','🌳','🌴','🌵','🍀','🌱','🌾','🍁','🌸','🏔','🏠','💼','🚀','⭐','💡','🎯','📚','🎨','🔮','🦋','🧠','💎','🔑','🌍'].map(em => (
                  <button key={em} onClick={() => setNewWsIcon(em)}
                    style={{ background: newWsIcon === em ? 'var(--accent-light)' : 'none', border: newWsIcon === em ? '2px solid var(--accent)' : '2px solid transparent', cursor: 'pointer', fontSize: '20px', padding: '3px', borderRadius: '5px', lineHeight: 1 }}>
                    {em}
                  </button>
                ))}
              </div>
            </div>
            {/* Name input */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '6px' }}>Name</div>
              <input autoFocus value={newWsName} onChange={e => setNewWsName(e.target.value)}
                placeholder="My workspace"
                onKeyDown={e => { if (e.key === 'Enter') confirmCreateWorkspace(); if (e.key === 'Escape') setNewWsModal(false) }}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: '7px', fontFamily: 'var(--font-sans)', fontSize: '14px', color: 'var(--text)', background: 'var(--surface)', outline: 'none', boxSizing: 'border-box' }}
                onFocus={e => { e.target.style.borderColor = 'var(--accent)' }}
                onBlur={e => { e.target.style.borderColor = 'var(--border)' }} />
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setNewWsModal(false)}
                style={{ background: 'none', border: '1px solid var(--border)', cursor: 'pointer', padding: '7px 14px', borderRadius: '7px', fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--text-secondary)' }}>
                Cancel
              </button>
              <button onClick={confirmCreateWorkspace} disabled={!newWsName.trim()}
                style={{ background: newWsName.trim() ? 'var(--accent)' : 'var(--text-tertiary)', color: '#fff', border: 'none', cursor: newWsName.trim() ? 'pointer' : 'not-allowed', padding: '7px 16px', borderRadius: '7px', fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 500 }}>
                Create
              </button>
            </div>
          </div>
        </>
      )}

      {/* Move to workspace modal */}
      {moveToWsMenu && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 1999 }} onClick={() => setMoveToWsMenu(null)} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '20px', width: 'min(300px, calc(100vw - 24px))', boxShadow: 'var(--shadow-lg)', zIndex: 2001 }} className="scale-in-center">
            <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '12px' }}>Move to workspace</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {workspaces.filter(w => w.id !== currentWs.id).map(ws => (
                <div key={ws.id} onClick={() => movePageToWorkspace(moveToWsMenu, ws.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', borderRadius: '7px', cursor: 'pointer' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}>
                  <span style={{ fontSize: '18px' }}>{ws.icon}</span>
                  <span style={{ fontSize: '14px' }}>{ws.name}</span>
                </div>
              ))}
            </div>
            <button onClick={() => setMoveToWsMenu(null)} style={{ marginTop: '12px', width: '100%', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-sans)' }}>Cancel</button>
          </div>
        </>
      )}

      {/* ── SETTINGS MODAL (profile + appearance) ─────────── */}
      {settingsOpen && (
        <SettingsModal
          user={user} tab={settingsTab} theme={theme}
          profileName={profileName} setProfileName={setProfileName}
          onTabChange={setSettingsTab} onThemeChange={setTheme}
          onSave={saveProfile} onClose={() => setSettingsOpen(false)}
          onDeleteAccount={() => { setSettingsOpen(false); setShowDeleteAccount(true) }}
        />
      )}

      {/* ── WORKSPACE SETTINGS MODAL ──────────────────────── */}
      {wsSettingsOpen && (
        <WsSettingsModal
          workspace={currentWs} tab={wsSettingsTab} members={wsMembers} pendingInvites={pendingInvites}
          owner={user} inviteEmail={inviteEmail} inviteRole={inviteRole}
          onTabChange={(tab) => { setWsSettingsTab(tab as 'general'|'members'|'danger'); if (tab === 'members') loadWsMembers() }}
          onIconChange={async (em) => { await supabase.from('workspaces').update({ icon: em }).eq('id', currentWs.id); setWorkspaces(ws => ws.map(w => w.id === currentWs.id ? { ...w, icon: em } : w)); setCurrentWs(w => ({ ...w, icon: em })) }}
          onNameSave={async (name) => { await supabase.from('workspaces').update({ name }).eq('id', currentWs.id); setCurrentWs(w => ({ ...w, name })); setWorkspaces(ws => ws.map(w => w.id === currentWs.id ? { ...w, name } : w)); showToastMsg('Saved!') }}
          onAccentChange={async (color) => { await supabase.from('workspaces').update({ accent_color: color }).eq('id', currentWs.id); setCurrentWs(w => ({ ...w, accent_color: color })); setWorkspaces(ws => ws.map(w => w.id === currentWs.id ? { ...w, accent_color: color } : w)) }}
          onRoleChange={async (memberId, role) => { await supabase.from('workspace_members').update({ role }).eq('id', memberId); loadWsMembers() }}
          onRemoveMember={removeMember}
          onCancelInvite={async (inviteId) => { await supabase.from('workspace_invites').delete().eq('id', inviteId); loadWsMembers() }}
          onInviteEmailChange={setInviteEmail}
          onInviteRoleChange={setInviteRole}
          onInvite={inviteMember}
          onDelete={() => { if (confirm('Delete this workspace and all its pages?')) deleteWorkspace(currentWs.id) }}
          onClose={() => setWsSettingsOpen(false)}
        />
      )}

      {/* Export submenu from sidebar */}
      {exportMenu && (() => {
        const isDb = [...pages, ...sharedPages].find(p => p.id === exportMenu.pageId)?.is_database
        return (
          <div className="context-menu scale-in"
            style={{ position: 'fixed', left: Math.min(exportMenu.x, window.innerWidth - 180), top: Math.min(exportMenu.y, window.innerHeight - 100), zIndex: 2001, minWidth: '170px' }}>
            <MenuItem onClick={() => exportPageAsPDF(exportMenu.pageId, supabase, onExportDone)}>📄 Export as PDF</MenuItem>
            {isDb
              ? <MenuItem onClick={() => exportPageAsCSV(exportMenu.pageId, supabase, onExportDone)}>📊 Export as CSV</MenuItem>
              : <MenuItem onClick={() => exportPageAsWord(exportMenu.pageId, supabase, onExportDone)}>📝 Export as Word</MenuItem>
            }
          </div>
        )
      })()}

      {/* Context menu */}
      {contextMenu && (() => {
        const ctxShared = sharedPages.find(p => p.id === contextMenu.pageId)
        // A page is "fully own" if it's in the user's pages list AND not also appearing as a shared page
        // (sub-pages created by the user under shared parents appear in sharedPages with permission='edit')
        const isFullyOwn = pages.some(p => p.id === contextMenu.pageId) && !ctxShared
        const canEditShared = !!ctxShared && ctxShared.permission === 'edit'
        const estimatedH = isFullyOwn ? (workspaces.length > 1 ? 340 : 310) : canEditShared ? 280 : 130
        const spaceBelow = window.innerHeight - contextMenu.y - 8
        const menuTop = spaceBelow >= estimatedH ? contextMenu.y : Math.max(8, contextMenu.y - estimatedH)
        return (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 1999 }} onClick={() => { setContextMenu(null); setExportMenu(null) }} />
          <div className="context-menu scale-in"
            style={{ position: 'fixed', left: Math.min(contextMenu.x, window.innerWidth - 220), top: menuTop, zIndex: 2000, maxHeight: 'calc(100vh - 16px)', overflowY: 'auto' }}>
            {/* Edit actions: own pages, or shared pages with edit access */}
            {(isFullyOwn || canEditShared) && (
              <MenuItem onClick={() => {
                setRenamingPageId(contextMenu.pageId)
                setRenameVal(pages.find(p => p.id === contextMenu.pageId)?.title ?? ctxShared?.title ?? '')
                setContextMenu(null)
              }}><Icon name="edit" size={15} /> Rename</MenuItem>
            )}
            {isFullyOwn && <MenuItem onClick={() => duplicatePage(contextMenu.pageId)}><Icon name="copy" size={15} /> Duplicate</MenuItem>}
            {(isFullyOwn || canEditShared) && <>
              <MenuItem onClick={() => createPage(contextMenu.pageId)}><span style={{ fontSize: '14px' }}>📄</span> Add sub-page</MenuItem>
              <MenuItem onClick={() => createDatabase(contextMenu.pageId)}><span style={{ fontSize: '14px' }}>🗄️</span> Add database</MenuItem>
            </>}
            <MenuItem onClick={() => { toggleFavorite(contextMenu.pageId); setContextMenu(null) }}>
              <Icon name={favoriteIds.has(contextMenu.pageId) ? 'star-fill' : 'star'} size={15} style={{ color: favoriteIds.has(contextMenu.pageId) ? '#f59e0b' : undefined }} />
              {favoriteIds.has(contextMenu.pageId) ? 'Remove from favorites' : 'Add to favorites'}
            </MenuItem>
            <MenuItem onClick={() => copyPageUrl(contextMenu.pageId)}><Icon name="link" size={15} /> Copy URL</MenuItem>
            {/* Move to workspace: only for fully own pages */}
            {isFullyOwn && workspaces.length > 1 && (
              <MenuItem onClick={() => { setMoveToWsMenu(contextMenu.pageId); setContextMenu(null) }}><Icon name="box" size={15} /> Move to workspace…</MenuItem>
            )}
            {/* Shared page actions (including sub-pages the user created under shared parents) */}
            {ctxShared && (
              <>
                <MenuItem onClick={() => duplicateSharedPage(contextMenu.pageId)}><Icon name="copy" size={15} /> Duplicate to my workspace</MenuItem>
                <MenuItem onClick={() => { removeSharedPage(contextMenu.pageId) }}><Icon name="ban" size={15} /> Remove from my workspace</MenuItem>
              </>
            )}
            {isFullyOwn && <>
              <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
              <MenuItem danger onClick={() => deletePage(contextMenu.pageId)}><Icon name="trash" size={15} /> Delete</MenuItem>
            </>}
          </div>
        </>
        )
      })()}

      {/* Delete account confirmation */}
      {showDeleteAccount && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 500 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '28px', width: 'min(380px, calc(100vw - 24px))', boxShadow: 'var(--shadow-lg)', zIndex: 501 }} className="scale-in-center">
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

      {searchOpen && (
        <SearchModal
          workspaceId={currentWs.id}
          onNavigate={pageId => navigate(`/app/page/${pageId}`)}
          onClose={() => setSearchOpen(false)}
        />
      )}

      {shortcutsOpen && <ShortcutsModal onClose={() => setShortcutsOpen(false)} />}

      {templatePicker && (
        <TemplatePicker
          workspaceId={currentWs.id}
          userId={user.id}
          onSelect={t => { setTemplatePicker(null); createPageWithTemplate(templatePicker.parentId, t) }}
          onClose={() => setTemplatePicker(null)}
        />
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: '24px', right: '24px', background: toast.type === 'error' ? '#eb5757' : '#37352f', color: '#fff', padding: '10px 16px', borderRadius: '8px', fontSize: '13px', zIndex: 300, boxShadow: 'var(--shadow-lg)', display: 'flex', alignItems: 'center', gap: '8px' }} className="fade-in">
          {toast.type === 'error' && <span style={{ fontSize: '15px' }}>⚠️</span>}
          {toast.msg}
        </div>
      )}
    </div>
  )
}

// ── PAGE TEMPLATES ───────────────────────────────────────────
export type PageTemplate = { title: string; icon: string; description: string; content: any }

const PAGE_TEMPLATES: PageTemplate[] = [
  {
    title: 'Blank', icon: '', description: 'Start with a blank page',
    content: { type: 'doc', content: [] },
  },
  {
    title: 'Meeting notes', icon: '📝', description: 'Agenda, attendees, decisions & action items',
    content: { type: 'doc', content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Meeting notes' }] },
      { type: 'paragraph', content: [
        { type: 'text', marks: [{ type: 'bold' }], text: 'Date:' }, { type: 'text', text: ' DD/MM/YYYY   ' },
        { type: 'text', marks: [{ type: 'bold' }], text: 'Location / Link:' }, { type: 'text', text: ' e.g. Google Meet' },
      ]},
      { type: 'paragraph', content: [
        { type: 'text', marks: [{ type: 'bold' }], text: 'Attendees:' }, { type: 'text', text: ' Alice, Bob, Charlie' },
      ]},
      { type: 'callout', attrs: { emoji: '🎯' }, content: [
        { type: 'text', marks: [{ type: 'bold' }], text: 'Goal: ' },
        { type: 'text', text: 'What decision or outcome are we driving toward?' },
      ]},
      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Agenda' }] },
      { type: 'orderedList', attrs: { start: 1 }, content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Review last meeting\'s action items (5 min)' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Main topic — discussion & decision (20 min)' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Wrap-up & next steps (5 min)' }] }] },
      ]},
      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Notes' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Write discussion notes here…' }] },
      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Decisions' }] },
      { type: 'bulletList', content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Decision 1 — rationale' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Decision 2 — rationale' }] }] },
      ]},
      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Action items' }] },
      { type: 'taskList', content: [
        { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Alice' }, { type: 'text', text: ' — Send updated proposal by Friday' }] }] },
        { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Bob' }, { type: 'text', text: ' — Schedule follow-up with design team' }] }] },
        { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Charlie' }, { type: 'text', text: ' — Share access to the dashboard' }] }] },
      ]},
      { type: 'paragraph', content: [
        { type: 'text', marks: [{ type: 'bold' }], text: 'Next meeting:' }, { type: 'text', text: ' DD/MM/YYYY — same attendees' },
      ]},
    ]},
  },
  {
    title: 'Project brief', icon: '🎯', description: 'Goals, scope, milestones & stakeholders',
    content: { type: 'doc', content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Project brief' }] },
      { type: 'paragraph', content: [
        { type: 'text', marks: [{ type: 'bold' }], text: 'Owner:' }, { type: 'text', text: ' Your name   ' },
        { type: 'text', marks: [{ type: 'bold' }], text: 'Status:' }, { type: 'text', text: ' 🟡 In progress   ' },
        { type: 'text', marks: [{ type: 'bold' }], text: 'Target date:' }, { type: 'text', text: ' DD/MM/YYYY' },
      ]},
      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Overview' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'We are building [X] to solve [Y problem] for [Z audience]. This project will [primary outcome] and is expected to ship by [date].' }] },
      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Goals' }] },
      { type: 'bulletList', content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Increase user retention by 15% within 3 months of launch' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Reduce onboarding time from 10 minutes to under 3 minutes' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Launch to beta users by end of Q3' }] }] },
      ]},
      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Success metrics' }] },
      { type: 'table', content: [
        { type: 'tableRow', content: [
          { type: 'tableHeader', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Metric' }] }] },
          { type: 'tableHeader', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Baseline' }] }] },
          { type: 'tableHeader', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Target' }] }] },
        ]},
        { type: 'tableRow', content: [
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Monthly active users' }] }] },
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: '1 200' }] }] },
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: '2 000' }] }] },
        ]},
        { type: 'tableRow', content: [
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Onboarding completion rate' }] }] },
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: '42%' }] }] },
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: '75%' }] }] },
        ]},
        { type: 'tableRow', content: [
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'NPS score' }] }] },
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: '32' }] }] },
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: '50+' }] }] },
        ]},
      ]},
      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Scope' }] },
      { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: '✅ In scope' }] },
      { type: 'bulletList', content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Redesigned onboarding flow (steps 1–4)' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Email notifications for key events' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Analytics dashboard v1' }] }] },
      ]},
      { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: '🚫 Out of scope' }] },
      { type: 'bulletList', content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Mobile app — separate initiative' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Third-party integrations (planned for Q4)' }] }] },
      ]},
      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Milestones' }] },
      { type: 'table', content: [
        { type: 'tableRow', content: [
          { type: 'tableHeader', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Milestone' }] }] },
          { type: 'tableHeader', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Due date' }] }] },
          { type: 'tableHeader', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Owner' }] }] },
          { type: 'tableHeader', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Status' }] }] },
        ]},
        { type: 'tableRow', content: [
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Kick-off & brief approved' }] }] },
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'DD/MM' }] }] },
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Alice' }] }] },
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: '✅ Done' }] }] },
        ]},
        { type: 'tableRow', content: [
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Design mockups reviewed' }] }] },
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'DD/MM' }] }] },
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Bob' }] }] },
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: '🔄 In progress' }] }] },
        ]},
        { type: 'tableRow', content: [
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Beta launch' }] }] },
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'DD/MM' }] }] },
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Alice' }] }] },
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: '⏳ Not started' }] }] },
        ]},
        { type: 'tableRow', content: [
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'General availability' }] }] },
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'DD/MM' }] }] },
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Charlie' }] }] },
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: '⏳ Not started' }] }] },
        ]},
      ]},
      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Stakeholders' }] },
      { type: 'table', content: [
        { type: 'tableRow', content: [
          { type: 'tableHeader', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Name' }] }] },
          { type: 'tableHeader', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Role' }] }] },
          { type: 'tableHeader', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Involvement' }] }] },
        ]},
        { type: 'tableRow', content: [
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Alice' }] }] },
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Product Manager' }] }] },
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Decision maker' }] }] },
        ]},
        { type: 'tableRow', content: [
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Bob' }] }] },
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Designer' }] }] },
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Consulted' }] }] },
        ]},
        { type: 'tableRow', content: [
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Charlie' }] }] },
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Engineering Lead' }] }] },
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Responsible' }] }] },
        ]},
      ]},
      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Risks' }] },
      { type: 'bulletList', content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Timeline slip' }, { type: 'text', text: ' — design reviews often run long; mitigation: timebox to 1 week' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Scope creep' }, { type: 'text', text: ' — align stakeholders weekly on what is in/out' }] }] },
      ]},
      { type: 'callout', attrs: { emoji: '❓' }, content: [
        { type: 'text', marks: [{ type: 'bold' }], text: 'Open questions: ' },
        { type: 'text', text: 'Do we need legal sign-off before beta? Who owns the post-launch analytics review?' },
      ]},
    ]},
  },
  {
    title: 'To-do list', icon: '✅', description: 'Tasks organised by priority',
    content: { type: 'doc', content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'To-do list' }] },
      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: '🔴 Today — must do' }] },
      { type: 'taskList', content: [
        { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Reply to pending emails' }] }] },
        { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Finish the report for the weekly meeting' }] }] },
        { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Review pull request #42' }] }] },
      ]},
      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: '🟡 This week' }] },
      { type: 'taskList', content: [
        { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Prepare slides for the product demo' }] }] },
        { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Schedule 1-on-1s with the team' }] }] },
        { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Update the project roadmap' }] }] },
      ]},
      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: '⚪ Someday / backlog' }] },
      { type: 'taskList', content: [
        { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Read "Shape Up" by Basecamp' }] }] },
        { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Reorganise the shared drive folders' }] }] },
      ]},
    ]},
  },
  {
    title: 'Weekly review', icon: '📅', description: 'Wins, challenges, lessons & next week',
    content: { type: 'doc', content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Weekly review' }] },
      { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Week of:' }, { type: 'text', text: ' DD/MM/YYYY' }] },
      { type: 'callout', attrs: { emoji: '🧘' }, content: [
        { type: 'text', text: 'Block 15 minutes, close all tabs, and reflect honestly.' },
      ]},
      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: '🌟 Wins & highlights' }] },
      { type: 'bulletList', content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Shipped the onboarding redesign on time' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Great feedback from the customer interview session' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Finally cleared the inbox backlog' }] }] },
      ]},
      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: '⚡ Challenges' }] },
      { type: 'bulletList', content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Lost focus on Tuesday afternoon — too many context switches' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Bug in production took longer to fix than expected' }] }] },
      ]},
      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: '📚 Lessons learned' }] },
      { type: 'bulletList', content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Block deep-work time in the morning and protect it' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Write a checklist before any production deploy' }] }] },
      ]},
      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: '🔜 Next week — top 3 priorities' }] },
      { type: 'taskList', content: [
        { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Finalise Q3 roadmap and share with leadership' }] }] },
        { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Close out the last 3 open bugs from this sprint' }] }] },
        { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Start the design doc for the new feature' }] }] },
      ]},
      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: '💡 Ideas & notes' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Capture any loose thoughts, ideas, or things you don\'t want to forget…' }] },
    ]},
  },
  {
    title: 'Design doc', icon: '🔬', description: 'Problem, solution, trade-offs & open questions',
    content: { type: 'doc', content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Design doc' }] },
      { type: 'paragraph', content: [
        { type: 'text', marks: [{ type: 'bold' }], text: 'Author:' }, { type: 'text', text: ' Your name   ' },
        { type: 'text', marks: [{ type: 'bold' }], text: 'Status:' }, { type: 'text', text: ' Draft   ' },
        { type: 'text', marks: [{ type: 'bold' }], text: 'Date:' }, { type: 'text', text: ' DD/MM/YYYY' },
      ]},
      { type: 'paragraph', content: [
        { type: 'text', marks: [{ type: 'bold' }], text: 'Reviewers:' }, { type: 'text', text: ' Alice, Bob' },
      ]},
      { type: 'callout', attrs: { emoji: '💡' }, content: [
        { type: 'text', marks: [{ type: 'bold' }], text: 'TL;DR: ' },
        { type: 'text', text: 'Users can\'t do X today because Y is missing. We propose building Z, which solves this in a scalable way.' },
      ]},
      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Background' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Our users currently manage [process] manually using spreadsheets. This leads to data inconsistencies and wastes ~2 hours per week per team. This doc proposes a native solution.' }] },
      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Problem statement' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Power users (>50 pages) report that finding old content takes too long. Search returns too many false positives and lacks filters. This affects ~30% of our active users and is our #2 support request.' }] },
      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Proposed solution' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Add full-text search with filters (by type, date, workspace) and highlight matching terms in results. Index all page content on save using a background job.' }] },
      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Alternatives considered' }] },
      { type: 'bulletList', content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [
          { type: 'text', marks: [{ type: 'bold' }], text: 'Option A — use Algolia:' }, { type: 'text', text: ' fast setup, great UX; but adds cost and a third-party dependency.' },
        ]}]},
        { type: 'listItem', content: [{ type: 'paragraph', content: [
          { type: 'text', marks: [{ type: 'bold' }], text: 'Option B — PostgreSQL full-text search:' }, { type: 'text', text: ' no extra cost, already in our stack; slightly lower relevance quality. ✅ Selected.' },
        ]}]},
      ]},
      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Trade-offs & risks' }] },
      { type: 'bulletList', content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Indexing large pages may add latency on save — mitigate with async job queue' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Search relevance will be lower than Algolia for complex queries' }] }] },
      ]},
      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Implementation plan' }] },
      { type: 'orderedList', attrs: { start: 1 }, content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Add `search_vector` tsvector column to `pages` table and a GIN index' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Trigger background update on page save' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Build search API endpoint with filter params' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Design and ship search UI (command palette integration)' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Backfill index for existing pages' }] }] },
      ]},
      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Success metrics' }] },
      { type: 'bulletList', content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '80% of search sessions result in a page open within 30 seconds' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Search-related support tickets drop by 50% in 60 days' }] }] },
      ]},
      { type: 'callout', attrs: { emoji: '❓' }, content: [
        { type: 'text', marks: [{ type: 'bold' }], text: 'Open questions: ' },
        { type: 'text', text: 'Do we need to search inside database cell values? Should deleted pages appear in results?' },
      ]},
    ]},
  },
  {
    title: 'OKRs', icon: '🏆', description: 'Objectives & key results for a quarter',
    content: { type: 'doc', content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'OKRs' }] },
      { type: 'paragraph', content: [
        { type: 'text', marks: [{ type: 'bold' }], text: 'Quarter:' }, { type: 'text', text: ' Q3 2025   ' },
        { type: 'text', marks: [{ type: 'bold' }], text: 'Team / Owner:' }, { type: 'text', text: ' Product team' },
      ]},
      { type: 'callout', attrs: { emoji: '📌' }, content: [
        { type: 'text', text: 'OKRs should be ambitious but achievable. A score of 0.7 is success — 1.0 means the target was set too low.' },
      ]},
      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Objective 1 — Delight existing users' }] },
      { type: 'callout', attrs: { emoji: '🎯' }, content: [
        { type: 'text', text: 'Make the product so good that users recommend it without being asked.' },
      ]},
      { type: 'table', content: [
        { type: 'tableRow', content: [
          { type: 'tableHeader', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Key result' }] }] },
          { type: 'tableHeader', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Target' }] }] },
          { type: 'tableHeader', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Current' }] }] },
          { type: 'tableHeader', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Score' }] }] },
        ]},
        { type: 'tableRow', content: [
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Increase NPS from 32 to 50' }] }] },
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: '50' }] }] },
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: '38' }] }] },
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: '0.3' }] }] },
        ]},
        { type: 'tableRow', content: [
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Reduce support response time to < 4 h' }] }] },
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: '4 h' }] }] },
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: '7 h' }] }] },
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: '0.0' }] }] },
        ]},
        { type: 'tableRow', content: [
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Ship 3 top-requested features' }] }] },
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: '3' }] }] },
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: '1' }] }] },
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: '0.33' }] }] },
        ]},
      ]},
      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Objective 2 — Grow our user base' }] },
      { type: 'callout', attrs: { emoji: '🎯' }, content: [
        { type: 'text', text: 'Reach 5 000 monthly active users by end of Q3 through product-led growth.' },
      ]},
      { type: 'table', content: [
        { type: 'tableRow', content: [
          { type: 'tableHeader', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Key result' }] }] },
          { type: 'tableHeader', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Target' }] }] },
          { type: 'tableHeader', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Current' }] }] },
          { type: 'tableHeader', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Score' }] }] },
        ]},
        { type: 'tableRow', content: [
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Reach 5 000 MAU' }] }] },
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: '5 000' }] }] },
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: '2 800' }] }] },
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: '0.56' }] }] },
        ]},
        { type: 'tableRow', content: [
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Activation rate > 60%' }] }] },
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: '60%' }] }] },
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: '42%' }] }] },
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: '0.7' }] }] },
        ]},
      ]},
      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: '🗒️ Initiatives & key bets' }] },
      { type: 'taskList', content: [
        { type: 'taskItem', attrs: { checked: true }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Launch referral programme' }] }] },
        { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Ship new onboarding flow' }] }] },
        { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'SEO content push (5 articles)' }] }] },
      ]},
    ]},
  },
  {
    title: 'Daily notes', icon: '📓', description: 'Focus, tasks & end-of-day reflection',
    content: { type: 'doc', content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Daily notes' }] },
      { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Date:' }, { type: 'text', text: ' DD/MM/YYYY' }] },
      { type: 'callout', attrs: { emoji: '🌤️' }, content: [
        { type: 'text', marks: [{ type: 'bold' }], text: "Today's intention: " },
        { type: 'text', text: 'Stay focused on the two most important tasks. Avoid context-switching before noon.' },
      ]},
      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: '📌 Top 3 tasks for today' }] },
      { type: 'taskList', content: [
        { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Write and send the weekly status update' }] }] },
        { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Review and merge open pull requests' }] }] },
        { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Prep for the 15:00 stakeholder call' }] }] },
      ]},
      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: '🗓️ Schedule & meetings' }] },
      { type: 'table', content: [
        { type: 'tableRow', content: [
          { type: 'tableHeader', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Time' }] }] },
          { type: 'tableHeader', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Event' }] }] },
          { type: 'tableHeader', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Notes' }] }] },
        ]},
        { type: 'tableRow', content: [
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: '10:00' }] }] },
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Daily standup' }] }] },
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Share progress on feature X' }] }] },
        ]},
        { type: 'tableRow', content: [
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: '15:00' }] }] },
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Stakeholder call' }] }] },
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Bring updated metrics' }] }] },
        ]},
      ]},
      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: '📝 Notes & ideas' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Capture anything that comes up during the day — links, thoughts, rough ideas…' }] },
      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: '🌙 End of day' }] },
      { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'What went well:' }, { type: 'text', text: ' Shipped the auth fix before the call — felt good.' }] },
      { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'What to improve:' }, { type: 'text', text: ' Too many Slack interruptions — try DND blocks tomorrow morning.' }] },
      { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Tomorrow\'s #1 priority:' }, { type: 'text', text: ' Finish the design doc and send for review.' }] },
    ]},
  },
]

function TemplatePicker({ workspaceId, userId, onSelect, onClose }: { workspaceId: string; userId: string; onSelect: (t: PageTemplate) => void; onClose: () => void }) {
  const supabase = createClient()
  const [customTemplates, setCustomTemplates] = useState<(PageTemplate & { id: string })[]>([])

  useEffect(() => {
    supabase.from('page_templates')
      .select('id, title, icon, description, content')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setCustomTemplates(data as any)
      })
  }, [workspaceId])

  async function deleteCustomTemplate(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    await supabase.from('page_templates').delete().eq('id', id).eq('user_id', userId)
    setCustomTemplates(ts => ts.filter(t => t.id !== id))
  }

  const card = (t: PageTemplate, onDelete?: (e: React.MouseEvent) => void) => (
    <div key={(t as any).id ?? t.title} onClick={() => onSelect(t)}
      style={{ padding: '12px 14px', borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 4, transition: 'all 0.1s', position: 'relative' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--accent-light)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}>
      <div style={{ fontSize: 22, lineHeight: 1, marginBottom: 2 }}>{t.icon || '📄'}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{t.title || 'Blank'}</div>
      <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{t.description}</div>
      {onDelete && (
        <button onClick={onDelete}
          style={{ position: 'absolute', top: 6, right: 6, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1 }}
          title="Delete template">
          ✕
        </button>
      )}
    </div>
  )

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 2000 }} onClick={onClose} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', width: 'min(540px, calc(100vw - 24px))', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-lg)', zIndex: 2001, overflow: 'hidden' }} className="scale-in-center">
        <div style={{ padding: '18px 22px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>New page</div>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Choose a template to get started, or start blank.</div>
        </div>
        <div style={{ overflowY: 'auto', padding: '12px 16px 4px' }}>
          {customTemplates.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>My templates</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
                {customTemplates.map(t => card(t, (e) => deleteCustomTemplate(t.id, e)))}
              </div>
              <div style={{ height: 1, background: 'var(--border)', margin: '4px 0 12px' }} />
            </>
          )}
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Built-in</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
            {PAGE_TEMPLATES.map(t => card(t))}
          </div>
        </div>
        <div style={{ padding: '8px 16px 14px', display: 'flex', justifyContent: 'flex-end', flexShrink: 0, borderTop: '1px solid var(--border)' }}>
          <button onClick={onClose} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 14px', fontFamily: 'var(--font-sans)', fontSize: 13, cursor: 'pointer', color: 'var(--text-secondary)' }}>Cancel</button>
        </div>
      </div>
    </>
  )
}

// ── SETTINGS MODAL ───────────────────────────────────────────
function SettingsModal({ user, tab, theme, profileName, setProfileName, onTabChange, onThemeChange, onSave, onClose, onDeleteAccount }: {
  user: User; tab: 'profile' | 'appearance' | 'danger'; theme: 'light' | 'dark' | 'system'
  profileName: string; setProfileName: (v: string) => void
  onTabChange: (t: 'profile' | 'appearance' | 'danger') => void; onThemeChange: (t: 'light' | 'dark' | 'system') => void
  onSave: () => void; onClose: () => void; onDeleteAccount: () => void
}) {
  const supabase = createClient()
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabase.from('profiles').select('avatar_url').eq('id', user.id).single()
      .then(({ data }) => { if (data?.avatar_url) setAvatarUrl(data.avatar_url) })
  }, [user.id])

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploadingAvatar(true)
    const ext = file.name.split('.').pop()
    const path = `avatars/${user.id}.${ext}`
    const { error } = await supabase.storage.from('images').upload(path, file, { upsert: true })
    if (!error) {
      const { data } = supabase.storage.from('images').getPublicUrl(path)
      const url = data.publicUrl + '?t=' + Date.now()
      await supabase.from('profiles').update({ avatar_url: url }).eq('id', user.id)
      setAvatarUrl(url)
    }
    setUploadingAvatar(false)
  }

  return (
    <>
      <input ref={avatarInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarUpload} />
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 2000 }} onClick={onClose} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', width: 'min(500px, calc(100vw - 24px))', height: 'min(440px, 90vh)', display: 'flex', overflow: 'hidden', boxShadow: 'var(--shadow-lg)', zIndex: 2001 }} className="scale-in-center">
        <div style={{ width: '150px', minWidth: '130px', background: 'var(--sidebar-bg)', borderRight: '1px solid var(--border)', padding: '14px 8px', flexShrink: 0 }}>
          <div style={{ fontSize: '10.5px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 6px 8px', fontFamily: 'var(--font-body)' }}>Settings</div>
          {([['profile', 'user', 'Profile'], ['appearance', 'sun', 'Appearance'], ['danger', 'warning', 'Danger']] as const).map(([t, icon, label]) => (
            <div key={t} onClick={() => onTabChange(t)}
              style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '5px 8px', borderRadius: '5px', cursor: 'pointer', fontSize: '12.5px', fontFamily: 'var(--font-body)', fontWeight: tab === t ? 500 : 400, color: tab === t ? (t === 'danger' ? 'var(--red)' : 'var(--text)') : (t === 'danger' ? 'var(--red)' : 'var(--text-secondary)'), background: tab === t ? 'var(--sidebar-active)' : 'none', marginBottom: '2px', opacity: t === 'danger' ? 0.85 : 1 }}
              onMouseEnter={e => { if (tab !== t) (e.currentTarget as HTMLElement).style.background = t === 'danger' ? '#fff0f0' : 'var(--sidebar-hover)' }}
              onMouseLeave={e => { if (tab !== t) (e.currentTarget as HTMLElement).style.background = 'none' }}>
              <Icon name={icon} size={14} /> {label}
            </div>
          ))}
        </div>
        <div style={{ flex: 1, padding: '18px 22px', overflowY: 'auto' }}>
          {tab === 'profile' && (
            <div>
              <div style={{ fontSize: '10.5px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px', fontFamily: 'var(--font-body)' }}>Profile</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
                <div
                  onClick={() => avatarInputRef.current?.click()}
                  title="Change profile photo"
                  style={{ position: 'relative', width: '56px', height: '56px', borderRadius: '50%', flexShrink: 0, cursor: 'pointer', overflow: 'hidden' }}>
                  {avatarUrl
                    ? <img src={avatarUrl} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <div style={{ width: '100%', height: '100%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', fontWeight: 700, color: '#fff' }}>{user.name[0]?.toUpperCase()}</div>
                  }
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: uploadingAvatar ? 1 : 0, transition: 'opacity 0.15s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '1' }}
                    onMouseLeave={e => { if (!uploadingAvatar) (e.currentTarget as HTMLElement).style.opacity = '0' }}>
                    <span style={{ fontSize: 10, color: '#fff', fontWeight: 600, textAlign: 'center', lineHeight: 1.3 }}>{uploadingAvatar ? '…' : <Icon name="user" size={14} />}</span>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--font-body)' }}>{profileName || user.name}</div>
                  <button onClick={() => avatarInputRef.current?.click()} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--accent)', padding: 0, marginTop: 2 }}>
                    {avatarUrl ? 'Change photo' : 'Add photo'}
                  </button>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', width: '60px', flexShrink: 0, fontFamily: 'var(--font-body)' }}>Name</div>
                <input value={profileName} onChange={e => setProfileName(e.target.value)} style={{ flex: 1, border: '1px solid var(--border)', borderRadius: '5px', padding: '5px 8px', fontSize: '13px', fontFamily: 'var(--font-body)', color: 'var(--text)', background: 'var(--surface)', outline: 'none' }} onFocus={e => { (e.target as HTMLElement).style.borderColor = 'var(--accent)' }} onBlur={e => { (e.target as HTMLElement).style.borderColor = 'var(--border)' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', width: '60px', flexShrink: 0, fontFamily: 'var(--font-body)' }}>Email</div>
                <input defaultValue={user.email} readOnly style={{ flex: 1, border: '1px solid var(--border)', borderRadius: '5px', padding: '5px 8px', fontSize: '13px', fontFamily: 'var(--font-body)', color: 'var(--text-secondary)', background: 'var(--sidebar-bg)', outline: 'none' }} />
              </div>
              <button onClick={onSave} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 16px', fontSize: '13px', cursor: 'pointer', fontWeight: 500, fontFamily: 'var(--font-body)' }}>Save</button>
            </div>
          )}
          {tab === 'danger' && (
            <div>
              <div style={{ fontSize: '10.5px', fontWeight: 600, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px', fontFamily: 'var(--font-body)' }}>Danger zone</div>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '14px', lineHeight: 1.5, fontFamily: 'var(--font-body)' }}>Deleting your account is permanent and cannot be undone. All your workspaces and pages will be removed.</p>
              <button onClick={onDeleteAccount} style={{ border: '1px solid #fecaca', background: 'none', borderRadius: '5px', padding: '6px 14px', fontSize: '13px', cursor: 'pointer', fontFamily: 'var(--font-body)', color: 'var(--red)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Icon name="trash" size={14} /> Delete account
              </button>
            </div>
          )}
          {tab === 'appearance' && (
            <div>
              <div style={{ fontSize: '10.5px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px', fontFamily: 'var(--font-body)' }}>Appearance</div>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                {([['light', 'sun', 'Light'], ['dark', 'moon', 'Dark'], ['system', 'focus', 'System']] as const).map(([t, icon, label]) => (
                  <button key={t} onClick={() => onThemeChange(t)}
                    style={{ border: `1px solid ${theme === t ? 'var(--accent)' : 'var(--border)'}`, background: theme === t ? 'var(--accent-light)' : 'var(--surface)', color: theme === t ? 'var(--accent)' : 'var(--text)', borderRadius: '7px', padding: '6px 12px', fontSize: '12.5px', cursor: 'pointer', fontFamily: 'var(--font-body)', fontWeight: theme === t ? 500 : 400, transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Icon name={icon} size={13} /> {label}
                  </button>
                ))}
              </div>
              <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', height: '80px' }}>
                <div style={{ display: 'flex', height: '100%' }}>
                  <div style={{ width: '76px', background: theme === 'dark' ? '#252524' : 'var(--sidebar-bg)', borderRight: '1px solid var(--border)', padding: '8px', flexShrink: 0, transition: 'background 0.4s' }}>
                    <div style={{ height: '8px', background: theme === 'dark' ? '#3a3a38' : 'var(--border)', borderRadius: '3px', marginBottom: '5px', transition: 'background 0.4s' }} />
                    <div style={{ height: '8px', background: theme === 'dark' ? '#3a3a38' : 'var(--border)', borderRadius: '3px', width: '70%', transition: 'background 0.4s' }} />
                  </div>
                  <div style={{ flex: 1, background: theme === 'dark' ? '#1f1f1e' : 'var(--surface)', padding: '10px', transition: 'background 0.4s' }}>
                    <div style={{ height: '12px', background: theme === 'dark' ? '#3a3a38' : 'var(--border)', borderRadius: '3px', width: '55%', marginBottom: '6px', transition: 'background 0.4s' }} />
                    <div style={{ height: '8px', background: theme === 'dark' ? '#2e2e2c' : '#f0f0ee', borderRadius: '3px', transition: 'background 0.4s' }} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ── INVITE LINK SECTION ───────────────────────────────────────
function InviteLinkSection({ workspaceId }: { workspaceId: string }) {
  const [link, setLink] = useState<string | null>(null)
  const [role, setRole] = useState<'member' | 'viewer'>('member')
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  async function generate() {
    setLoading(true)
    const { data } = await supabase.from('workspace_invites').insert({ workspace_id: workspaceId, role }).select('token').single()
    if (data) setLink(`${window.location.origin}/invite/${data.token}`)
    setLoading(false)
  }

  return (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
      <div style={{ fontSize: '10.5px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Invite link</div>
      {link ? (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input readOnly value={link} style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 5, padding: '5px 8px', fontSize: 11, fontFamily: 'var(--font-sans)', color: 'var(--text)', background: 'var(--sidebar-bg)', outline: 'none' }} />
          <button onClick={() => { navigator.clipboard.writeText(link); setLink(null) }}
            style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 5, padding: '5px 10px', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-sans)', fontWeight: 500, whiteSpace: 'nowrap' }}>Copy & close</button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <select value={role} onChange={e => setRole(e.target.value as 'member' | 'viewer')} style={{ border: '1px solid var(--border)', borderRadius: 5, padding: '5px 6px', fontSize: 12, fontFamily: 'var(--font-sans)', background: 'var(--surface)', color: 'var(--text)' }}>
            <option value="member">member</option>
            <option value="viewer">viewer</option>
          </select>
          <button onClick={generate} disabled={loading}
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 5, padding: '5px 10px', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-sans)', color: 'var(--text)' }}>
            {loading ? '…' : '🔗 Generate invite link'}
          </button>
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Valid 7 days</span>
        </div>
      )}
    </div>
  )
}

// ── WORKSPACE SETTINGS MODAL ─────────────────────────────────
function WsSettingsModal({ workspace, tab, members, pendingInvites, owner, inviteEmail, inviteRole, onTabChange, onIconChange, onNameSave, onAccentChange, onRoleChange, onRemoveMember, onCancelInvite, onInviteEmailChange, onInviteRoleChange, onInvite, onDelete, onClose }: {
  workspace: Workspace; tab: 'general' | 'members' | 'danger'; members: WsMember[]; pendingInvites: PendingInvite[]
  owner: User; inviteEmail: string; inviteRole: 'member' | 'viewer'
  onTabChange: (t: 'general' | 'members' | 'danger') => void
  onIconChange: (em: string) => void; onNameSave: (name: string) => void
  onAccentChange: (color: string) => void
  onRoleChange: (memberId: string, role: string) => void; onRemoveMember: (userId: string) => void
  onCancelInvite: (inviteId: string) => void
  onInviteEmailChange: (v: string) => void; onInviteRoleChange: (v: 'member' | 'viewer') => void
  onInvite: () => void; onDelete: () => void; onClose: () => void
}) {
  const [nameVal, setNameVal] = useState(workspace.name)
  const nameDirty = nameVal.trim() !== workspace.name.trim()
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 2000 }} onClick={onClose} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', width: 'min(520px, calc(100vw - 24px))', height: 'min(500px, 90vh)', display: 'flex', overflow: 'hidden', boxShadow: 'var(--shadow-lg)', zIndex: 2001 }} className="scale-in-center">
        <div style={{ width: '150px', minWidth: '120px', background: 'var(--sidebar-bg)', borderRight: '1px solid var(--border)', padding: '14px 8px', flexShrink: 0 }}>
          <div style={{ fontSize: '10.5px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 6px 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {workspace.icon} {workspace.name}
          </div>
          {([['general','gear','General'],['members','users','Members'],['danger','warning','Danger']] as const).map(([t, icon, label]) => (
            <div key={t} onClick={() => onTabChange(t)}
              style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '5px 8px', borderRadius: '5px', cursor: 'pointer', fontSize: '12.5px', fontFamily: 'var(--font-body)', fontWeight: tab === t ? 500 : 400, color: tab === t ? (t === 'danger' ? 'var(--red)' : 'var(--text)') : (t === 'danger' ? 'var(--red)' : 'var(--text-secondary)'), background: tab === t ? 'var(--sidebar-active)' : 'none', marginBottom: '2px', opacity: t === 'danger' ? 0.85 : 1 }}
              onMouseEnter={e => { if (tab !== t) (e.currentTarget as HTMLElement).style.background = t === 'danger' ? '#fff0f0' : 'var(--sidebar-hover)' }}
              onMouseLeave={e => { if (tab !== t) (e.currentTarget as HTMLElement).style.background = 'none' }}>
              <Icon name={icon} size={14} /> {label}
            </div>
          ))}
          <div style={{ borderTop: '1px solid var(--border)', position: 'absolute', bottom: '12px', width: '134px' }}>
            <div onClick={onClose} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '5px 8px', borderRadius: '5px', cursor: 'pointer', fontSize: '12.5px', fontFamily: 'var(--font-body)', color: 'var(--text-secondary)', marginTop: '8px' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}>
              <Icon name="chev-right" size={14} style={{ transform: 'rotate(180deg)' }} /> Close
            </div>
          </div>
        </div>
        <div style={{ flex: 1, padding: '18px 22px', overflowY: 'auto' }}>
          {tab === 'general' && (
            <div>
              <div style={{ fontSize: '10.5px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>General</div>
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Icon</div>
                <EmojiPicker inline hideRemove onSelect={onIconChange} onClose={() => {}} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', width: '50px', flexShrink: 0 }}>Name</div>
                <input value={nameVal} onChange={e => setNameVal(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && nameDirty) onNameSave(nameVal.trim()) }}
                  style={{ flex: 1, border: '1px solid var(--border)', borderRadius: '5px', padding: '5px 8px', fontSize: '13px', fontFamily: 'var(--font-sans)', color: 'var(--text)', background: 'var(--surface)', outline: 'none' }}
                  onFocus={e => { (e.target as HTMLElement).style.borderColor = 'var(--accent)' }}
                  onBlur={e => { (e.target as HTMLElement).style.borderColor = 'var(--border)' }} />
                {nameDirty && (
                  <button onClick={() => onNameSave(nameVal.trim())}
                    style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '5px', padding: '5px 12px', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontWeight: 500, flexShrink: 0 }}>
                    Save
                  </button>
                )}
              </div>
            </div>
          )}
          {tab === 'danger' && (
            <div>
              <div style={{ fontSize: '10.5px', fontWeight: 600, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>Danger zone</div>
              <div style={{ background: '#fff5f5', border: '1px solid #fecaca', borderRadius: '8px', padding: '14px 16px' }}>
                <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)', marginBottom: '4px' }}>Delete this workspace</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>This will permanently delete the workspace and all its pages. This action cannot be undone.</div>
                <button onClick={onDelete} style={{ border: 'none', background: 'var(--red)', borderRadius: '5px', padding: '6px 14px', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontWeight: 500, color: '#fff' }}>Delete workspace</button>
              </div>
            </div>
          )}
          {tab === 'members' && (
            <div>
              <div style={{ fontSize: '10.5px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Members</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>Members can see and edit all pages in this workspace.</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', borderBottom: '1px solid var(--border)', marginBottom: '4px' }}>
                <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: '#fff', flexShrink: 0 }}>{owner.name[0]?.toUpperCase()}</div>
                <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: '13px', color: 'var(--text)' }}>{owner.name}</div><div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{owner.email}</div></div>
                <span style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '8px', background: 'var(--accent-light)', color: 'var(--accent)', fontWeight: 500 }}>owner</span>
              </div>
              {members.map(m => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: 'var(--sidebar-active)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', flexShrink: 0 }}>{(m.profile?.full_name || m.profile?.email || '?')[0]?.toUpperCase()}</div>
                  <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: '13px', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.profile?.full_name || m.profile?.email || m.user_id}</div></div>
                  <select defaultValue={m.role} onChange={e => onRoleChange(m.id, e.target.value)} style={{ border: '1px solid var(--border)', borderRadius: '4px', fontSize: '11px', padding: '2px 4px', fontFamily: 'var(--font-sans)', background: 'var(--surface)', color: 'var(--text)' }}>
                    <option value="member">member</option>
                    <option value="viewer">viewer</option>
                  </select>
                  <button onClick={() => onRemoveMember(m.user_id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: '13px', padding: '2px 4px', borderRadius: '3px' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--red)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-tertiary)' }}>✕</button>
                </div>
              ))}
              {pendingInvites.map(inv => (
                <div key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', borderBottom: '1px solid var(--border)', opacity: 0.75 }}>
                  <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: 'var(--sidebar-active)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', flexShrink: 0 }}>✉️</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.invited_email}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Invitation pending</div>
                  </div>
                  <span style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '8px', background: 'var(--sidebar-active)', color: 'var(--text-tertiary)', fontWeight: 500, flexShrink: 0 }}>{inv.role}</span>
                  <button onClick={() => onCancelInvite(inv.id)} title="Cancel invitation" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: '13px', padding: '2px 4px', borderRadius: '3px' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--red)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-tertiary)' }}>✕</button>
                </div>
              ))}
              <div style={{ display: 'flex', gap: '6px', marginTop: '12px' }}>
                <input value={inviteEmail} onChange={e => onInviteEmailChange(e.target.value)} placeholder="Invite by email…" onKeyDown={e => { if (e.key === 'Enter') onInvite() }} style={{ flex: 1, border: '1px solid var(--border)', borderRadius: '5px', padding: '5px 8px', fontSize: '12px', fontFamily: 'var(--font-sans)', color: 'var(--text)', background: 'var(--surface)', outline: 'none' }} onFocus={e => { (e.target as HTMLElement).style.borderColor = 'var(--accent)' }} onBlur={e => { (e.target as HTMLElement).style.borderColor = 'var(--border)' }} />
                <select value={inviteRole} onChange={e => onInviteRoleChange(e.target.value as 'member' | 'viewer')} style={{ border: '1px solid var(--border)', borderRadius: '5px', padding: '5px 6px', fontSize: '12px', fontFamily: 'var(--font-sans)', background: 'var(--surface)', color: 'var(--text)' }}>
                  <option value="member">member</option>
                  <option value="viewer">viewer</option>
                </select>
                <button onClick={onInvite} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '5px', padding: '5px 12px', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontWeight: 500 }}>Invite</button>
              </div>
              <InviteLinkSection workspaceId={workspace.id} />
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ── PAGE ROW COMPONENT ───────────────────────────────────────
type PageRowProps = {
  page: { id: string; icon: string; title: string; is_database?: boolean }
  depth: number
  isActive: boolean
  isDragOver: boolean
  hasChildren: boolean
  isExpanded: boolean
  isRenaming: boolean
  renameVal: string
  onRenameChange: (val: string) => void
  onRenameSubmit: () => void
  onRenameCancel: () => void
  onToggle: () => void
  onClick: () => void
  onDragStart: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: () => void
  onDrop: (e: React.DragEvent) => void
  onDragEnd: () => void
  onContextMenu: (e: React.MouseEvent) => void
  onAddSubpage?: () => void
  onMoreMenu: (e: React.MouseEvent) => void
  isDragging: boolean
  badge?: string
  onRemove?: () => void
  onHover?: () => void
  dropIndicator?: 'above' | 'below' | 'inside' | null
  isShared?: boolean
  isKeyFocused?: boolean
  isFavorite?: boolean
  onToggleFavorite?: () => void
}

function PageRow({ page, depth, isActive, isDragOver, hasChildren, isExpanded, isRenaming, renameVal, onRenameChange, onRenameSubmit, onRenameCancel, onToggle, onClick, onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd, onContextMenu, onAddSubpage, onMoreMenu, isDragging, badge, onRemove, onHover, dropIndicator, isShared, isKeyFocused, isFavorite, onToggleFavorite }: PageRowProps) {
  const [hovered, setHovered] = useState(false)
  return (
    <div style={{ position: 'relative' }} data-page-id={page.id}>
    {dropIndicator === 'above' && (
      <div style={{ position: 'absolute', top: 0, left: 6, right: 6, height: 2, background: 'var(--accent)', borderRadius: 1, zIndex: 5, pointerEvents: 'none' }} />
    )}
    <div
      draggable={!isRenaming}
      onDragStart={onDragStart} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} onDragEnd={onDragEnd}
      onContextMenu={onContextMenu}
      onClick={onClick}
      onMouseEnter={() => { setHovered(true); onHover?.() }}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        display: 'flex', alignItems: 'center', gap: '5px',
        paddingLeft: `${8 + depth * 16}px`, paddingRight: '8px',
        paddingTop: '5px', paddingBottom: '5px',
        borderRadius: 'var(--radius-sm)', cursor: 'pointer',
        background: isActive ? 'var(--side-active)' : isDragOver ? 'var(--accent-light)' : isKeyFocused ? 'var(--side-hover)' : hovered ? 'var(--side-hover)' : 'transparent',
        outline: isKeyFocused ? '2px solid var(--accent)' : 'none',
        outlineOffset: '-2px',
        opacity: isDragging ? 0.4 : 1,
        margin: '1px 6px',
        userSelect: 'none',
        fontWeight: isActive ? 500 : 400,
        color: 'var(--side-text)',
        transition: 'background 0.12s',
      }}
    >
      {/* Active accent bar — inside the pill, at its left edge */}
      {isActive && (
        <div style={{ position: 'absolute', left: 0, top: '20%', bottom: '20%', width: 3, borderRadius: '0 3px 3px 0', background: 'var(--side-accent)', pointerEvents: 'none', zIndex: 1 }} />
      )}
      {/* Expand toggle — chevron SVG */}
      <span
        onClick={e => { e.stopPropagation(); if (hasChildren) onToggle() }}
        style={{
          width: '17px', height: '17px', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: '4px',
          color: hasChildren ? 'var(--side-text-2)' : 'transparent',
          transition: 'transform 0.16s, background 0.12s',
          transform: isExpanded ? 'rotate(90deg)' : 'none',
          cursor: hasChildren ? 'pointer' : 'default',
        }}
        onMouseEnter={e => { if (hasChildren) (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-active)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}
        title={hasChildren ? (isExpanded ? 'Collapse' : 'Expand') : ''}
      >
        {hasChildren && <Icon name="chev-right" size={12} />}
      </span>

      {/* Page icon — emoji if set, else emoji fallback */}
      <span style={{ fontSize: '14px', flexShrink: 0, width: '17px', textAlign: 'center', lineHeight: 1 }}>
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
        <span style={{ flex: 1, fontSize: '13.5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {page.title || 'Untitled'}
        </span>
      )}

      {/* Badge (shared pages) — small grey text, same style as action buttons */}
      {badge && (
        <span style={{
          fontSize: '10px', color: 'var(--text-tertiary)', flexShrink: 0,
          background: 'var(--sidebar-active)', borderRadius: '3px',
          padding: '1px 5px', fontWeight: 500, letterSpacing: '0.3px',
          marginRight: '2px'
        }}>{badge}</span>
      )}

      {/* Actions overlay — absolute, fades in on hover, never causes layout shift */}
      {!isRenaming && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)',
            display: 'flex', alignItems: 'center', gap: '2px',
            opacity: (hovered || isFavorite) ? 1 : 0,
            pointerEvents: (hovered || isFavorite) ? 'auto' : 'none',
            transition: 'opacity .12s',
            paddingLeft: 26,
            background: 'linear-gradient(90deg, transparent, var(--side-fade) 38%)',
          }}>
          {onRemove ? (
            <SbBtn onClick={onRemove} title="Remove"><span style={{ fontSize: '12px', lineHeight: 1 }}>✕</span></SbBtn>
          ) : (
            <>
              {onToggleFavorite && (
                <SbBtn onClick={onToggleFavorite} title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}>
                  <Icon name={isFavorite ? 'star-fill' : 'star'} size={14} style={{ color: isFavorite ? '#f59e0b' : undefined }} />
                </SbBtn>
              )}
              {onAddSubpage && <SbBtn onClick={onAddSubpage} title="New sub-page"><Icon name="plus" size={14} /></SbBtn>}
              {onMoreMenu && <SbBtn onClick={onMoreMenu} title="More options"><Icon name="more" size={14} /></SbBtn>}
            </>
          )}
        </div>
      )}
    </div>
    {dropIndicator === 'below' && (
      <div style={{ position: 'absolute', bottom: 0, left: 6, right: 6, height: 2, background: 'var(--accent)', borderRadius: 1, zIndex: 5, pointerEvents: 'none' }} />
    )}
    </div>
  )
}

// ── SMALL COMPONENTS ─────────────────────────────────────────
function SbBtn({ onClick, title, children }: { onClick?: (e: React.MouseEvent) => void; title: string; children: React.ReactNode }) {
  return (
    <button onClick={e => { e.stopPropagation(); onClick?.(e) }} title={title}
      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--side-text-2)', padding: '3px', borderRadius: '5px', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '22px', height: '22px', flexShrink: 0 }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-active)'; (e.currentTarget as HTMLElement).style.color = 'var(--side-text)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; (e.currentTarget as HTMLElement).style.color = 'var(--side-text-2)' }}>
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
    <div style={{ padding: '15px 16px 5px', fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 600, color: 'var(--side-text-2)', textTransform: 'uppercase', letterSpacing: '.05em', opacity: 0.68, userSelect: 'none', ...style }}>
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

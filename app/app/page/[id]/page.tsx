'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import PageView from '@/components/PageView'
import Image from 'next/image'
import { cachePageForOffline, getCachedPage, type CachedPageAccess } from '@/lib/offline-page-cache'
import { derivePageAccess } from '@/lib/access-policy'
import type { Page } from '@/lib/types'

// Module-level cache — persists across navigations
const cache = new Map<string, CachedPageAccess>()
type WorkspaceMembership = { workspace_id: string; role: string }

// Pre-warm cache on hover
if (typeof window !== 'undefined') {
  window.addEventListener('canopy:prewarm', async event => {
    const pid = (event as CustomEvent<{ pageId?: string }>).detail?.pageId
    if (!pid || cache.has(pid)) return
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const sb = createClient()
      const { data: { user } } = await sb.auth.getUser()
      if (!user) return
      const [{ data: page }, { data: share }] = await Promise.all([
        sb.from('pages').select('*').eq('id', pid).single(),
        sb.from('page_shares').select('permission').eq('page_id', pid).eq('user_id', user.id).single()
      ])
      if (!page || page.deleted_at) return
      const isOwner = page.owner_id === user.id
      const [{ data: wsMem }, { data: workspace }] = await Promise.all([
        sb.from('workspace_members').select('role, workspace_id').eq('user_id', user.id),
        sb.from('workspaces').select('owner_id').eq('id', page.workspace_id).single(),
      ])
      const membershipRole = (wsMem || []).find((m: WorkspaceMembership) => m.workspace_id === page.workspace_id)?.role
      const access = derivePageAccess({
        userId: user.id,
        pageOwnerId: page.owner_id,
        linkPermission: page.link_permission,
        workspaceOwnerId: workspace?.owner_id,
        membershipRole,
        sharePermission: share?.permission,
      })
      const result = { page, canEdit: access.canEdit, canManage: access.canManage, isOwner, isWorkspaceMember: access.isWorkspaceMember, userId: user.id }
      cache.set(pid, result)
      // Also sync to window.__pageCache so instant navigation uses correct permissions
      window.__pageCache = window.__pageCache || new Map()
      window.__pageCache.set(pid, result)
    } catch {}
  })
}

export default function PageRoute() {
  const params = useParams()
  const id = params?.id as string
  const router = useRouter()
  const [state, setState] = useState<{
    page: Page; canEdit: boolean; canManage: boolean; isOwner: boolean; isWorkspaceMember: boolean; userId: string
  } | null>(null)
  const [error, setError] = useState(false)

  // Clear navigation loading bar immediately
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('canopy:pageReady'))
  }, [id])

  useEffect(() => {
    if (!id) return
    // Clear state so canEdit from previous page doesn't linger
    setState(null)
    setError(false)
    // Show page content instantly from window cache (canEdit=false until load() resolves)
    const winCache = window.__pageCache?.get(id)
    if (winCache) setState(winCache)

    const supabase = createClient()

    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      if (!navigator.onLine) {
        const offline = getCachedPage(user.id, id)
        if (offline) { setState(offline); document.title = (offline.page.title || 'Untitled') + ' — Canopy (offline)'; return }
      }

      const [{ data: page }, { data: share }, { data: wsMember }] = await Promise.all([
        supabase.from('pages').select('*').eq('id', id).single(),
        supabase.from('page_shares').select('permission')
          .eq('page_id', id).eq('user_id', user.id).single(),
        supabase.from('workspace_members').select('role, workspace_id')
          .eq('user_id', user.id)
      ])

      // If RLS blocked the page read (e.g. workspace owner reading a member's page),
      // fall back to the admin API route which bypasses RLS after verifying access.
      if (!page && !share) {
        const res = await fetch(`/api/page-data?id=${id}`)
        if (res.ok) {
          const data = await res.json()
          const result = { page: data.page, canEdit: data.canEdit, canManage: data.canManage, isOwner: data.isOwner, isWorkspaceMember: data.isWorkspaceMember, userId: data.userId }
          cache.set(id, result)
          window.__pageCache = window.__pageCache || new Map()
          window.__pageCache.set(id, result)
          cachePageForOffline(result as CachedPageAccess)
          setState(result)
          document.title = (data.page.title || 'Untitled') + ' — Canopy'
          return
        }
        // Page not accessible at all
        setError(true); return
      }
      const resolvedPage = page
      if (!resolvedPage) { router.push(`/share/${id}`); return }
      if (resolvedPage.deleted_at) { setError(true); return }

      const isOwner = resolvedPage.owner_id === user.id

      // Check if the current user owns the workspace (workspace creators are NOT in workspace_members)
      const { data: ownedWorkspace } = await supabase
        .from('workspaces').select('owner_id')
        .eq('id', resolvedPage.workspace_id).single()

      const membershipRole = (wsMember || []).find((m: WorkspaceMembership) => m.workspace_id === resolvedPage.workspace_id)?.role
      const access = derivePageAccess({
        userId: user.id,
        pageOwnerId: resolvedPage.owner_id,
        linkPermission: resolvedPage.link_permission,
        workspaceOwnerId: ownedWorkspace?.owner_id,
        membershipRole,
        sharePermission: share?.permission,
      })
      if (!access.canView) { setError(true); return }

      const result = { page: resolvedPage, canEdit: access.canEdit, canManage: access.canManage, isOwner, isWorkspaceMember: access.isWorkspaceMember, userId: user.id }
      cache.set(id, result)
      // Keep window.__pageCache in sync so future instant navigations use real permissions
      window.__pageCache = window.__pageCache || new Map()
      window.__pageCache.set(id, result)
      cachePageForOffline(result as CachedPageAccess)
      setState(result)
      document.title = (resolvedPage.title || 'Untitled') + ' — Canopy'
    }

    load()
  }, [id, router])

  if (error) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
      <Image src="/canopy_favicon_no_bg.ico" alt="Canopy" width={72} height={72} style={{ objectFit: 'contain' }} />
      <p style={{ color: 'var(--text-secondary)', fontSize: 15 }}>Page not found or access denied.</p>
      <button onClick={() => router.push('/app')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: 14 }}>← Back to home</button>
    </div>
  )

  if (!state) return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '64px 60px 80px' }}>
        {[60, 85, 70, 90, 55, 75].map((w, i) => (
          <div key={i} style={{
            height: i === 0 ? 40 : 16,
            width: `${w}%`,
            borderRadius: 6,
            marginBottom: i === 0 ? 28 : 10,
            background: 'var(--border)',
            opacity: 0.6 - i * 0.05,
          }} />
        ))}
      </div>
    </div>
  )

  return <PageView page={state.page} canEdit={state.canEdit} canManage={state.canManage} isOwner={state.isOwner} isWorkspaceMember={state.isWorkspaceMember} userId={state.userId} />
}

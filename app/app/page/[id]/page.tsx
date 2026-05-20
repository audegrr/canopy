'use client'
import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import PageView from '@/components/PageView'

// Module-level cache — persists across navigations
const cache = new Map<string, any>()

// Pre-warm cache on hover
if (typeof window !== 'undefined') {
  window.addEventListener('canopy:prewarm', async (e: any) => {
    const pid = e.detail?.pageId
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
      if (!page) return
      const isOwner = page.owner_id === user.id
      const { data: wsMem } = await sb.from('workspace_members').select('role, workspace_id').eq('user_id', user.id)
      const { data: ownedWs } = await sb.from('workspaces').select('id').eq('id', page.workspace_id).eq('owner_id', user.id).single()
      const isWsOwner = !!ownedWs
      const canEdit = isOwner
        || isWsOwner
        || share?.permission === 'edit'
        || page.link_permission === 'edit'
        || (wsMem || []).some((m: any) => m.workspace_id === page.workspace_id && ['owner','member'].includes(m.role))
      const result = { page, canEdit, isOwner, userId: user.id }
      cache.set(pid, result)
      // Also sync to window.__pageCache so instant navigation uses correct permissions
      ;(window as any).__pageCache = (window as any).__pageCache || new Map()
      ;(window as any).__pageCache.set(pid, result)
    } catch {}
  })
}

export default function PageRoute() {
  const params = useParams()
  const id = params?.id as string
  const router = useRouter()
  const [state, setState] = useState<{
    page: any; canEdit: boolean; isOwner: boolean; userId: string
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
    const winCache = (window as any).__pageCache?.get(id)
    if (winCache) setState(winCache)

    const supabase = createClient()

    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const [{ data: page }, { data: share }, { data: wsMember }] = await Promise.all([
        supabase.from('pages').select('*').eq('id', id).single(),
        supabase.from('page_shares').select('permission')
          .eq('page_id', id).eq('user_id', user.id).single(),
        supabase.from('workspace_members').select('role, workspace_id')
          .eq('user_id', user.id)
      ])

      // If page not found, might be a workspace member page — RLS allows it
      // but only if workspace_members RLS is working correctly
      let resolvedPage = page
      if (!resolvedPage) {
        // Try again — the page might be accessible via workspace membership
        const { data: p2 } = await supabase.from('pages').select('*').eq('id', id).single()
        resolvedPage = p2
      }
      if (!resolvedPage && !share) { setError(true); return }
      if (!resolvedPage) { router.push(`/share/${id}`); return }

      const isOwner = resolvedPage.owner_id === user.id

      // Check if the current user owns the workspace (workspace creators are NOT in workspace_members)
      const { data: ownedWorkspace } = await supabase
        .from('workspaces').select('id')
        .eq('id', resolvedPage.workspace_id).eq('owner_id', user.id).single()
      const isWsOwner = !!ownedWorkspace

      const isMember = (wsMember || []).some((m: any) => m.workspace_id === resolvedPage.workspace_id)
      const canView = isOwner || isWsOwner || !!share || resolvedPage.link_permission !== 'none' || isMember
      if (!canView) { setError(true); return }

      const canEdit = isOwner
        || isWsOwner
        || share?.permission === 'edit'
        || resolvedPage.link_permission === 'edit'
        || (wsMember || []).some((m: any) => m.workspace_id === resolvedPage.workspace_id && ['owner','member'].includes(m.role))
      const result = { page: resolvedPage, canEdit, isOwner, userId: user.id }
      cache.set(id, result)
      // Keep window.__pageCache in sync so future instant navigations use real permissions
      ;(window as any).__pageCache = (window as any).__pageCache || new Map()
      ;(window as any).__pageCache.set(id, result)
      setState(result)
      document.title = (resolvedPage.title || 'Untitled') + ' — Canopy'
    }

    load()
  }, [id])

  if (error) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
      <img src="/canopy_favicon_no_bg.ico" alt="Canopy" style={{ width: 72, height: 72, objectFit: 'contain' }} />
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

  return <PageView page={state.page} canEdit={state.canEdit} isOwner={state.isOwner} userId={state.userId} />
}

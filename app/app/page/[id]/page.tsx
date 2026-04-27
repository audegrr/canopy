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
      const canEdit = isOwner || share?.permission === 'edit' || page.link_permission === 'edit'
      cache.set(pid, { page, canEdit, isOwner, userId: user.id })
    } catch {}
  })
}

export default function PageRoute() {
  const params = useParams()
  const id = params?.id as string
  const router = useRouter()
  const [state, setState] = useState<{
    page: any; canEdit: boolean; isOwner: boolean; userId: string
  } | null>(cache.get(id) || null)
  const [error, setError] = useState(false)
  const loadingRef = useRef('')

  useEffect(() => {
    if (!id || loadingRef.current === id) return
    loadingRef.current = id

    // Check module cache first, then window cache from AppShell prewarm
    const cached = cache.get(id) || (typeof window !== 'undefined' && (window as any).__pageCache?.get(id))
    if (cached) {
      cache.set(id, cached) // promote to module cache
      setState(cached)
    }

    const supabase = createClient()

    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const [{ data: page }, { data: share }] = await Promise.all([
        supabase.from('pages').select('*').eq('id', id).single(),
        supabase.from('page_shares').select('permission')
          .eq('page_id', id).eq('user_id', user.id).single()
      ])

      if (!page && !share) { setError(true); return }
      if (!page) { router.push(`/share/${id}`); return }

      const isOwner = page.owner_id === user.id
      const canView = isOwner || !!share || page.link_permission !== 'none'
      if (!canView) { setError(true); return }

      const canEdit = isOwner || share?.permission === 'edit' || page.link_permission === 'edit'
      const result = { page, canEdit, isOwner, userId: user.id }
      cache.set(id, result)
      setState(result)
      document.title = (page.title || 'Untitled') + ' — Canopy'
    }

    load()
  }, [id])

  if (error) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 48 }}>🌿</div>
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

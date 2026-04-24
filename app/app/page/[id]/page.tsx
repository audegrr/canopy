'use client'
import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import PageView from '@/components/PageView'

// ── Local cache ────────────────────────────────────────────────
const pageCache = new Map<string, any>()

// Pre-warm cache on hover — fetches page content before user clicks
if (typeof window !== 'undefined') {
  const supabaseForPrewarm = () => {
    // Lazy import to avoid SSR issues
    const { createClient } = require('@/lib/supabase/client')
    return createClient()
  }

  window.addEventListener('canopy:prewarm', async (e: any) => {
    const { pageId } = e.detail
    if (pageCache.has(pageId)) return // Already cached
    try {
      const sb = supabaseForPrewarm()
      const { data: { user } } = await sb.auth.getUser()
      if (!user) return
      const { data: p } = await sb.from('pages').select('*').eq('id', pageId).single()
      if (!p) return
      const isOwnerVal = p.owner_id === user.id
      const { data: share } = await sb.from('page_shares').select('permission').eq('page_id', pageId).eq('user_id', user.id).single()
      const canEditVal = isOwnerVal || share?.permission === 'edit' || p.link_permission === 'edit'
      pageCache.set(pageId, { page: p, canEdit: canEditVal, isOwner: isOwnerVal, userId: user.id })
    } catch {}
  })
}

// ── Skeleton while loading ──────────────────────────────────────
function PageSkeleton({ title, icon }: { title?: string; icon?: string }) {
  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '64px 60px 80px' }}>
        {icon && <div style={{ fontSize: '52px', marginBottom: '12px', lineHeight: 1 }}>{icon}</div>}
        <div style={{ height: '40px', display: 'flex', alignItems: 'center' }}>
          <span style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-sans)' }}>
            {title || 'Loading…'}
          </span>
        </div>
        {/* Animated content skeleton */}
        <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[90, 75, 85, 60, 80].map((w, i) => (
            <div key={i} style={{
              height: '16px', borderRadius: '4px',
              background: 'linear-gradient(90deg, var(--border) 25%, var(--sidebar-hover) 50%, var(--border) 75%)',
              backgroundSize: '200% 100%',
              animation: `shimmer 1.5s infinite ${i * 0.1}s`,
              width: `${w}%`,
            }} />
          ))}
        </div>
      </div>
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  )
}

export default function PageRoute() {
  const params = useParams()
  const id = params?.id as string
  const router = useRouter()
  const supabase = createClient()

  const [page, setPage] = useState<any>(pageCache.get(id) || null)
  const [skeletonMeta, setSkeletonMeta] = useState<{ title?: string; icon?: string }>({})
  const [userId, setUserId] = useState<string>('')
  const [canEdit, setCanEdit] = useState(false)
  const [isOwner, setIsOwner] = useState(false)
  const [loading, setLoading] = useState(!pageCache.has(id))
  const [notFound, setNotFound] = useState(false)
  const fetchedRef = useRef<string>('')

  // Get sidebar page info for instant display (title + icon)
  const sidebarPage = typeof window !== 'undefined'
    ? (() => {
        try {
          // AppShell broadcasts page info via a custom event — we can also read from DOM
          return null
        } catch { return null }
      })()
    : null

  useEffect(() => {
    function onNavigating(e: any) {
      if (e.detail.pageId === id) {
        setSkeletonMeta({ title: e.detail.title, icon: e.detail.icon })
      }
    }
    window.addEventListener('canopy:navigating', onNavigating)
    return () => window.removeEventListener('canopy:navigating', onNavigating)
  }, [id])

  useEffect(() => {
    if (!id || fetchedRef.current === id) return
    fetchedRef.current = id

    // If cached, show immediately but still revalidate in background
    const cached = pageCache.get(id)
    if (cached) {
      setPage(cached.page)
      setCanEdit(cached.canEdit)
      setIsOwner(cached.isOwner)
      setUserId(cached.userId)
      setLoading(false)
    }

    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: p, error } = await supabase.from('pages').select('*').eq('id', id).single()

      if (error || !p) {
        // Try via share
        const { data: share } = await supabase
          .from('page_shares').select('permission').eq('page_id', id).eq('user_id', user.id).single()
        if (!share) { setNotFound(true); setLoading(false); return }
      }

      if (!p) { setNotFound(true); setLoading(false); return }

      const isOwnerVal = p.owner_id === user.id
      const { data: share } = await supabase
        .from('page_shares').select('permission').eq('page_id', id).eq('user_id', user.id).single()

      const canView = isOwnerVal || !!share || p.link_permission !== 'none'
      const canEditVal = isOwnerVal || share?.permission === 'edit' || p.link_permission === 'edit'

      if (!canView) { setNotFound(true); setLoading(false); return }

      // Update cache
      const cacheEntry = { page: p, canEdit: canEditVal, isOwner: isOwnerVal, userId: user.id }
      pageCache.set(id, cacheEntry)

      setPage(p)
      setCanEdit(canEditVal)
      setIsOwner(isOwnerVal)
      setUserId(user.id)
      setLoading(false)

      // Update page title
      document.title = (p.title || 'Untitled') + ' — Canopy'
    }

    load()
  }, [id])

  // When PageView saves, update cache
  function onPageUpdate(updatedPage: any) {
    if (updatedPage.id) {
      const cached = pageCache.get(updatedPage.id)
      if (cached) pageCache.set(updatedPage.id, { ...cached, page: updatedPage })
    }
  }

  if (notFound) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '12px' }}>
      <div style={{ fontSize: '48px' }}>🌿</div>
      <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>Page not found or access denied.</p>
      <button onClick={() => router.push('/app')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: '14px' }}>← Back to home</button>
    </div>
  )

  // Show skeleton with known title/icon while loading
  if (loading || !page) {
    // Try to get title/icon from the canopy:pageUpdate event cache
    return <PageSkeleton title={skeletonMeta.title} icon={skeletonMeta.icon} />
  }

  return <PageView page={page} canEdit={canEdit} isOwner={isOwner} userId={userId} />
}

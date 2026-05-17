'use client'
import { useState, useRef, useEffect, useCallback, ChangeEvent } from 'react'
import { mdToTiptap } from '@/lib/mdToTiptap'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { Page } from '@/lib/types'
import Editor from './Editor'
import DragHandle from './DragHandle'
import DatabaseView from './DatabaseView'
import EmojiPicker from './EmojiPicker'

type Props = {
  page: Page
  canEdit: boolean
  isOwner: boolean
  userId?: string
  isPublicShare?: boolean
}

export default function PageView({ page: initialPage, canEdit, isOwner, userId = '', isPublicShare = false }: Props) {
  const [page, setPage] = useState(initialPage)
  const initialContentRef = useRef(initialPage.content)
  const [saved, setSaved] = useState(true)
  const [showIconPicker, setShowIconPicker] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [shares, setShares] = useState<any[]>([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('view')
  const [toast, setToast] = useState('')
  const [showSubpagePicker, setShowSubpagePicker] = useState(false)
  const [showImagePicker, setShowImagePicker] = useState(false)
  const [mediaTab, setMediaTab] = useState<'image'|'video'|'file'>('image')
  const [imagePickerCallback, setImagePickerCallback] = useState<{ onUrl: (u: string) => void; onFile: (s: string) => void } | null>(null)
  const imagePickerCallbackRef = useRef<{ onUrl: (u: string) => void; onFile: (s: string) => void } | null>(null)
  const [imageUrl, setImageUrl] = useState('')
  const [subpagePickerCallback, setSubpagePickerCallback] = useState<((id: string) => void) | null>(null)
  const [subpageList, setSubpageList] = useState<any[]>([])
  const [isUploadingCover, setIsUploadingCover] = useState(false)
  const saveTimer = useRef<any>(null)
  const [editorInstance, setEditorInstance] = useState<any>(null)
  const [remoteConflict, setRemoteConflict] = useState<{ content: any; title: string } | null>(null)
  const [presenceUsers, setPresenceUsers] = useState<{ userId: string; name: string; color: string; section?: string }[]>([])
  const savedRef = useRef(true)
  const lastSaveTimestamp = useRef<string | null>(null)
  const editorRef = useRef<any>(null)
  const saveCountRef = useRef(0)
  const importFileRef = useRef<HTMLInputElement>(null)
  const presenceChannelRef = useRef<any>(null)
  const myPresenceRef = useRef<{ name: string; color: string; section: string }>({ name: 'User', color: '#999', section: '' })
  const [historyOpen, setHistoryOpen] = useState(false)
  const [snapshots, setSnapshots] = useState<{ id: string; title: string; content: any; created_at: string }[]>([])
  const [snapshotLoading, setSnapshotLoading] = useState(false)
  const [backlinksOpen, setBacklinksOpen] = useState(false)
  const [backlinks, setBacklinks] = useState<{ id: string; title: string; icon: string }[]>([])
  const [backlinksLoaded, setBacklinksLoaded] = useState(false)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [comments, setComments] = useState<{ id: string; body: string; created_at: string; user_id: string; profile?: { full_name: string | null; email: string } | null }[]>([])
  const [newComment, setNewComment] = useState('')
  const [commentLoading, setCommentLoading] = useState(false)
  const [tocOpen, setTocOpen] = useState(false)
  const [headings, setHeadings] = useState<{ level: number; text: string; idx: number }[]>([])
  const [wordCount, setWordCount] = useState(0)
  const [focusMode, setFocusMode] = useState(false)
  const [showCoverGallery, setShowCoverGallery] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [subPages, setSubPages] = useState<{ id: string; title: string; icon: string; is_database: boolean }[]>([])
  const titleRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    if (shareOpen && isOwner) loadShares()
  }, [shareOpen])

  // Auto-open panel from URL param (e.g. ?panel=share from sidebar menu)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const panel = params.get('panel')
    if (panel === 'share') {
      // Open share panel — works for owners
      setShareOpen(true)
    }
    if (panel === 'export') {
      setTimeout(() => {
        const btn = document.querySelector('[data-export-btn]') as HTMLButtonElement
        btn?.click()
      }, 300)
    }
    // Clean up URL param without reloading
    if (panel) {
      const url = new URL(window.location.href)
      url.searchParams.delete('panel')
      window.history.replaceState({}, '', url.toString())
    }
  }, [])  // Run on mount only — page remounts on navigation

  // Broadcast page updates to sidebar
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('canopy:pageUpdate', { detail: { id: page.id, title: page.title, icon: page.icon } }))
    // Update page title in browser tab
    document.title = (page.title || 'Untitled') + ' — Canopy'
  }, [page.title, page.icon])

  // Listen for share/export open from sidebar context menu
  useEffect(() => {
    const onShare = () => setShareOpen(true)
    const onExport = () => {
      const btn = document.querySelector('[data-export-btn]') as HTMLButtonElement
      btn?.click()
    }
    window.addEventListener('canopy:openShare', onShare)
    window.addEventListener('canopy:openExport', onExport)
    return () => {
      window.removeEventListener('canopy:openShare', onShare)
      window.removeEventListener('canopy:openExport', onExport)
    }
  }, [])

  // Focus mode shortcut + sidebar hide
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'f') {
        e.preventDefault()
        setFocusMode(f => {
          window.dispatchEvent(new CustomEvent(f ? 'canopy:exitFocus' : 'canopy:enterFocus'))
          return !f
        })
      }
      if (e.key === 'Escape' && focusMode) {
        setFocusMode(false)
        window.dispatchEvent(new CustomEvent('canopy:exitFocus'))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [focusMode])

  // Increment view count once per page mount
  useEffect(() => {
    supabase.rpc('increment_page_views', { page_id: page.id }).then(() => {})
  }, [page.id])

  // Load sub-pages
  useEffect(() => {
    if (page.is_database) return
    supabase.from('pages')
      .select('id, title, icon, is_database')
      .eq('parent_id', page.id)
      .is('deleted_at', null)
      .order('position')
      .then(({ data }) => setSubPages(data || []))
  }, [page.id])

  // Sync sub-page title/icon updates from sidebar events
  useEffect(() => {
    const handler = (e: Event) => {
      const { id, title, icon } = (e as CustomEvent).detail || {}
      if (!id) return
      setSubPages(sp => sp.map(p => p.id === id ? { ...p, ...(title !== undefined ? { title } : {}), ...(icon !== undefined ? { icon } : {}) } : p))
    }
    window.addEventListener('canopy:pageUpdate', handler)
    return () => window.removeEventListener('canopy:pageUpdate', handler)
  }, [])

  // Realtime: live sync + presence
  useEffect(() => {
    if (!userId) return

    const PRESENCE_COLORS = ['#e07b39','#0b6e99','#0f7b6c','#6940a5','#ad1a72','#d9730d']
    const myColor = PRESENCE_COLORS[parseInt(userId.slice(-2), 16) % PRESENCE_COLORS.length]

    // Fetch display name for presence
    supabase.from('profiles').select('full_name, email').eq('id', userId).single().then(({ data }) => {
      const name = data?.full_name || data?.email?.split('@')[0] || 'User'
      myPresenceRef.current = { ...myPresenceRef.current, name, color: myColor }
    })

    const channel = supabase.channel(`page:${page.id}`, { config: { presence: { key: userId } } })
    presenceChannelRef.current = channel

    channel
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pages', filter: `id=eq.${page.id}` }, payload => {
        const remote = payload.new as any
        // Ignore our own saves (matched by timestamp)
        if (remote.updated_at === lastSaveTimestamp.current) return
        if (savedRef.current) {
          // No unsaved local changes — silently apply remote content
          if (remote.content) editorRef.current?.commands.setContent(remote.content)
          setPage(p => ({ ...p, content: remote.content ?? p.content, title: remote.title ?? p.title }))
          if (remote.title && titleRef.current) titleRef.current.textContent = remote.title
        } else {
          // We have unsaved local changes — surface conflict
          setRemoteConflict({ content: remote.content, title: remote.title })
        }
      })
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<{ name: string; color: string; section?: string }>()
        const others = Object.entries(state)
          .filter(([key]) => key !== userId)
          .flatMap(([key, presences]) => presences.map(p => ({ userId: key, name: p.name || 'Someone', color: p.color || '#999', section: p.section || '' })))
        setPresenceUsers(others)
      })
      .subscribe(async status => {
        if (status === 'SUBSCRIBED') {
          myPresenceRef.current.color = myColor
          await channel.track({ ...myPresenceRef.current })
        }
      })

    return () => { presenceChannelRef.current = null; supabase.removeChannel(channel) }
  }, [page.id, userId])

  // Listen for subpage picker request from editor
  useEffect(() => {
    async function onPicker(e: any) {
      const supabaseClient = createClient()
      const { data: ownPages } = await supabaseClient.from('pages').select('id, title, icon, parent_id').eq('workspace_id', page.workspace_id).neq('id', page.id).order('title')
      const { data: sharedPagesData } = await supabaseClient.rpc('get_shared_pages', { user_uuid: (await supabaseClient.auth.getUser()).data.user?.id || '' })
      const data = [
        ...(ownPages || []),
        ...(sharedPagesData || []).filter((sp: any) => sp.id !== page.id).map((sp: any) => ({ id: sp.id, title: sp.title, icon: sp.icon, parent_id: sp.parent_id, isShared: true }))
      ]
      // Show children of current page first, then others
      const sorted = (data || []).sort((a: any, b: any) => {
        const aIsChild = a.parent_id === page.id ? -1 : 0
        const bIsChild = b.parent_id === page.id ? -1 : 0
        return aIsChild - bIsChild
      })
      setSubpageList(sorted)
      setSubpagePickerCallback(() => e.detail.onSelect)
      setShowSubpagePicker(true)
    }
    window.addEventListener('canopy:showSubpagePicker', onPicker)
    return () => window.removeEventListener('canopy:showSubpagePicker', onPicker)
  }, [page.workspace_id])

  // Image picker listener
  useEffect(() => {
    function onImagePicker(e: any) {
      setMediaTab(e.detail?.tab || 'image')
      // Callback comes from Editor via ref, stored in event detail or separately
      if (e.detail?.onUrl) {
        const cb = { onUrl: e.detail.onUrl, onFile: e.detail.onFile }
        setImagePickerCallback(cb)
        imagePickerCallbackRef.current = cb
      }
      setImageUrl('')
      setShowImagePicker(true)
    }
    window.addEventListener('canopy:showImagePicker', onImagePicker)
    window.addEventListener('canopy:showMediaPicker', onImagePicker)
    // Also listen for direct video/file picker requests
    function onVideoPicker() { setMediaTab('video'); setShowImagePicker(true) }
    function onFilePicker() { setMediaTab('file'); setShowImagePicker(true) }
    window.addEventListener('canopy:showVideoPicker', onVideoPicker)
    window.addEventListener('canopy:showFilePicker', onFilePicker)

    async function onUploadFile(e: any) {
      const file: File = e.detail?.file
      if (!file) return
      const url = await uploadFileRef.current?.(file)
      if (!url) return
      if (file.type.startsWith('image/')) {
        window.dispatchEvent(new CustomEvent('canopy:insertImage', { detail: { src: url } }))
      } else if (file.type.startsWith('video/')) {
        window.dispatchEvent(new CustomEvent('canopy:insertVideo', { detail: { src: url } }))
      } else {
        window.dispatchEvent(new CustomEvent('canopy:insertFile', { detail: { src: url, name: file.name, size: file.size, mime: file.type } }))
      }
    }
    window.addEventListener('canopy:uploadFile', onUploadFile)

    return () => {
      window.removeEventListener('canopy:showImagePicker', onImagePicker)
      window.removeEventListener('canopy:showMediaPicker', onImagePicker)
      window.removeEventListener('canopy:showVideoPicker', onVideoPicker)
      window.removeEventListener('canopy:showFilePicker', onFilePicker)
      window.removeEventListener('canopy:uploadFile', onUploadFile)
    }
  }, [])

  // Sync title display
  useEffect(() => {
    if (titleRef.current && titleRef.current.textContent !== page.title) {
      titleRef.current.textContent = page.title
    }
  }, [page.id])

  async function loadShares() {
    const { data } = await supabase.from('page_shares').select('*').eq('page_id', page.id)
    if (!data) return
    const enriched = await Promise.all(data.map(async s => {
      const { data: profile } = await supabase.from('profiles').select('email, full_name').eq('id', s.user_id).single()
      return { ...s, email: profile?.email || s.user_id, name: profile?.full_name }
    }))
    setShares(enriched)
  }

  async function removeUserShare(uid: string) {
    await supabase.from('page_shares').delete().eq('page_id', page.id).eq('user_id', uid)
    // Also remove from sub-pages
    const { data: subIds } = await supabase.rpc('get_all_subpage_ids', { page_id: page.id })
    if (subIds) for (const row of subIds) {
      await supabase.from('page_shares').delete().eq('page_id', row.id).eq('user_id', uid)
    }
    loadShares()
    showToast('Access removed')
  }

  function scheduleSave(updates: Partial<Page>) {
    setSaved(false)
    savedRef.current = false
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      const ts = new Date().toISOString()
      await supabase.from('pages').update({ ...updates, updated_at: ts }).eq('id', page.id)
      lastSaveTimestamp.current = ts
      setSaved(true)
      savedRef.current = true
      // Save a snapshot every 10 edits (silently ignore if table doesn't exist)
      saveCountRef.current += 1
      if (saveCountRef.current % 10 === 0) {
        const snap = { page_id: page.id, title: updates.title ?? page.title, content: updates.content ?? page.content, saved_by: userId }
        supabase.from('page_snapshots').insert(snap).then(() => {})
        // Prune: keep only last 50
        supabase.rpc('prune_page_snapshots', { p_page_id: page.id, p_keep: 50 }).then(() => {})
      }
    }, 800)
  }

  function onTitleInput(e: React.FormEvent<HTMLDivElement>) {
    const title = (e.target as HTMLDivElement).textContent || ''
    setPage(p => ({ ...p, title }) as Page)
    scheduleSave({ title })
    // Immediately update sidebar
    window.dispatchEvent(new CustomEvent('canopy:pageUpdate', { detail: { id: page.id, title } }))
    document.title = (title || 'Untitled') + ' — Canopy'
  }

  function onContentUpdate(content: any) {
    setPage(p => ({ ...p, content }) as Page)
    scheduleSave({ content })
    // Deep traversal for headings — matches querySelectorAll DOM order
    const topNodes: any[] = Array.isArray(content) ? content : (content?.content || [])
    const hs: { level: number; text: string; idx: number }[] = []
    let hIdx = 0
    function collectHeadings(node: any) {
      if (node.type === 'heading') {
        const text = (node.content || []).map((c: any) => c.text || '').join('')
        if (text) hs.push({ level: node.attrs?.level || 1, text, idx: hIdx++ })
      }
      if (node.content) node.content.forEach(collectHeadings)
    }
    topNodes.forEach(collectHeadings)
    setHeadings(hs)
    // Word count
    const text = topNodes.map((n: any) => extractText(n)).join(' ')
    setWordCount(text.trim() ? text.trim().split(/\s+/).length : 0)
    // Broadcast current section via presence
    const topSection = hs.find(h => h.level <= 2)?.text || ''
    if (presenceChannelRef.current && topSection !== myPresenceRef.current.section) {
      myPresenceRef.current.section = topSection
      presenceChannelRef.current.track({ ...myPresenceRef.current })
    }
  }

  function extractText(node: any): string {
    if (node.text) return node.text
    return (node.content || []).map((c: any) => extractText(c)).join(' ')
  }

  function setIcon(icon: string) {
    setPage(p => ({ ...p, icon }) as Page)
    scheduleSave({ icon })
    setShowIconPicker(false)
    // Immediately update sidebar
    window.dispatchEvent(new CustomEvent('canopy:pageUpdate', { detail: { id: page.id, icon } }))
  }

  const uploadFileRef = useRef<(file: File) => Promise<string | null>>(null as any)
  async function uploadFile(file: File, bucket = 'images'): Promise<string | null> {
    const ext = file.name.split('.').pop()
    const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const { error } = await supabase.storage.from(bucket).upload(path, file)
    if (error) { showToast('Upload failed: ' + error.message); return null }
    const { data } = supabase.storage.from(bucket).getPublicUrl(path)
    return data.publicUrl
  }
  uploadFileRef.current = uploadFile

  async function uploadCover(file: File) {
    setIsUploadingCover(true)
    const path = `${userId}/covers/${Date.now()}.${file.name.split('.').pop()}`
    const { error } = await supabase.storage.from('images').upload(path, file)
    if (!error) {
      const { data } = supabase.storage.from('images').getPublicUrl(path)
      const url = data.publicUrl
      setPage(p => ({ ...p, cover_url: url }) as Page)
      scheduleSave({ cover_url: url })
    } else {
      showToast('Upload failed')
    }
    setIsUploadingCover(false)
  }

  async function removeCover() {
    setPage(p => ({ ...p, cover_url: '' }) as Page)
    scheduleSave({ cover_url: '' })
  }

  async function inviteUser() {
    if (!inviteEmail.trim()) return
    // Try profiles table first, then auth.users via RPC
    let userId: string | null = null
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .ilike('email', inviteEmail.trim())
      .single()
    if (profile) {
      userId = profile.id
    } else {
      // Try finding by exact email match in profiles
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, email')
        .ilike('email', inviteEmail.trim())
      if (profiles && profiles.length > 0) userId = profiles[0].id
    }
    if (!userId) {
      showToast('User not found — make sure they have a Canopy account')
      return
    }
    // Share the page
    const { error } = await supabase.from('page_shares').upsert({
      page_id: page.id, user_id: userId, permission: inviteRole
    }, { onConflict: 'page_id,user_id' })
    if (error) { showToast('Error: ' + error.message); return }
    // Share all sub-pages automatically
    const { data: subIds } = await supabase.rpc('get_all_subpage_ids', { page_id: page.id })
    if (subIds) {
      for (const row of subIds) {
        await supabase.from('page_shares').upsert({
          page_id: row.id, user_id: userId, permission: inviteRole
        }, { onConflict: 'page_id,user_id' })
      }
    }
    fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        type: 'page_share',
        title: `"${(page as any).title || 'Untitled'}" was shared with you`,
        body: `You received ${inviteRole === 'edit' ? 'edit' : 'view'} access.`,
        data: { page_id: page.id, page_title: (page as any).title }
      })
    }).catch(() => {})
    setInviteEmail('')
    loadShares()
    showToast(`✅ Shared with ${inviteEmail}`)
  }

  async function removeShare(uid: string) {
    await removeUserShare(uid)
  }

  async function updateLinkPerm(perm: string) {
    await supabase.from('pages').update({ link_permission: perm }).eq('id', page.id)
    setPage(p => ({ ...p, link_permission: perm }) as Page)
    const { data: subIds } = await supabase.rpc('get_all_subpage_ids', { page_id: page.id })
    if (subIds) for (const row of subIds) {
      await supabase.from('pages').update({ link_permission: perm }).eq('id', row.id)
    }
  }

  async function toggleLock() {
    const newVal = !page.is_locked
    await supabase.from('pages').update({ is_locked: newVal }).eq('id', page.id)
    setPage(p => ({ ...p, is_locked: newVal }))
    showToast(newVal ? 'Page locked — editing disabled' : 'Page unlocked')
  }

  async function createSubPage() {
    const maxPos = subPages.reduce((m, p) => Math.max(m, 0), 0)
    const { data } = await supabase.from('pages').insert({
      workspace_id: page.workspace_id,
      parent_id: page.id,
      title: '',
      icon: '',
      content: { type: 'doc', content: [] },
      position: maxPos + 1,
      is_database: false,
      link_permission: 'none',
    }).select('id, title, icon, is_database').single()
    if (data) {
      setSubPages(sp => [...sp, data as any])
      router.push(`/app/page/${data.id}`)
    }
  }

  async function saveAsTemplate() {
    const description = prompt('Template description (optional):') ?? ''
    const { error } = await supabase.from('page_templates').insert({
      workspace_id: page.workspace_id,
      user_id: userId,
      title: page.title || 'Untitled',
      icon: page.icon || '',
      description,
      content: page.content,
    })
    if (error) { showToast('Failed to save template'); return }
    showToast('Saved as template!')
  }

  async function deletePage() {
    if (!confirm('Delete this page and all its sub-pages?')) return
    await supabase.from('pages').delete().eq('id', page.id)
    router.push('/app')
  }

  async function duplicatePage() {
    const { data } = await supabase.from('pages').insert({
      workspace_id: page.workspace_id,
      parent_id: page.parent_id,
      title: page.title + ' (copy)',
      icon: page.icon,
      content: page.content,
      position: page.position + 0.5,
      is_database: page.is_database,
      link_permission: 'none'
    }).select().single()
    if (data) {
      router.push(`/app/page/${data.id}`)
      showToast('Page duplicated!')
    }
  }

  async function exportPDF() {
    const source = document.querySelector('.print-content') as HTMLElement
    if (!source) { showToast('Nothing to export'); return }
    showToast('Opening print dialog — select "Save as PDF"')

    // Clone to a direct body child to bypass overflow:hidden ancestors
    const clone = source.cloneNode(true) as HTMLElement
    clone.id = 'print-clone'
    document.body.appendChild(clone)
    document.body.classList.add('printing-page')

    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))

    const cleanup = () => {
      document.body.classList.remove('printing-page')
      document.getElementById('print-clone')?.remove()
      window.removeEventListener('afterprint', cleanup)
    }
    window.addEventListener('afterprint', cleanup, { once: true })
    setTimeout(cleanup, 15000) // safety net

    window.print()
  }

  async function exportCSV() {
    const supabase = createClient()
    const [{ data: fields }, { data: records }] = await Promise.all([
      supabase.from('db_fields').select('*').eq('page_id', page.id).order('position'),
      supabase.from('db_records').select('*').eq('page_id', page.id).order('position'),
    ])
    if (!fields) return
    const header = fields.map((f: any) => `"${f.name.replace(/"/g, '""')}"`).join(',')
    const rows = (records || []).map((rec: any) =>
      fields.map((f: any) => `"${String(rec.data?.[f.id] ?? '').replace(/"/g, '""')}"`)
        .join(',')
    )
    const csv = [header, ...rows].join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = (page.title || 'database') + '.csv'
    a.click()
    URL.revokeObjectURL(url)
    showToast('CSV downloaded!')
  }

  async function exportXLSX() {
    const { default: XLSX } = await import('xlsx')
    const supabase = createClient()
    const [{ data: fields }, { data: records }] = await Promise.all([
      supabase.from('db_fields').select('*').eq('page_id', page.id).order('position'),
      supabase.from('db_records').select('*').eq('page_id', page.id).order('position'),
    ])
    if (!fields) return
    const header = fields.map((f: any) => f.name)
    const rows = (records || []).map((rec: any) => fields.map((f: any) => {
      const v = rec.data?.[f.id]
      if (f.type === 'checkbox') return v ? 'Yes' : 'No'
      if (f.type === 'number') return v !== undefined && v !== '' ? Number(v) : ''
      return String(v ?? '')
    }))
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
    ws['!cols'] = header.map((h: string, i: number) => ({
      wch: Math.max(h.length, ...rows.map((r: any) => String(r[i] ?? '').length), 8)
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, (page.title || 'Database').slice(0, 31))
    XLSX.writeFile(wb, (page.title || 'database') + '.xlsx')
    showToast('Excel downloaded!')
  }

  function exportMarkdown() {
    const nodes: any[] = Array.isArray(page.content) ? page.content : ((page.content as any)?.content || [])
    const md = `# ${page.icon ? page.icon + ' ' : ''}${page.title || 'Untitled'}\n\n` + nodesToMd(nodes)
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = (page.title || 'page').replace(/[/\\:*?"<>|]/g, '-') + '.md'
    a.click()
    URL.revokeObjectURL(url)
    showToast('Markdown downloaded!')
  }

  function triggerMarkdownImport() {
    importFileRef.current?.click()
  }

  async function handleMarkdownImport(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const text = await file.text()
    const doc = mdToTiptap(text)
    if (editorRef.current) {
      editorRef.current.commands.setContent(doc)
    }
    showToast('Markdown imported!')
  }

  async function exportWord() {
    // Simple HTML to docx via browser download
    const content = document.querySelector('.tiptap')?.innerHTML || ''
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${page.title}</title><style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;font-size:14px;line-height:1.6;}h1{font-size:24px;}h2{font-size:20px;}h3{font-size:16px;}table{border-collapse:collapse;width:100%;}td,th{border:1px solid #ccc;padding:6px 10px;}</style></head><body><h1>${page.icon} ${page.title}</h1>${content}</body></html>`
    const blob = new Blob([html], { type: 'application/msword' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = (page.title || 'page') + '.doc'
    a.click()
    URL.revokeObjectURL(url)
    showToast('Downloading Word document…')
  }

  function copyShareLink() {
    navigator.clipboard?.writeText(`${window.location.origin}/share/${page.id}`)
    showToast('Link copied!')
  }

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 2500) }
  function isCssBackground(v: string) { return v.startsWith('linear-gradient') || v.startsWith('radial-gradient') || (v.startsWith('#') && v.length <= 9) }

  async function loadSnapshots() {
    setSnapshotLoading(true)
    const { data } = await supabase.from('page_snapshots').select('id, title, content, created_at').eq('page_id', page.id).order('created_at', { ascending: false }).limit(50)
    setSnapshots(data || [])
    setSnapshotLoading(false)
  }

  async function loadBacklinks() {
    if (backlinksLoaded) return
    const { data } = await supabase.rpc('get_backlinks', { target_page_id: page.id })
    setBacklinks(data || [])
    setBacklinksLoaded(true)
  }

  async function loadComments() {
    const { data } = await supabase
      .from('page_comments')
      .select('id, body, created_at, user_id, profile:profiles(full_name, email)')
      .eq('page_id', page.id)
      .order('created_at', { ascending: true })
    setComments((data as any) || [])
  }

  async function addComment() {
    if (!newComment.trim() || commentLoading) return
    setCommentLoading(true)
    const body = newComment.trim()
    const { data, error } = await supabase
      .from('page_comments')
      .insert({ page_id: page.id, user_id: userId, body })
      .select('id, body, created_at, user_id, profile:profiles(full_name, email)')
      .single()
    if (!error && data) {
      setComments(c => [...c, data as any])
      setNewComment('')
      const commenterName = myPresenceRef.current.name || 'Someone'
      // Notify the page owner if they're not the commenter
      if (page.owner_id && page.owner_id !== userId) {
        supabase.from('notifications').insert({
          user_id: page.owner_id,
          type: 'comment',
          title: `${commenterName} commented on "${page.title || 'Untitled'}"`,
          body: body.slice(0, 120),
          read: false,
          data: { page_id: page.id, workspace_id: page.workspace_id },
        }).then(() => {})
      }
      // Notify mentioned pages' owners via @PageTitle patterns
      const mentions = [...body.matchAll(/@([\w\s]{1,40})/g)].map(m => m[1].trim()).filter(Boolean)
      if (mentions.length > 0) {
        supabase.from('pages').select('id, title, owner_id').eq('workspace_id', page.workspace_id).is('deleted_at', null).then(({ data: ws_pages }) => {
          if (!ws_pages) return
          const notified = new Set<string>()
          for (const mentionText of mentions) {
            const matched = ws_pages.find(p => p.title?.toLowerCase() === mentionText.toLowerCase())
            if (matched && matched.owner_id && matched.owner_id !== userId && !notified.has(matched.owner_id)) {
              notified.add(matched.owner_id)
              supabase.from('notifications').insert({
                user_id: matched.owner_id,
                type: 'mention',
                title: `${commenterName} mentioned "${matched.title}" in a comment`,
                body: body.slice(0, 120),
                read: false,
                data: { page_id: matched.id, workspace_id: page.workspace_id },
              }).then(() => {})
            }
          }
        })
      }
    }
    setCommentLoading(false)
  }

  async function deleteComment(id: string) {
    await supabase.from('page_comments').delete().eq('id', id)
    setComments(c => c.filter(x => x.id !== id))
  }

  function restoreSnapshot(snap: { content: any; title: string }) {
    editorRef.current?.commands.setContent(snap.content)
    setPage(p => ({ ...p, content: snap.content, title: snap.title }))
    if (titleRef.current) titleRef.current.textContent = snap.title
    scheduleSave({ content: snap.content, title: snap.title })
    setHistoryOpen(false)
    showToast('Version restored')
  }

  const mobilePanel: React.CSSProperties = {
    position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(85vw, 340px)',
    background: 'var(--surface)', borderLeft: '1px solid var(--border)',
    display: 'flex', flexDirection: 'column', zIndex: 200, boxShadow: '-4px 0 24px rgba(0,0,0,0.15)'
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
      <input ref={importFileRef} type="file" accept=".md,text/markdown,text/plain" style={{ display: 'none' }} onChange={handleMarkdownImport} />

      {/* Top bar */}
      <div style={{ height: focusMode ? 0 : '48px', padding: focusMode ? 0 : '0 12px', borderBottom: focusMode ? 'none' : '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, overflow: 'hidden', transition: 'height 0.2s, padding 0.2s' }}>

        {isPublicShare ? (
          /* Public share: Canopy branding left, sign-in CTA right */
          <>
            <a href="/" style={{ display: 'flex', alignItems: 'center', gap: '7px', textDecoration: 'none', color: 'var(--text)', flexShrink: 0 }}>
              <img src="/icon.svg" alt="Canopy" style={{ width: 22, height: 22, borderRadius: 5 }} />
              <span style={{ fontWeight: 700, fontSize: '14px', letterSpacing: '-0.01em' }}>Canopy</span>
            </a>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-tertiary)', overflow: 'hidden', minWidth: 0, paddingLeft: 8, borderLeft: '1px solid var(--border)', marginLeft: 2 }}>
              {page.icon && <span style={{ fontSize: '14px', flexShrink: 0 }}>{page.icon}</span>}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{page.title || 'Untitled'}</span>
            </div>
            <a href="/login" style={{ flexShrink: 0, background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 12px', fontSize: '13px', fontWeight: 500, color: 'var(--text)', textDecoration: 'none', fontFamily: 'var(--font-sans)' }}>Sign in</a>
            <a href="/login" style={{ flexShrink: 0, background: 'var(--accent)', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: '13px', fontWeight: 600, color: '#fff', textDecoration: 'none', fontFamily: 'var(--font-sans)' }}>Get started free</a>
          </>
        ) : (
          <>
            {/* Hamburger — opens sidebar on mobile */}
            {isMobile && (
              <button onClick={() => window.dispatchEvent(new CustomEvent('canopy:openSidebar'))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 18, padding: '4px 6px', borderRadius: 5, flexShrink: 0, lineHeight: 1 }}>
                ☰
              </button>
            )}

            {/* Breadcrumb title */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-tertiary)', overflow: 'hidden', minWidth: 0 }}>
              {page.icon && <span style={{ fontSize: '14px', flexShrink: 0 }}>{page.icon}</span>}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{page.title || 'Untitled'}</span>
            </div>
          </>
        )}

        {/* Presence avatars, saving indicator, action buttons — hidden for public share */}
        {!isPublicShare && presenceUsers.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
            {presenceUsers.slice(0, isMobile ? 2 : 4).map(u => (
              <div key={u.userId} title={u.section ? `${u.name} — ${u.section}` : u.name}
                style={{ position: 'relative', width: 24, height: 24, borderRadius: '50%', background: u.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: '#fff', border: '2px solid var(--surface)', marginLeft: -4, flexShrink: 0, cursor: 'default' }}>
                {u.name.charAt(0).toUpperCase()}
                {u.section && (
                  <span style={{ position: 'absolute', bottom: -18, left: '50%', transform: 'translateX(-50%)', background: u.color, color: '#fff', fontSize: 9, fontWeight: 600, padding: '1px 5px', borderRadius: 4, whiteSpace: 'nowrap', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', pointerEvents: 'none', zIndex: 10 }}>
                    {u.section}
                  </span>
                )}
              </div>
            ))}
            {presenceUsers.length > (isMobile ? 2 : 4) && (
              <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'var(--text-secondary)', border: '2px solid var(--surface)', marginLeft: -4 }}>
                +{presenceUsers.length - (isMobile ? 2 : 4)}
              </div>
            )}
          </div>
        )}

        {!isPublicShare && <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', flexShrink: 0, transition: 'opacity 0.3s', opacity: saved ? 0 : 1 }}>Saving…</span>}

        {/* Desktop buttons */}
        {!isPublicShare && !isMobile && <>
          {/* Separator */}
          {wordCount > 0 && <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', flexShrink: 0 }}>{wordCount}w</span>}
          {(page.view_count ?? 0) > 1 && <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', flexShrink: 0 }} title="Total views"><TbIcon d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z" size={12}/> {page.view_count}</span>}
          <div style={{ width: 1, height: 16, background: 'var(--border)', flexShrink: 0 }} />
          <ExportMenu onPDF={exportPDF} onWord={exportWord} onCSV={exportCSV} onXLSX={page.is_database ? exportXLSX : undefined} onMarkdown={exportMarkdown} onImportMarkdown={canEdit && !page.is_database ? triggerMarkdownImport : undefined} isDatabase={!!page.is_database} onSaveTemplate={!page.is_database && canEdit ? saveAsTemplate : undefined} />
          <TopBarBtn onClick={exportPDF} iconOnly title="Print / Save as PDF"><TbIcon d={TB_ICONS.print} /></TopBarBtn>
          <div style={{ width: 1, height: 16, background: 'var(--border)', flexShrink: 0 }} />
          {!page.is_database && headings.length > 0 && (
            <TopBarBtn onClick={() => setTocOpen(o => !o)} active={tocOpen} title="Table of contents"><TbIcon d={TB_ICONS.toc} />ToC</TopBarBtn>
          )}
          {canEdit && <TopBarBtn onClick={() => { setHistoryOpen(o => !o); if (!historyOpen) loadSnapshots() }} active={historyOpen} title="Version history"><TbIcon d={TB_ICONS.history} />History</TopBarBtn>}
          {!page.is_database && (
            <TopBarBtn onClick={() => { setBacklinksOpen(o => !o); loadBacklinks() }} active={backlinksOpen} title="Backlinks">
              <TbIcon d={TB_ICONS.backlink} />{backlinksLoaded && backlinks.length > 0 ? backlinks.length : ''}
            </TopBarBtn>
          )}
          <TopBarBtn onClick={() => { setCommentsOpen(o => !o); if (!commentsOpen) loadComments() }} active={commentsOpen} title="Comments">
            <TbIcon d={TB_ICONS.chat} />{comments.length > 0 ? comments.length : ''}
          </TopBarBtn>
          <TopBarBtn onClick={() => { setFocusMode(f => { window.dispatchEvent(new CustomEvent(f ? 'canopy:exitFocus' : 'canopy:enterFocus')); return !f }) }} iconOnly active={focusMode} title="Focus mode (⌘⇧F)">
            <TbIcon d={focusMode ? TB_ICONS.focusOut : TB_ICONS.focusIn} />
          </TopBarBtn>
          <div style={{ width: 1, height: 16, background: 'var(--border)', flexShrink: 0 }} />
          {isOwner && (
            <TopBarBtn onClick={toggleLock} iconOnly title={page.is_locked ? 'Unlock page' : 'Lock page'} active={!!page.is_locked}>
              <TbIcon d={page.is_locked ? TB_ICONS.lock : TB_ICONS.unlock} />
            </TopBarBtn>
          )}
          {isOwner && <TopBarBtn active={shareOpen} onClick={() => setShareOpen(o => !o)} data-share-btn><TbIcon d={TB_ICONS.share} />Share</TopBarBtn>}
        </>}

        {/* Mobile: compact action row */}
        {!isPublicShare && isMobile && <>
          <TopBarBtn onClick={() => { setCommentsOpen(o => !o); if (!commentsOpen) loadComments() }} active={commentsOpen} iconOnly>
            <TbIcon d={TB_ICONS.chat} />{comments.length > 0 ? comments.length : ''}
          </TopBarBtn>
          {isOwner && <TopBarBtn active={shareOpen} onClick={() => setShareOpen(o => !o)} data-share-btn iconOnly><TbIcon d={TB_ICONS.share} /></TopBarBtn>}
          {/* Mobile overflow menu */}
          <div style={{ position: 'relative' }}>
            <TopBarBtn onClick={() => setMobileMenuOpen(o => !o)} active={mobileMenuOpen}>⋯</TopBarBtn>
            {mobileMenuOpen && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 199 }} onClick={() => setMobileMenuOpen(false)} />
                <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 6, boxShadow: 'var(--shadow-lg)', zIndex: 200, minWidth: 180 }} className="scale-in">
                  <MobileMenuItem onClick={() => { exportPDF(); setMobileMenuOpen(false) }}>📄 Export PDF</MobileMenuItem>
                  {!page.is_database && <MobileMenuItem onClick={() => { exportMarkdown(); setMobileMenuOpen(false) }}>⬇️ Export Markdown</MobileMenuItem>}
                  {canEdit && !page.is_database && <MobileMenuItem onClick={() => { triggerMarkdownImport(); setMobileMenuOpen(false) }}>⬆️ Import Markdown</MobileMenuItem>}
                  {canEdit && !page.is_database && <MobileMenuItem onClick={() => { saveAsTemplate(); setMobileMenuOpen(false) }}>📋 Save as template</MobileMenuItem>}
                  {page.is_database && <MobileMenuItem onClick={() => { exportCSV(); setMobileMenuOpen(false) }}>📊 Export CSV</MobileMenuItem>}
                  {!page.is_database && headings.length > 0 && <MobileMenuItem onClick={() => { setTocOpen(o => !o); setMobileMenuOpen(false) }}>☰ Table of contents</MobileMenuItem>}
                  {canEdit && <MobileMenuItem onClick={() => { setHistoryOpen(o => !o); if (!historyOpen) loadSnapshots(); setMobileMenuOpen(false) }}>🕓 Version history</MobileMenuItem>}
                  {!page.is_database && <MobileMenuItem onClick={() => { setBacklinksOpen(o => !o); loadBacklinks(); setMobileMenuOpen(false) }}>↩ Backlinks{backlinksLoaded && backlinks.length > 0 ? ` (${backlinks.length})` : ''}</MobileMenuItem>}
                  <MobileMenuItem onClick={() => { setFocusMode(f => { window.dispatchEvent(new CustomEvent(f ? 'canopy:exitFocus' : 'canopy:enterFocus')); return !f }); setMobileMenuOpen(false) }}>{focusMode ? '⊡ Exit focus mode' : '⊠ Focus mode'}</MobileMenuItem>
                </div>
              </>
            )}
          </div>
        </>}
      </div>

      {/* Conflict banner */}
      {remoteConflict && (
        <div style={{ padding: '8px 16px', background: '#fef9c3', borderBottom: '1px solid #fde047', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: '#713f12', flex: 1 }}>⚠️ This page was updated by someone else while you were editing.</span>
          <button onClick={() => setRemoteConflict(null)}
            style={{ background: '#fff', border: '1px solid #fde047', borderRadius: 5, padding: '4px 12px', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-sans)', color: '#713f12', fontWeight: 500 }}>
            Keep mine
          </button>
          <button onClick={() => {
            if (remoteConflict.content) editorRef.current?.commands.setContent(remoteConflict.content)
            setPage(p => ({ ...p, content: remoteConflict.content ?? p.content, title: remoteConflict.title ?? p.title }))
            if (remoteConflict.title && titleRef.current) titleRef.current.textContent = remoteConflict.title
            if (saveTimer.current) clearTimeout(saveTimer.current)
            setSaved(true)
            savedRef.current = true
            setRemoteConflict(null)
          }}
            style={{ background: '#713f12', border: 'none', borderRadius: 5, padding: '4px 12px', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-sans)', color: '#fff', fontWeight: 500 }}>
            Use theirs
          </button>
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Page content */}
        <div style={{ flex: 1, overflowY: 'auto' }}>

          {/* Cover */}
          {page.cover_url && (
            <div style={{ position: 'relative', height: '240px', overflow: 'hidden', background: '#f0ede8' }}>
              {isCssBackground(page.cover_url)
                ? <div style={{ width: '100%', height: '100%', background: page.cover_url }} />
                : <img src={page.cover_url} alt="cover" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              }
              {canEdit && (
                <div style={{ position: 'absolute', bottom: '12px', right: '16px', display: 'flex', gap: '6px' }}>
                  <button onClick={() => setShowCoverGallery(true)}
                    style={{ background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(4px)', border: 'none', padding: '4px 12px', borderRadius: '5px', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontWeight: 500 }}>
                    Change cover
                  </button>
                  <button onClick={removeCover} style={{ background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(4px)', border: 'none', padding: '4px 12px', borderRadius: '5px', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>Remove</button>
                </div>
              )}
            </div>
          )}

          {/* Page body */}
          <div className='page-body-padding print-content' style={{ maxWidth: '900px', margin: '0 auto', padding: page.cover_url ? (isMobile ? '16px 20px 60px' : '24px 60px 80px') : (isMobile ? '32px 20px 60px' : '64px 60px 80px') }}>

            {/* Icon area */}
            <div style={{ marginBottom: '4px', position: 'relative' }}>
              {page.icon ? (
                <span
                  onClick={() => canEdit && setShowIconPicker(o => !o)}
                  style={{ fontSize: '52px', lineHeight: 1, display: 'block', marginBottom: '12px', cursor: canEdit ? 'pointer' : 'default', userSelect: 'none', transition: 'transform 0.1s' }}
                  onMouseEnter={e => { if (canEdit) (e.currentTarget as HTMLElement).style.transform = 'scale(1.05)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)' }}>
                  {page.icon}
                </span>
              ) : null}
              {/* Add icon / Add cover buttons — always visible when no icon, cover button always when no cover */}
              {canEdit && (
                <div data-export-hide className="page-hover-btns" style={{ display: 'flex', gap: '8px', marginBottom: page.icon ? '4px' : '12px' }}>
                  {!page.icon && (
                    <button onClick={() => setShowIconPicker(o => !o)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-sans)', padding: '4px 8px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}>
                      😀 Add icon
                    </button>
                  )}
                  {!page.cover_url && (
                    <button onClick={() => setShowCoverGallery(true)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-sans)', padding: '4px 8px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}>
                      🖼 Add cover
                    </button>
                  )}
                </div>
              )}

              {/* Icon picker */}
              {showIconPicker && (
                <EmojiPicker
                  onSelect={e => { setIcon(e); setShowIconPicker(false) }}
                  onClose={() => setShowIconPicker(false)}
                  style={{ top: page.icon ? '64px' : '36px', left: 0 }}
                />
              )}
            </div>

            {/* Title */}
            {canEdit && !page.is_locked ? (
              <div
                ref={titleRef}
                contentEditable
                suppressContentEditableWarning
                onInput={onTitleInput}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    const editorEl = document.querySelector('.tiptap') as HTMLElement
                    editorEl?.focus()
                  }
                }}
                className='page-title' style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--text)', outline: 'none', marginBottom: '2px', lineHeight: 1.2, wordBreak: 'break-word', minHeight: '1.2em', fontFamily: 'var(--font-sans)' }}
                data-placeholder="Untitled"
              />
            ) : (
              <h1 style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--text)', marginBottom: '2px', lineHeight: 1.2, fontFamily: 'var(--font-sans)' }}>
                {page.title || 'Untitled'}
              </h1>
            )}

            {/* Lock banner */}
            {page.is_locked && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px', padding: '7px 12px', background: 'var(--accent-light)', borderRadius: '6px', fontSize: '12px', color: 'var(--accent)', fontWeight: 500 }}>
                <span>🔐</span>
                <span style={{ flex: 1 }}>This page is locked.</span>
                {isOwner && <span onClick={toggleLock} style={{ cursor: 'pointer', textDecoration: 'underline', opacity: 0.8 }}>Unlock</span>}
              </div>
            )}

            {/* Editor / Database */}
            <div style={{ marginTop: '20px', position: 'relative' }}>
              {page.is_database
                ? <DatabaseView page={page} canEdit={canEdit} />
                : <>
                    {canEdit && <DragHandle editor={editorInstance} />}
                    <Editor
                      key={page.id}
                      content={initialContentRef.current}
                      editable={canEdit && !page.is_locked}
                      onUpdate={onContentUpdate}
                      onEditorReady={e => { setEditorInstance(e); editorRef.current = e }}
                      workspaceId={page.workspace_id}
                    />
                  </>
              }
            </div>

            {/* Page info bar */}
            {!page.is_database && wordCount > 0 && (
              <div data-export-hide style={{ marginTop: 48, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-tertiary)' }}>
                <span>{wordCount.toLocaleString()} word{wordCount !== 1 ? 's' : ''}</span>
                <span>{Math.max(1, Math.ceil(wordCount / 200))} min read</span>
                {page.updated_at && <span>Edited {formatRelativeTime(page.updated_at)}</span>}
              </div>
            )}

            {/* Inline sub-pages */}
            {!page.is_database && (subPages.length > 0 || canEdit) && (
              <div style={{ marginTop: 40, paddingTop: 24, borderTop: '1px solid var(--border)' }} data-export-hide>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {subPages.length} sub-page{subPages.length !== 1 ? 's' : ''}
                  </span>
                  {canEdit && (
                    <button onClick={createSubPage}
                      style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer', color: 'var(--text-secondary)', fontFamily: 'var(--font-sans)', display: 'flex', alignItems: 'center', gap: 5, transition: 'background 0.12s, border-color 0.12s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--text-tertiary)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}>
                      + New page
                    </button>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
                  {subPages.map(sp => (
                    <div key={sp.id} onClick={() => router.push(`/app/page/${sp.id}`)}
                      style={{ padding: '12px 14px', borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, transition: 'background 0.1s, box-shadow 0.1s, transform 0.1s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-bg)'; (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-sm)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; (e.currentTarget as HTMLElement).style.boxShadow = 'none'; (e.currentTarget as HTMLElement).style.transform = 'none' }}>
                      <span style={{ fontSize: 20, flexShrink: 0, lineHeight: 1 }}>{sp.icon || (sp.is_database ? '🗄️' : '📄')}</span>
                      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                        {sp.title || 'Untitled'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Public share footer */}
            {isPublicShare && (
              <div style={{ marginTop: 60, paddingTop: 20, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <img src="/icon.svg" alt="Canopy" style={{ width: 18, height: 18, borderRadius: 4, opacity: 0.7 }} />
                <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Made with </span>
                <a href="/" style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', textDecoration: 'none' }}>Canopy</a>
                <span style={{ fontSize: 12, color: 'var(--text-tertiary)', marginLeft: 6 }}>·</span>
                <a href="/login" style={{ fontSize: 12, color: 'var(--text-tertiary)', textDecoration: 'none' }}>Start for free →</a>
              </div>
            )}
          </div>
        </div>

        {/* Table of contents panel */}
        {tocOpen && !page.is_database && (
          <div style={isMobile ? mobilePanel : { width: '220px', background: 'var(--surface)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
            {isMobile && <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 199 }} onClick={() => setTocOpen(false)} />}
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>Contents</span>
              <button onClick={() => setTocOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 16 }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
              {headings.length === 0
                ? <div style={{ padding: '16px', fontSize: 12, color: 'var(--text-tertiary)' }}>No headings yet.</div>
                : headings.map((h, i) => (
                  <div key={i}
                    onClick={() => {
                      const els = document.querySelectorAll('.tiptap h1,.tiptap h2,.tiptap h3')
                      els[h.idx]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }}
                    style={{ padding: `5px 16px 5px ${8 + (h.level - 1) * 12}px`, cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', borderLeft: '2px solid transparent' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--accent)'; (e.currentTarget as HTMLElement).style.borderLeftColor = 'var(--accent)'; (e.currentTarget as HTMLElement).style.background = 'var(--accent-light)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'; (e.currentTarget as HTMLElement).style.borderLeftColor = 'transparent'; (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
                    {h.text}
                  </div>
                ))
              }
            </div>
          </div>
        )}

        {/* History panel */}
        {historyOpen && canEdit && (
          <div style={isMobile ? mobilePanel : { width: '280px', background: 'var(--surface)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
            {isMobile && <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 199 }} onClick={() => setHistoryOpen(false)} />}
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>Version history</span>
              <button onClick={() => setHistoryOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 16 }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
              {snapshotLoading && <div style={{ padding: '20px 16px', color: 'var(--text-tertiary)', fontSize: 13 }}>Loading…</div>}
              {!snapshotLoading && snapshots.length === 0 && (
                <div style={{ padding: '20px 16px', color: 'var(--text-tertiary)', fontSize: 13 }}>
                  No saved versions yet. Versions are saved automatically every 10 edits.
                </div>
              )}
              {snapshots.map(snap => (
                <div key={snap.id} style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{snap.title || 'Untitled'}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{new Date(snap.created_at).toLocaleString()}</div>
                  <button onClick={() => restoreSnapshot(snap)}
                    style={{ marginTop: 4, background: 'var(--accent-light)', border: 'none', borderRadius: 5, padding: '4px 10px', fontSize: 11, cursor: 'pointer', color: 'var(--accent)', fontFamily: 'var(--font-sans)', fontWeight: 500, alignSelf: 'flex-start' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--accent)'; (e.currentTarget as HTMLElement).style.color = '#fff' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--accent-light)'; (e.currentTarget as HTMLElement).style.color = 'var(--accent)' }}>
                    Restore this version
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Backlinks panel */}
        {backlinksOpen && !page.is_database && (
          <div style={isMobile ? mobilePanel : { width: '260px', background: 'var(--surface)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
            {isMobile && <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 199 }} onClick={() => setBacklinksOpen(false)} />}
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>Backlinks</span>
              <button onClick={() => setBacklinksOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 16 }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
              {!backlinksLoaded && <div style={{ padding: '16px', fontSize: 12, color: 'var(--text-tertiary)' }}>Loading…</div>}
              {backlinksLoaded && backlinks.length === 0 && (
                <div style={{ padding: '20px 16px', fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
                  No pages link here yet.<br />
                  <span style={{ fontSize: 11 }}>Embed this page in another page using the <kbd style={{ background: 'var(--sidebar-bg)', border: '1px solid var(--border)', borderRadius: 3, padding: '1px 4px' }}>/</kbd> menu to create a backlink.</span>
                </div>
              )}
              {backlinks.map(b => (
                <div key={b.id}
                  onClick={() => { window.location.href = `/app/page/${b.id}` }}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', cursor: 'pointer' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>{b.icon || '📄'}</span>
                  <span style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }}>{b.title || 'Untitled'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Comments panel */}
        {commentsOpen && (
          <div style={isMobile ? mobilePanel : { width: '300px', background: 'var(--surface)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
            {isMobile && <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 199 }} onClick={() => setCommentsOpen(false)} />}
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>Comments</span>
              <button onClick={() => setCommentsOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 16 }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
              {comments.length === 0 && (
                <div style={{ padding: '20px 16px', fontSize: 12, color: 'var(--text-tertiary)' }}>No comments yet. Be the first!</div>
              )}
              {comments.map(c => {
                const name = c.profile?.full_name || c.profile?.email || 'Someone'
                const initial = name[0]?.toUpperCase()
                const isOwn = c.user_id === userId
                return (
                  <div key={c.id} style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0 }}>{initial}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{new Date(c.created_at).toLocaleString()}</div>
                      </div>
                      {isOwn && (
                        <button onClick={() => deleteComment(c.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 13, padding: '2px 4px', borderRadius: 3 }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--red)' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-tertiary)' }}>✕</button>
                      )}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5, paddingLeft: 34, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{c.body}</div>
                  </div>
                )
              })}
            </div>
            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <textarea
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addComment() }}
                placeholder="Add a comment… (⌘↵ to send)"
                rows={3}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontFamily: 'var(--font-sans)', fontSize: 13, resize: 'none', outline: 'none', background: 'var(--sidebar-bg)', color: 'var(--text)', lineHeight: 1.4, boxSizing: 'border-box' }}
                onFocus={e => { (e.target as HTMLElement).style.borderColor = 'var(--accent)' }}
                onBlur={e => { (e.target as HTMLElement).style.borderColor = 'var(--border)' }}
              />
              <button onClick={addComment} disabled={!newComment.trim() || commentLoading}
                style={{ background: newComment.trim() ? 'var(--accent)' : 'var(--text-tertiary)', color: '#fff', border: 'none', borderRadius: 6, padding: '7px', fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 500, cursor: newComment.trim() ? 'pointer' : 'not-allowed', transition: 'background 0.1s' }}>
                {commentLoading ? 'Sending…' : 'Comment'}
              </button>
            </div>
          </div>
        )}

        {/* Share panel */}
        {shareOpen && isOwner && (
          <div className='share-panel-mobile' style={isMobile ? { ...mobilePanel, padding: 20, overflowY: 'auto', flexDirection: 'column', gap: 16 } : { width: '300px', background: 'var(--surface)', borderLeft: '1px solid var(--border)', padding: '20px', overflowY: 'auto', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {isMobile && <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 199 }} onClick={() => setShareOpen(false)} />}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 600 }}>Share</h3>
              <button onClick={() => setShareOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: '16px', lineHeight: 1 }}>✕</button>
            </div>

            {/* Link access */}
            <div>
              <label style={labelSt}>Link access</label>
              <select value={page.link_permission} onChange={e => updateLinkPerm(e.target.value)} style={{ ...inputSt, marginTop: '6px' }}>
                <option value="none">🔒 No access</option>
                <option value="view">👁️ Anyone can view</option>
                <option value="edit">✏️ Anyone can edit</option>
              </select>
              {page.link_permission !== 'none' && (
                <button onClick={copyShareLink}
                  style={{ marginTop: '8px', width: '100%', padding: '7px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--sidebar-bg)', fontFamily: 'var(--font-sans)', fontSize: '13px', cursor: 'pointer', color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                  🔗 Copy link
                </button>
              )}
            </div>

            {/* Invite */}
            <div>
              <label style={labelSt}>Add person</label>
              <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                placeholder="email@example.com"
                onKeyDown={e => { if (e.key === 'Enter') inviteUser() }}
                style={{ ...inputSt, marginTop: '6px', marginBottom: '6px' }} />
              <div style={{ display: 'flex', gap: '6px' }}>
                <select value={inviteRole} onChange={e => setInviteRole(e.target.value)} style={{ ...inputSt, flex: 1 }}>
                  <option value="view">Can view</option>
                  <option value="edit">Can edit</option>
                </select>
                <button onClick={inviteUser}
                  style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '7px 16px', borderRadius: '6px', fontFamily: 'var(--font-sans)', fontSize: '13px', cursor: 'pointer', fontWeight: 500 }}>
                  Add
                </button>
              </div>
            </div>

            {/* People */}
            {shares.length > 0 && (
              <div>
                <label style={labelSt}>People with access</label>
                <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {shares.map(s => (
                    <div key={s.user_id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', background: 'var(--sidebar-bg)', borderRadius: '6px' }}>
                      <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                        {(s.email || '?')[0].toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {s.name && <div style={{ fontSize: '13px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>}
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.email}</div>
                      </div>
                      <span style={{ fontSize: '11px', background: s.permission === 'edit' ? '#dbeafe' : '#f3f4f6', color: s.permission === 'edit' ? '#1d4ed8' : '#6b7280', padding: '1px 6px', borderRadius: '8px', flexShrink: 0, fontWeight: 500 }}>{s.permission === 'edit' ? 'Can edit' : 'Can view'}</span>
                      <button onClick={() => removeShare(s.user_id)} title="Remove access"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: '14px', lineHeight: 1, padding: '2px', borderRadius: '3px' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--red)'; (e.currentTarget as HTMLElement).style.background = '#fff0f0' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-tertiary)'; (e.currentTarget as HTMLElement).style.background = 'none' }}>✕</button>
                    </div>
                  ))}
                </div>
              </div>
            )}


          </div>
        )}
      </div>

      {/* Image picker */}
      {showImagePicker && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 200 }} onClick={() => setShowImagePicker(false)} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '24px', width: '400px', boxShadow: 'var(--shadow-lg)', zIndex: 201 }} className="scale-in">
            <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px' }}>
              {mediaTab === 'image' ? '🖼 Insert image' : mediaTab === 'video' ? '🎬 Insert video' : '📎 Attach file'}
            </h3>
            {/* URL input */}
            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '6px' }}>{mediaTab === 'image' ? 'Image URL' : mediaTab === 'video' ? 'Video URL' : 'File URL'}</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder={mediaTab === 'video' ? 'YouTube, Dropbox, or any video URL…' : mediaTab === 'file' ? 'https://… (PDF, Word, Excel…)' : 'https://…'}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && imageUrl.trim()) {
                      const url = imageUrl.trim()
                      const cb = imagePickerCallbackRef.current || imagePickerCallback
                      if (mediaTab === 'image') { if (cb?.onUrl) cb.onUrl(url); else window.dispatchEvent(new CustomEvent('canopy:insertImage', { detail: { src: url } })) }
                      else if (mediaTab === 'video') { if (cb?.onUrl) cb.onUrl(url); else window.dispatchEvent(new CustomEvent('canopy:insertVideo', { detail: { src: url } })) }
                      else { if (cb?.onUrl) (cb.onUrl as any)(url); else window.dispatchEvent(new CustomEvent('canopy:insertFile', { detail: { src: url, name: url.split('/').pop() } })) }
                      setShowImagePicker(false); setImageUrl(''); imagePickerCallbackRef.current = null
                    }
                    if (e.key === 'Escape') setShowImagePicker(false)
                  }}
                  style={{ flex: 1, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: '6px', fontFamily: 'var(--font-sans)', fontSize: '13px', outline: 'none' }} autoFocus />
                <button onClick={() => {
                    const url = imageUrl.trim()
                    if (!url) return
                    const cb = imagePickerCallbackRef.current || imagePickerCallback
                    if (mediaTab === 'image') {
                      if (cb?.onUrl) cb.onUrl(url)
                      else window.dispatchEvent(new CustomEvent('canopy:insertImage', { detail: { src: url } }))
                    } else if (mediaTab === 'video') {
                      if (cb?.onUrl) cb.onUrl(url)
                      else window.dispatchEvent(new CustomEvent('canopy:insertVideo', { detail: { src: url } }))
                    } else {
                      if (cb?.onUrl) (cb.onUrl as any)(url)
                      else window.dispatchEvent(new CustomEvent('canopy:insertFile', { detail: { src: url, name: url.split('/').pop() } }))
                    }
                    setShowImagePicker(false)
                    setImageUrl('')
                    imagePickerCallbackRef.current = null
                  }}
                  disabled={!imageUrl.trim()}
                  style={{ background: imageUrl.trim() ? 'var(--accent)' : 'var(--text-tertiary)', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '6px', cursor: imageUrl.trim() ? 'pointer' : 'not-allowed', fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 500 }}>Insert</button>
              </div>
            </div>
            {/* Divider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '14px 0' }}>
              <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
              <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>or</span>
              <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
            </div>
            {/* File upload + drag drop */}
            <label
              style={{ display: 'block', border: '2px dashed var(--border)', borderRadius: '8px', padding: '20px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.15s' }}
              onDragOver={e => { e.preventDefault(); (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLElement).style.background = 'var(--accent-light)' }}
              onDragLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.background = 'none' }}
              onDrop={async e => {
                e.preventDefault()
                const file = e.dataTransfer.files[0]
                if (!file) return
                const url = await uploadFile(file)
                if (!url) return
                const cb = imagePickerCallbackRef.current || imagePickerCallback
                imagePickerCallbackRef.current = null
                setShowImagePicker(false)
                setTimeout(() => {
                  if (mediaTab === 'image' || file.type.startsWith('image/')) {
                    if (cb?.onFile) cb.onFile(url)
                    else window.dispatchEvent(new CustomEvent('canopy:insertImage', { detail: { src: url } }))
                  } else if (mediaTab === 'video' || file.type.startsWith('video/')) {
                    if (cb?.onFile) cb.onFile(url)
                    else window.dispatchEvent(new CustomEvent('canopy:insertVideo', { detail: { src: url } }))
                  } else {
                    if (cb?.onFile) (cb.onFile as any)(url, file.name, file.size, file.type)
                    else window.dispatchEvent(new CustomEvent('canopy:insertFile', { detail: { src: url, name: file.name, size: file.size } }))
                  }
                }, 50)
              }}>
              <div style={{ fontSize: '28px', marginBottom: '8px' }}>{mediaTab === 'image' ? '🖼️' : mediaTab === 'video' ? '🎬' : '📎'}</div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Drag & drop here</div>
              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>or click to browse</div>
              <input type="file"
                accept={mediaTab === 'image' ? 'image/*' : mediaTab === 'video' ? 'video/*' : '*/*'}
                style={{ display: 'none' }} onChange={async e => {
                const file = e.target.files?.[0]
                if (!file) return
                const url = await uploadFile(file)
                if (!url) return
                const cb = imagePickerCallbackRef.current || imagePickerCallback
                imagePickerCallbackRef.current = null
                setShowImagePicker(false)
                setTimeout(() => {
                  if (mediaTab === 'image') {
                    if (cb?.onFile) cb.onFile(url)
                    else window.dispatchEvent(new CustomEvent('canopy:insertImage', { detail: { src: url } }))
                  } else if (mediaTab === 'video') {
                    if (cb?.onFile) cb.onFile(url)
                    else window.dispatchEvent(new CustomEvent('canopy:insertVideo', { detail: { src: url } }))
                  } else {
                    if (cb?.onFile) (cb.onFile as any)(url, file.name, file.size, file.type)
                    else window.dispatchEvent(new CustomEvent('canopy:insertFile', { detail: { src: url, name: file.name, size: file.size } }))
                  }
                }, 50)
              }} />
            </label>
            <button onClick={() => setShowImagePicker(false)} style={{ marginTop: '12px', width: '100%', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-sans)', padding: '4px' }}>Cancel</button>
          </div>
        </>
      )}

      {/* Subpage picker */}
      {showSubpagePicker && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 200 }} onClick={() => setShowSubpagePicker(false)} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '20px', width: '340px', maxHeight: '400px', boxShadow: 'var(--shadow-lg)', zIndex: 201, display: 'flex', flexDirection: 'column', gap: '12px' }} className="scale-in">
            <h3 style={{ fontSize: '15px', fontWeight: 600 }}>Choose a page to embed</h3>
            <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {subpageList.map(p => (
                <div key={p.id} onClick={() => { subpagePickerCallback?.(p.id); setShowSubpagePicker(false); setSubpagePickerCallback(null) }}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', borderRadius: '6px', cursor: 'pointer' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}>
                  <span style={{ fontSize: '16px' }}>{p.icon || '📄'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13.5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title || 'Untitled'}</div>
                    {p.parent_id === page.id && <div style={{ fontSize: '11px', color: 'var(--accent)' }}>Child of this page</div>}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input placeholder="Or paste a page URL (e.g. /app/page/…)" style={{ flex: 1, padding: '7px 10px', border: '1px solid var(--border)', borderRadius: '6px', fontFamily: 'var(--font-sans)', fontSize: '13px', outline: 'none' }}
                onKeyDown={e => { if (e.key === 'Enter') { const v = (e.target as HTMLInputElement).value.trim(); if (v) { subpagePickerCallback?.(v); setShowSubpagePicker(false) } } }} />
              <button onClick={() => setShowSubpagePicker(false)} style={{ background: 'var(--sidebar-bg)', border: 'none', padding: '7px 14px', borderRadius: '6px', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: '13px' }}>Cancel</button>
            </div>
          </div>
        </>
      )}

      {/* Cover gallery */}
      {showCoverGallery && (
        <CoverGallery
          onSelect={v => { setPage(p => ({ ...p, cover_url: v }) as Page); scheduleSave({ cover_url: v }); setShowCoverGallery(false) }}
          onUpload={uploadCover}
          onClose={() => setShowCoverGallery(false)}
        />
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: '24px', right: '24px', background: '#37352f', color: '#fff', padding: '10px 16px', borderRadius: '8px', fontSize: '13px', zIndex: 300, boxShadow: 'var(--shadow-lg)' }} className="fade-in">
          {toast}
        </div>
      )}
    </div>
  )
}

// ── RELATIVE TIME ─────────────────────────────────────────────
function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// ── TIPTAP → MARKDOWN ────────────────────────────────────────
function inlineToMd(node: any): string {
  if (node.type === 'pageMention') {
    return `[@${node.attrs?.label || 'Page'}](/app/page/${node.attrs?.pageId || ''})`
  }
  if (node.type === 'text') {
    let t = node.text || ''
    const marks: string[] = (node.marks || []).map((m: any) => m.type)
    if (marks.includes('bold')) t = `**${t}**`
    if (marks.includes('italic')) t = `_${t}_`
    if (marks.includes('code')) t = `\`${t}\``
    if (marks.includes('strike')) t = `~~${t}~~`
    const link = (node.marks || []).find((m: any) => m.type === 'link')
    if (link) t = `[${t}](${link.attrs?.href || ''})`
    return t
  }
  return (node.content || []).map(inlineToMd).join('')
}

function nodeToMd(node: any, listDepth = 0): string {
  const indent = '  '.repeat(listDepth)
  switch (node.type) {
    case 'heading': {
      const level = '#'.repeat(node.attrs?.level || 1)
      return `${level} ${(node.content || []).map(inlineToMd).join('')}\n\n`
    }
    case 'paragraph': {
      const text = (node.content || []).map(inlineToMd).join('')
      return text ? `${text}\n\n` : '\n'
    }
    case 'bulletList':
      return (node.content || []).map((li: any) => {
        const body = (li.content || []).map((c: any) => nodeToMd(c, listDepth + 1)).join('').trimEnd()
        return `${indent}- ${body}\n`
      }).join('') + '\n'
    case 'orderedList':
      return (node.content || []).map((li: any, i: number) => {
        const body = (li.content || []).map((c: any) => nodeToMd(c, listDepth + 1)).join('').trimEnd()
        return `${indent}${i + 1}. ${body}\n`
      }).join('') + '\n'
    case 'taskList':
      return (node.content || []).map((li: any) => {
        const checked = li.attrs?.checked ? 'x' : ' '
        const body = (li.content || []).map((c: any) => nodeToMd(c, listDepth + 1)).join('').trimEnd()
        return `${indent}- [${checked}] ${body}\n`
      }).join('') + '\n'
    case 'blockquote':
      return (node.content || []).map((c: any) => `> ${nodeToMd(c, listDepth).trimEnd()}`).join('\n') + '\n\n'
    case 'codeBlock': {
      const lang = node.attrs?.language || ''
      const code = (node.content || []).map((c: any) => c.text || '').join('')
      return `\`\`\`${lang}\n${code}\n\`\`\`\n\n`
    }
    case 'columns':
      return (node.content || []).map((col: any) =>
        (col.content || []).map((c: any) => nodeToMd(c)).join('')
      ).join('\n') + '\n'
    case 'horizontalRule': return '---\n\n'
    case 'image': return `![${node.attrs?.alt || ''}](${node.attrs?.src || ''})\n\n`
    case 'table':
      return tableToMd(node) + '\n'
    default:
      return (node.content || []).map((c: any) => nodeToMd(c, listDepth)).join('')
  }
}

function tableToMd(table: any): string {
  const rows: any[][] = (table.content || []).map((row: any) =>
    (row.content || []).map((cell: any) =>
      (cell.content || []).map((c: any) => nodeToMd(c)).join('').trim().replace(/\n+/g, ' ')
    )
  )
  if (rows.length === 0) return ''
  const cols = Math.max(...rows.map(r => r.length))
  const header = `| ${rows[0].join(' | ')} |`
  const sep = `| ${Array(cols).fill('---').join(' | ')} |`
  const body = rows.slice(1).map(r => `| ${r.join(' | ')} |`).join('\n')
  return [header, sep, body].filter(Boolean).join('\n')
}

function nodesToMd(nodes: any[]): string {
  return nodes.map(n => nodeToMd(n)).join('')
}

const COVER_GRADIENTS = [
  'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
  'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
  'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
  'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
  'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
  'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)',
  'linear-gradient(135deg, #ff9a9e 0%, #fad0c4 100%)',
  'linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 100%)',
  'linear-gradient(135deg, #d4fc79 0%, #96e6a1 100%)',
  'linear-gradient(135deg, #fddb92 0%, #d1fdff 100%)',
  'linear-gradient(135deg, #30cfd0 0%, #330867 100%)',
  'linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)',
  'linear-gradient(135deg, #f77062 0%, #fe5196 100%)',
  'linear-gradient(135deg, #c3cfe2 0%, #f5f7fa 100%)',
  'linear-gradient(160deg, #0093E9 0%, #80D0C7 100%)',
]
const COVER_COLORS = [
  '#f0ede8','#e8e4f0','#e4f0e8','#f0e8e4','#e4eaf0',
  '#2d3748','#1a202c','#744210','#276749','#1a365d',
  '#c05621','#822727','#553c9a','#2c7a7b','#2b6cb0',
]

function CoverGallery({ onSelect, onUpload, onClose }: { onSelect: (v: string) => void; onUpload: (f: File) => void; onClose: () => void }) {
  const [tab, setTab] = useState<'gallery'|'upload'|'url'>('gallery')
  const [urlVal, setUrlVal] = useState('')
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 200 }} onClick={onClose} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', width: '480px', boxShadow: 'var(--shadow-lg)', zIndex: 201, overflow: 'hidden' }} className="scale-in">
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>Cover</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 16 }}>✕</button>
        </div>
        <div style={{ display: 'flex', gap: 0, padding: '12px 20px 0', borderBottom: '1px solid var(--border)' }}>
          {(['gallery','upload','url'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: tab === t ? 600 : 400, color: tab === t ? 'var(--text)' : 'var(--text-tertiary)', padding: '6px 12px 10px', borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent', transition: 'all 0.1s' }}>
              {t === 'gallery' ? 'Gallery' : t === 'upload' ? 'Upload' : 'URL'}
            </button>
          ))}
        </div>
        <div style={{ padding: '16px 20px 20px', maxHeight: '340px', overflowY: 'auto' }}>
          {tab === 'gallery' && (
            <>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Gradients</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 16 }}>
                {COVER_GRADIENTS.map(g => (
                  <div key={g} onClick={() => onSelect(g)}
                    style={{ height: 52, borderRadius: 6, background: g, cursor: 'pointer', border: '2px solid transparent', transition: 'all 0.1s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.border = '2px solid var(--accent)'; (e.currentTarget as HTMLElement).style.transform = 'scale(1.04)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.border = '2px solid transparent'; (e.currentTarget as HTMLElement).style.transform = 'scale(1)' }} />
                ))}
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Colors</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
                {COVER_COLORS.map(c => (
                  <div key={c} onClick={() => onSelect(c)}
                    style={{ height: 36, borderRadius: 6, background: c, cursor: 'pointer', border: '2px solid transparent', transition: 'all 0.1s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.border = '2px solid var(--accent)'; (e.currentTarget as HTMLElement).style.transform = 'scale(1.06)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.border = '2px solid transparent'; (e.currentTarget as HTMLElement).style.transform = 'scale(1)' }} />
                ))}
              </div>
            </>
          )}
          {tab === 'upload' && (
            <label style={{ display: 'block', border: '2px dashed var(--border)', borderRadius: '8px', padding: '32px 20px', textAlign: 'center', cursor: 'pointer' }}
              onDragOver={e => { e.preventDefault(); (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)' }}
              onDragLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) { onUpload(f); onClose() } }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>🖼️</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>Click to upload or drag & drop</div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>PNG, JPG, WEBP — max 10 MB</div>
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) { onUpload(f); onClose() } }} />
            </label>
          )}
          {tab === 'url' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input value={urlVal} onChange={e => setUrlVal(e.target.value)} placeholder="https://example.com/image.jpg"
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter' && urlVal.trim()) { onSelect(urlVal.trim()); } if (e.key === 'Escape') onClose() }}
                style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6, fontFamily: 'var(--font-sans)', fontSize: 13, outline: 'none' }} />
              <button onClick={() => { if (urlVal.trim()) onSelect(urlVal.trim()) }}
                disabled={!urlVal.trim()}
                style={{ background: urlVal.trim() ? 'var(--accent)' : 'var(--text-tertiary)', color: '#fff', border: 'none', borderRadius: 6, padding: '8px', fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 500, cursor: urlVal.trim() ? 'pointer' : 'not-allowed' }}>
                Apply
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function ExportMenu({ onPDF, onWord, onCSV, onXLSX, onMarkdown, onImportMarkdown, onSaveTemplate, isDatabase }: { onPDF: () => void; onWord: () => void; onCSV?: () => void; onXLSX?: () => void; onMarkdown?: () => void; onImportMarkdown?: () => void; onSaveTemplate?: () => void; isDatabase?: boolean }) {
  const [open, setOpen] = useState(false)
  const item = (label: string, fn: () => void) => (
    <div onClick={() => { fn(); setOpen(false) }}
      style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px', borderRadius: '5px', cursor: 'pointer', fontSize: '13px' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}>
      {label}
    </div>
  )
  return (
    <div style={{ position: 'relative' }}>
      <TopBarBtn onClick={() => setOpen(o => !o)} active={open} data-export-btn>
        <TbIcon d={TB_ICONS.export} />Export
      </TopBarBtn>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setOpen(false)} />
          <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px', boxShadow: 'var(--shadow-lg)', zIndex: 100, minWidth: '190px' }} className="scale-in">
            {item('📄 Export as PDF', onPDF)}
            {isDatabase ? (
              <>
                {item('📊 Export as CSV', onCSV || (() => {}))}
                {item('📗 Export as Excel', onXLSX || (() => {}))}
              </>
            ) : item('📝 Export as Word', onWord)}
            {!isDatabase && item('⬇️ Export as Markdown', onMarkdown || (() => {}))}
            {(onImportMarkdown || onSaveTemplate) && (
              <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
            )}
            {onImportMarkdown && item('⬆️ Import from Markdown', onImportMarkdown)}
            {onSaveTemplate && item('📋 Save as template', onSaveTemplate)}
          </div>
        </>
      )}
    </div>
  )
}

function TbIcon({ d, size = 14 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ display: 'block', flexShrink: 0 }}>
      <path d={d} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const TB_ICONS = {
  export:   'M8 3v8m0 0L5 8m3 3 3-3M3 13h10',
  print:    'M4 3h8v4H4V3zM3 7h10v5H3V7zm2 4h6',
  toc:      'M3 5h10M3 8h7M3 11h9',
  history:  'M3 8a5 5 0 105-5H5M5 3v2H3',
  backlink: 'M9 11H5a2 2 0 01-2-2V6m0 0l2-2M3 6l2 2',
  chat:     'M2 4a1 1 0 011-1h10a1 1 0 011 1v6a1 1 0 01-1 1H9L7 13l-2-2H3a1 1 0 01-1-1V4z',
  lock:     'M5 8V6a3 3 0 016 0v2M3 8h10v6H3V8z',
  unlock:   'M5 8V6A3 3 0 0113 7M3 8h10v6H3V8z',
  share:    'M10 3l3 3-3 3m3-3H6a3 3 0 000 6h2',
  focusIn:  'M3 6V3h3M10 3h3v3M13 10v3h-3M6 13H3v-3',
  focusOut: 'M6 3H3v3M13 3h-3v3M3 10v3h3M10 13h3v-3',
  link:     'M10 7l2-2a3 3 0 00-4.2-4.2L5 4a3 3 0 000 4.2M6 9l-2 2a3 3 0 004.2 4.2L11 12a3 3 0 000-4.2',
}

function TopBarBtn({ onClick, active, iconOnly, children, ...props }: { onClick: () => void; active?: boolean; iconOnly?: boolean; children: React.ReactNode; [key: string]: any }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      {...props}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: active ? 'var(--accent)' : hovered ? 'var(--sidebar-hover)' : 'transparent',
        color: active ? '#fff' : hovered ? 'var(--text)' : 'var(--text-secondary)',
        border: active ? '1px solid transparent' : `1px solid ${hovered ? 'var(--border)' : 'transparent'}`,
        padding: iconOnly ? '0' : '0 9px',
        height: '28px',
        minWidth: '28px',
        borderRadius: '6px',
        fontFamily: 'var(--font-sans)',
        fontSize: '12.5px',
        fontWeight: 500,
        cursor: 'pointer',
        transition: 'background 0.12s, color 0.12s, border-color 0.12s',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '5px',
        flexShrink: 0,
        whiteSpace: 'nowrap',
      }}>
      {children}
    </button>
  )
}

function MobileMenuItem({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <div onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 5, cursor: 'pointer', fontSize: 14, color: 'var(--text)' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}>
      {children}
    </div>
  )
}

const labelSt: React.CSSProperties = { fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px' }
const inputSt: React.CSSProperties = { width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: '6px', fontFamily: 'var(--font-sans)', fontSize: '13px', background: 'var(--sidebar-bg)', color: 'var(--text)', outline: 'none', cursor: 'pointer' }

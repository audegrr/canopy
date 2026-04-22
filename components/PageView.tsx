'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { Page } from '@/lib/types'
import Editor from './Editor'
import DragHandle from './DragHandle'
import DatabaseView from './DatabaseView'

const EMOJI_LIST = ['📄','📝','📌','⭐','🔥','💡','🎯','📊','🗂','🌿','🚀','💎','🎨','🔑','📦','🌍','💬','🧠','✅','🎉','🏠','🔧','📚','🎵','🌸','⚡','🦋','🌊','🏔','🎭','📐','🔬','🌈','🍀','🦁','🐋','🌙','☀️','🎪','🏆']

type Props = {
  page: Page
  canEdit: boolean
  isOwner: boolean
  userId: string
}

export default function PageView({ page: initialPage, canEdit, isOwner, userId }: Props) {
  const [page, setPage] = useState(initialPage)
  const [saved, setSaved] = useState(true)
  const [showIconPicker, setShowIconPicker] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [shares, setShares] = useState<any[]>([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('view')
  const [toast, setToast] = useState('')
  const [showSubpagePicker, setShowSubpagePicker] = useState(false)
  const [showImagePicker, setShowImagePicker] = useState(false)
  const [imagePickerCallback, setImagePickerCallback] = useState<{ onUrl: (u: string) => void; onFile: (s: string) => void } | null>(null)
  const [imageUrl, setImageUrl] = useState('')
  const [subpagePickerCallback, setSubpagePickerCallback] = useState<((id: string) => void) | null>(null)
  const [subpageList, setSubpageList] = useState<any[]>([])
  const [isUploadingCover, setIsUploadingCover] = useState(false)
  const saveTimer = useRef<any>(null)
  const [editorInstance, setEditorInstance] = useState<any>(null)
  const titleRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    if (shareOpen && isOwner) loadShares()
  }, [shareOpen])

  // Auto-open panel from URL param (e.g. ?panel=share from sidebar menu)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const panel = params.get('panel')
    if (panel === 'share') {
      if (isOwner) setShareOpen(true)
    }
    if (panel === 'export') {
      setTimeout(() => {
        const btn = document.querySelector('[data-export-btn]') as HTMLButtonElement
        btn?.click()
      }, 300)
    }
    // Clean up URL param without reloading
    if (panel && window.history.replaceState) {
      const url = new URL(window.location.href)
      url.searchParams.delete('panel')
      window.history.replaceState({}, '', url.toString())
    }
  }, [isOwner])

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
      setImagePickerCallback({ onUrl: e.detail.onUrl, onFile: e.detail.onFile })
      setImageUrl('')
      setShowImagePicker(true)
    }
    window.addEventListener('canopy:showImagePicker', onImagePicker)
    return () => window.removeEventListener('canopy:showImagePicker', onImagePicker)
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

  function scheduleSave(updates: Partial<Page>) {
    setSaved(false)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      await supabase.from('pages').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', page.id)
      setSaved(true)
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
  }

  function setIcon(icon: string) {
    setPage(p => ({ ...p, icon }) as Page)
    scheduleSave({ icon })
    setShowIconPicker(false)
    // Immediately update sidebar
    window.dispatchEvent(new CustomEvent('canopy:pageUpdate', { detail: { id: page.id, icon } }))
  }

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
    setInviteEmail('')
    loadShares()
    showToast(`✅ Shared with ${inviteEmail}`)
  }

  async function removeShare(uid: string) {
    await supabase.from('page_shares').delete().eq('page_id', page.id).eq('user_id', uid)
    loadShares()
  }

  async function updateLinkPerm(perm: string) {
    await supabase.from('pages').update({ link_permission: perm }).eq('id', page.id)
    setPage(p => ({ ...p, link_permission: perm }) as Page)
    const { data: subIds } = await supabase.rpc('get_all_subpage_ids', { page_id: page.id })
    if (subIds) for (const row of subIds) {
      await supabase.from('pages').update({ link_permission: perm }).eq('id', row.id)
    }
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
    // Add print-specific class to body to trigger CSS
    document.body.classList.add('printing-page')
    window.print()
    document.body.classList.remove('printing-page')
    showToast('Opening print dialog…')
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

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>

      {/* Top bar */}
      <div style={{ height: '44px', padding: '0 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-tertiary)', overflow: 'hidden' }}>
          {page.icon && <span style={{ fontSize: '14px' }}>{page.icon}</span>}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{page.title || 'Untitled'}</span>
        </div>
        <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', flexShrink: 0, transition: 'opacity 0.3s', opacity: saved ? 0 : 1 }}>Saving…</span>
        {canEdit && (
          <button onClick={duplicatePage} title="Duplicate page"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: '13px', padding: '4px 6px', borderRadius: '4px', fontFamily: 'var(--font-sans)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}>
            ⧉
          </button>
        )}
        <ExportMenu onPDF={exportPDF} onWord={exportWord} />
        {isOwner && (
          <button data-share-btn onClick={() => setShareOpen(o => !o)}
            style={{ background: shareOpen ? 'var(--accent)' : 'var(--sidebar-bg)', color: shareOpen ? '#fff' : 'var(--text-secondary)', border: '1px solid var(--border)', padding: '5px 14px', borderRadius: '5px', fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s' }}
            onMouseEnter={e => { if (!shareOpen) { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--text-tertiary)' } }}
            onMouseLeave={e => { if (!shareOpen) { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-bg)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' } }}>
            Share
          </button>
        )}
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Page content */}
        <div style={{ flex: 1, overflowY: 'auto' }}>

          {/* Cover */}
          {page.cover_url && (
            <div style={{ position: 'relative', height: '240px', overflow: 'hidden', background: '#f0ede8' }}>
              <img src={page.cover_url} alt="cover" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              {canEdit && (
                <div style={{ position: 'absolute', bottom: '12px', right: '16px', display: 'flex', gap: '6px' }}>
                  <label style={{ background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(4px)', padding: '4px 12px', borderRadius: '5px', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontWeight: 500 }}>
                    Change cover
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) uploadCover(f) }} />
                  </label>
                  <button onClick={removeCover} style={{ background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(4px)', border: 'none', padding: '4px 12px', borderRadius: '5px', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>Remove</button>
                </div>
              )}
            </div>
          )}

          {/* Page body */}
          <div className='page-body-padding print-content' style={{ maxWidth: '720px', margin: '0 auto', padding: page.cover_url ? '24px 60px 80px' : '64px 60px 80px' }}>

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
              ) : canEdit && (
                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                  <button onClick={() => setShowIconPicker(o => !o)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-sans)', padding: '4px 8px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}>
                    😀 Add icon
                  </button>
                  {!page.cover_url && (
                    <label
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-sans)', padding: '4px 8px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}>
                      🖼 Add cover
                      <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) uploadCover(f) }} />
                    </label>
                  )}
                </div>
              )}

              {/* Icon picker */}
              {showIconPicker && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setShowIconPicker(false)} />
                  <div style={{ position: 'absolute', top: page.icon ? '64px' : '36px', left: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px', boxShadow: 'var(--shadow-lg)', zIndex: 100, width: '280px' }} className="scale-in">
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' }}>
                      {EMOJI_LIST.map(e => (
                        <button key={e} onClick={() => setIcon(e)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '22px', padding: '4px 5px', borderRadius: '4px', lineHeight: 1 }}
                          onMouseEnter={ev => { (ev.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)' }}
                          onMouseLeave={ev => { (ev.currentTarget as HTMLElement).style.background = 'none' }}>
                          {e}
                        </button>
                      ))}
                    </div>
                    {page.icon && (
                      <button onClick={() => setIcon('')}
                        style={{ width: '100%', background: 'none', border: '1px solid var(--border)', cursor: 'pointer', fontSize: '12px', padding: '5px', borderRadius: '5px', color: 'var(--text-secondary)', fontFamily: 'var(--font-sans)' }}>
                        Remove icon
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Title */}
            {canEdit ? (
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

            {/* Editor / Database */}
            <div style={{ marginTop: '20px', position: 'relative' }}>
              {page.is_database
                ? <DatabaseView page={page} canEdit={canEdit} />
                : <>
                    {canEdit && <DragHandle editor={editorInstance} />}
                    <Editor
                      content={page.content}
                      editable={canEdit}
                      onUpdate={onContentUpdate}
                      onEditorReady={setEditorInstance}
                    />
                  </>
              }
            </div>
          </div>
        </div>

        {/* Share panel */}
        {shareOpen && isOwner && (
          <div className='share-panel-mobile' style={{ width: '300px', background: 'var(--surface)', borderLeft: '1px solid var(--border)', padding: '20px', overflowY: 'auto', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
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
                      <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', flexShrink: 0 }}>{s.permission}</span>
                      <button onClick={() => removeShare(s.user_id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: '14px', lineHeight: 1, padding: '2px' }}>✕</button>
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
            <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px' }}>Insert image</h3>
            {/* URL input */}
            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '6px' }}>Image URL</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://..."
                  onKeyDown={e => { if (e.key === 'Enter' && imageUrl) { imagePickerCallback?.onUrl(imageUrl); setShowImagePicker(false) } }}
                  style={{ flex: 1, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: '6px', fontFamily: 'var(--font-sans)', fontSize: '13px', outline: 'none' }} autoFocus />
                <button onClick={() => { if (imageUrl) { imagePickerCallback?.onUrl(imageUrl); setShowImagePicker(false) } }}
                  style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '6px', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 500 }}>Insert</button>
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
              onDrop={e => {
                e.preventDefault()
                const file = e.dataTransfer.files[0]
                if (file?.type.startsWith('image/')) {
                  const reader = new FileReader()
                  reader.onload = ev => { if (ev.target?.result) { imagePickerCallback?.onFile(ev.target.result as string); setShowImagePicker(false) } }
                  reader.readAsDataURL(file)
                }
              }}>
              <div style={{ fontSize: '28px', marginBottom: '8px' }}>🖼️</div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Drag & drop an image here</div>
              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>or click to browse</div>
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => {
                const file = e.target.files?.[0]
                if (file) {
                  const reader = new FileReader()
                  reader.onload = ev => { if (ev.target?.result) { imagePickerCallback?.onFile(ev.target.result as string); setShowImagePicker(false) } }
                  reader.readAsDataURL(file)
                }
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
              <input placeholder="Or paste a page ID…" style={{ flex: 1, padding: '7px 10px', border: '1px solid var(--border)', borderRadius: '6px', fontFamily: 'var(--font-sans)', fontSize: '13px', outline: 'none' }}
                onKeyDown={e => { if (e.key === 'Enter') { const v = (e.target as HTMLInputElement).value.trim(); if (v) { subpagePickerCallback?.(v); setShowSubpagePicker(false) } } }} />
              <button onClick={() => setShowSubpagePicker(false)} style={{ background: 'var(--sidebar-bg)', border: 'none', padding: '7px 14px', borderRadius: '6px', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: '13px' }}>Cancel</button>
            </div>
          </div>
        </>
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

function ExportMenu({ onPDF, onWord }: { onPDF: () => void; onWord: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ background: open ? 'var(--sidebar-hover)' : 'var(--sidebar-bg)', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '13px', padding: '5px 14px', borderRadius: '5px', fontFamily: 'var(--font-sans)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '5px', transition: 'all 0.15s' }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--text-tertiary)' }}
        onMouseLeave={e => { if (!open) { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-bg)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' } }}
        title="Export">
        ⬇ Export
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setOpen(false)} />
          <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px', boxShadow: 'var(--shadow-lg)', zIndex: 100, minWidth: '170px' }} className="scale-in">
            <div onClick={() => { onPDF(); setOpen(false) }}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px', borderRadius: '5px', cursor: 'pointer', fontSize: '13px' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}>
              📄 Export as PDF
            </div>
            <div onClick={() => { onWord(); setOpen(false) }}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px', borderRadius: '5px', cursor: 'pointer', fontSize: '13px' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}>
              📝 Export as Word
            </div>
          </div>
        </>
      )}
    </div>
  )
}

const labelSt: React.CSSProperties = { fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px' }
const inputSt: React.CSSProperties = { width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: '6px', fontFamily: 'var(--font-sans)', fontSize: '13px', background: 'var(--sidebar-bg)', color: 'var(--text)', outline: 'none', cursor: 'pointer' }

'use client'
import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import type { Page } from '@/lib/types'

const Editor = dynamic(() => import('./editor/Editor'), { ssr: false })

const COVER_IMAGES = [
  'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200&q=80',
  'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=1200&q=80',
  'https://images.unsplash.com/photo-1518020382113-a7e8fc38eac9?w=1200&q=80',
]

const EMOJIS = ['📄','📝','💡','🎯','🚀','⭐','🌿','🔥','💎','🎨','📊','🗂️','🌍','🏆','❤️','🧠','⚡','🌊','🎵','📚']

export default function PageView({ page: initialPage, canEdit, isOwner }: {
  page: Page; canEdit: boolean; isOwner: boolean
}) {
  const [page, setPage] = useState(initialPage)
  const [title, setTitle] = useState(initialPage.title)
  const [shareOpen, setShareOpen] = useState(false)
  const [shares, setShares] = useState<any[]>([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('view')
  const [saved, setSaved] = useState(true)
  const [showCoverPicker, setShowCoverPicker] = useState(false)
  const [showIconPicker, setShowIconPicker] = useState(false)
  const [coverInput, setCoverInput] = useState('')
  const [headerHovered, setHeaderHovered] = useState(false)
  const saveTimer = useRef<any>(null)
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => { if (shareOpen && isOwner) loadShares() }, [shareOpen])

  async function loadShares() {
    const { data } = await supabase.from('page_shares').select('*').eq('page_id', page.id)
    if (!data) return
    const enriched = await Promise.all(data.map(async s => {
      const { data: p } = await supabase.from('profiles').select('email, full_name').eq('id', s.user_id).single()
      return { ...s, email: p?.email || s.user_id, name: p?.full_name }
    }))
    setShares(enriched)
  }

  function scheduleContentSave(content: any) {
    setSaved(false)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      await supabase.from('pages').update({ content, updated_at: new Date().toISOString() }).eq('id', page.id)
      setSaved(true)
    }, 800)
  }

  async function saveTitle(t: string) {
    setTitle(t)
    await supabase.from('pages').update({ title: t, updated_at: new Date().toISOString() }).eq('id', page.id)
  }

  async function setIcon(icon: string) {
    await supabase.from('pages').update({ icon }).eq('id', page.id)
    setPage(p => ({ ...p, icon }))
    setShowIconPicker(false)
  }

  async function setCover(url: string) {
    await supabase.from('pages').update({ cover_url: url }).eq('id', page.id)
    setPage(p => ({ ...p, cover_url: url }))
    setShowCoverPicker(false)
  }

  async function removeCover() {
    await supabase.from('pages').update({ cover_url: '' }).eq('id', page.id)
    setPage(p => ({ ...p, cover_url: '' }))
  }

  async function updateLinkPerm(perm: string) {
    await supabase.from('pages').update({ link_permission: perm }).eq('id', page.id)
    setPage(p => ({ ...p, link_permission: perm as any }))
  }

  async function inviteUser() {
    if (!inviteEmail.trim()) return
    const { data: profile } = await supabase.from('profiles').select('id').eq('email', inviteEmail.trim()).single()
    if (!profile) { alert('User not found'); return }
    await supabase.from('page_shares').upsert({ page_id: page.id, user_id: profile.id, permission: inviteRole })
    setInviteEmail(''); loadShares()
  }

  async function removeShare(userId: string) {
    await supabase.from('page_shares').delete().eq('page_id', page.id).eq('user_id', userId)
    loadShares()
  }

  function copyLink() {
    navigator.clipboard?.writeText(`${window.location.origin}/share/${page.id}`)
    alert('Link copied!')
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)' }}>
      {/* TOP BAR */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0, background: 'var(--bg)' }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-secondary)' }}>
          <span style={{ fontSize: '14px' }}>{page.icon || '📄'}</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '300px' }}>{title || 'Untitled'}</span>
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {canEdit && <span style={{ fontSize: '11px', color: saved ? 'var(--text-tertiary)' : 'var(--orange)' }}>{saved ? 'Saved' : 'Saving…'}</span>}
          {isOwner && (
            <button onClick={() => setShareOpen(o => !o)}
              style={{ background: 'var(--accent)', color: 'white', border: 'none', padding: '5px 12px', borderRadius: 'var(--radius)', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>
              Share
            </button>
          )}
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* MAIN CONTENT */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {/* COVER */}
          {page.cover_url && (
            <div style={{ position: 'relative', height: '200px', overflow: 'hidden' }}
              onMouseEnter={() => setHeaderHovered(true)}
              onMouseLeave={() => setHeaderHovered(false)}>
              <img src={page.cover_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              {canEdit && headerHovered && (
                <div style={{ position: 'absolute', bottom: '8px', right: '12px', display: 'flex', gap: '6px' }}>
                  <button onClick={() => setShowCoverPicker(true)} style={coverBtnSt}>Change cover</button>
                  <button onClick={removeCover} style={coverBtnSt}>Remove</button>
                </div>
              )}
            </div>
          )}

          {/* PAGE HEADER */}
          <div className="page-content" style={{ padding: page.cover_url ? '24px 96px 0' : '64px 96px 0' }}
            onMouseEnter={() => setHeaderHovered(true)}
            onMouseLeave={() => setHeaderHovered(false)}>
            {/* Icon */}
            {page.icon && (
              <div onClick={() => canEdit && setShowIconPicker(true)}
                style={{ fontSize: '52px', marginBottom: '8px', cursor: canEdit ? 'pointer' : 'default', display: 'inline-block', lineHeight: 1 }}>
                {page.icon}
              </div>
            )}

            {/* Add cover / icon buttons */}
            {canEdit && headerHovered && !page.icon && !page.cover_url && (
              <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                <button onClick={() => setShowIconPicker(true)} style={addBtnSt}>+ Add icon</button>
                <button onClick={() => setShowCoverPicker(true)} style={addBtnSt}>+ Add cover</button>
              </div>
            )}
            {canEdit && headerHovered && (page.icon || page.cover_url) && (
              <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                {!page.icon && <button onClick={() => setShowIconPicker(true)} style={addBtnSt}>+ Add icon</button>}
                {!page.cover_url && <button onClick={() => setShowCoverPicker(true)} style={addBtnSt}>+ Add cover</button>}
              </div>
            )}

            {/* Title */}
            {canEdit
              ? <div
                  contentEditable suppressContentEditableWarning
                  onBlur={e => saveTitle(e.currentTarget.textContent || '')}
                  style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--text)', outline: 'none', lineHeight: 1.2, marginBottom: '8px', minHeight: '3rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                  data-placeholder="Untitled"
                  onInput={e => { const el = e.currentTarget; if (!el.textContent) el.style.color = 'var(--text-tertiary)'; else el.style.color = 'var(--text)' }}>
                  {title}
                </div>
              : <h1 style={{ fontSize: '2.5rem', fontWeight: 700, marginBottom: '8px', lineHeight: 1.2 }}>{title}</h1>
            }
          </div>

          {/* EDITOR */}
          <div className="page-content" style={{ padding: '8px 96px 96px' }}>
            {canEdit
              ? <Editor content={page.content} onChange={scheduleContentSave} editable={true} />
              : <Editor content={page.content} onChange={() => {}} editable={false} />
            }
          </div>
        </div>

        {/* SHARE PANEL */}
        {shareOpen && isOwner && (
          <div style={{ width: '300px', background: 'var(--bg)', borderLeft: '1px solid var(--border)', padding: '20px', overflowY: 'auto', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 600 }}>Share</h3>
              <button onClick={() => setShareOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: '16px' }}>✕</button>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={shareLabelSt}>Link access</label>
              <select value={page.link_permission} onChange={e => updateLinkPerm(e.target.value)} style={selectSt}>
                <option value="none">No access</option>
                <option value="view">Anyone with link — view</option>
                <option value="edit">Anyone with link — edit</option>
              </select>
              {page.link_permission !== 'none' && (
                <button onClick={copyLink} style={{ marginTop: '6px', width: '100%', padding: '6px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '12px', cursor: 'pointer', color: 'var(--text)' }}>
                  Copy link
                </button>
              )}
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={shareLabelSt}>Add person</label>
              <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && inviteUser()}
                placeholder="email@example.com"
                style={{ ...inputSt, marginBottom: '6px' }} />
              <div style={{ display: 'flex', gap: '6px' }}>
                <select value={inviteRole} onChange={e => setInviteRole(e.target.value)} style={{ ...selectSt, flex: 1 }}>
                  <option value="view">Can view</option>
                  <option value="edit">Can edit</option>
                </select>
                <button onClick={inviteUser} style={{ background: 'var(--accent)', color: 'white', border: 'none', padding: '6px 12px', borderRadius: 'var(--radius)', fontSize: '12px', cursor: 'pointer', fontWeight: 500 }}>Add</button>
              </div>
            </div>

            {shares.length > 0 && (
              <div>
                <label style={shareLabelSt}>People with access</label>
                <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {shares.map(s => (
                    <div key={s.user_id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', fontSize: '13px' }}>
                      <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--bg-active)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 600, flexShrink: 0 }}>
                        {(s.email || '?')[0].toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {s.name && <div style={{ fontSize: '12px', fontWeight: 500 }}>{s.name}</div>}
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.email}</div>
                      </div>
                      <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{s.permission}</span>
                      <button onClick={() => removeShare(s.user_id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: '12px' }}>✕</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ICON PICKER */}
      {showIconPicker && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50 }} onClick={() => setShowIconPicker(false)}>
          <div style={{ position: 'absolute', top: '120px', left: '120px', background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-lg)', padding: '12px', boxShadow: 'var(--shadow-lg)', width: '260px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              {EMOJIS.map(e => (
                <button key={e} onClick={() => setIcon(e)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '22px', padding: '4px', borderRadius: 'var(--radius-sm)', lineHeight: 1 }}
                  onMouseEnter={el => (el.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseLeave={el => (el.currentTarget.style.background = 'none')}>
                  {e}
                </button>
              ))}
            </div>
            {page.icon && <button onClick={() => setIcon('')} style={{ marginTop: '8px', width: '100%', padding: '5px', background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '12px', cursor: 'pointer', color: 'var(--text-secondary)' }}>Remove icon</button>}
          </div>
        </div>
      )}

      {/* COVER PICKER */}
      {showCoverPicker && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50 }} onClick={() => setShowCoverPicker(false)}>
          <div style={{ position: 'absolute', top: '120px', left: '120px', background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-lg)', padding: '16px', boxShadow: 'var(--shadow-lg)', width: '320px' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Gallery</div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
              {COVER_IMAGES.map(img => (
                <img key={img} src={img} alt="" onClick={() => setCover(img)}
                  style={{ width: '88px', height: '56px', objectFit: 'cover', borderRadius: 'var(--radius)', cursor: 'pointer', border: '2px solid transparent' }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'transparent')} />
              ))}
            </div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Link</div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <input value={coverInput} onChange={e => setCoverInput(e.target.value)} placeholder="Paste image URL…" style={{ ...inputSt, flex: 1 }} />
              <button onClick={() => coverInput && setCover(coverInput)} style={{ background: 'var(--accent)', color: 'white', border: 'none', padding: '6px 10px', borderRadius: 'var(--radius)', fontSize: '12px', cursor: 'pointer' }}>Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const coverBtnSt: React.CSSProperties = { background: 'rgba(0,0,0,0.5)', color: 'white', border: 'none', padding: '4px 10px', borderRadius: 'var(--radius)', fontSize: '12px', cursor: 'pointer', backdropFilter: 'blur(4px)' }
const addBtnSt: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: 'var(--text-tertiary)', padding: '2px 6px', borderRadius: 'var(--radius-sm)' }
const shareLabelSt: React.CSSProperties = { display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }
const selectSt: React.CSSProperties = { width: '100%', padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontFamily: 'var(--font-sans)', fontSize: '12px', background: 'var(--bg)', color: 'var(--text)', outline: 'none' }
const inputSt: React.CSSProperties = { width: '100%', padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontFamily: 'var(--font-sans)', fontSize: '12px', background: 'var(--bg)', color: 'var(--text)', outline: 'none' }

'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

type Doc = {
  id: string; title: string; content: string; owner_id: string
  folder_id: string | null; link_permission: string
  created_at: string; updated_at: string
}

export default function DocEditor({ doc: initialDoc, canEdit, isOwner, userId }: {
  doc: Doc; canEdit: boolean; isOwner: boolean; userId: string
}) {
  const [doc, setDoc] = useState(initialDoc)
  const [title, setTitle] = useState(initialDoc.title)
  const [content, setContent] = useState(initialDoc.content || '')
  const [mode, setMode] = useState<'edit' | 'split' | 'preview'>('edit')
  const [shareOpen, setShareOpen] = useState(false)
  const [saved, setSaved] = useState(true)
  const [preview, setPreview] = useState('')
  const [shares, setShares] = useState<any[]>([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('view')
  const [toast, setToast] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const saveTimer = useRef<any>(null)
  const editorPaneRef = useRef<HTMLDivElement>(null)
  const previewPaneRef = useRef<HTMLDivElement>(null)
  const syncingRef = useRef(false)

  function syncScroll(source: 'editor' | 'preview') {
    if (syncingRef.current) return
    syncingRef.current = true
    const from = source === 'editor' ? editorPaneRef.current : previewPaneRef.current
    const to = source === 'editor' ? previewPaneRef.current : editorPaneRef.current
    if (from && to) {
      const pct = from.scrollTop / (from.scrollHeight - from.clientHeight || 1)
      to.scrollTop = pct * (to.scrollHeight - to.clientHeight)
    }
    requestAnimationFrame(() => { syncingRef.current = false })
  }
  const supabase = createClient()

  useEffect(() => { renderPreview(content) }, [content])
  useEffect(() => { if (shareOpen && isOwner) loadShares() }, [shareOpen])

  async function loadShares() {
    const { data } = await supabase.from('document_shares').select('*').eq('document_id', doc.id)
    setShares(data || [])
  }

  function renderPreview(md: string) {
    if (typeof window === 'undefined') return
    import('marked').then(({ marked }) => {
      let processed = md
      // Video embeds
      processed = processed.replace(/!video\[([^\]]*)\]\(([^)]+)\)/g, (_, t, url) => {
        const m = url.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/)
        if (m) return `<div class="video-embed"><iframe src="https://www.youtube.com/embed/${m[1]}" allowfullscreen title="${t}"></iframe></div>`
        return `<p><a href="${url}" target="_blank" rel="noopener">${t}</a></p>`
      })
      // Image sizing: ![alt|300](url) or ![alt|300x200](url)
      processed = processed.replace(/!\[([^|\]]+)\|(\d+)(?:x(\d+))?\]\(([^)]+)\)/g, (_, alt, w, h, url) => {
        const style = h ? `width:${w}px;height:${h}px;object-fit:cover` : `width:${w}px`
        return `<img src="${url}" alt="${alt}" style="${style};border-radius:8px;margin:0.5em 0;display:block">`
      })
      // Make all links open in new tab
      const html = (marked.parse(processed) as string).replace(/<a href=/g, '<a target="_blank" rel="noopener" href=')
      setPreview(html)
    })
  }

  function scheduleSave(t: string, c: string) {
    setSaved(false)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => save(t, c), 1200)
  }

  async function save(t: string, c: string) {
    if (!canEdit) return
    await supabase.from('documents').update({ title: t, content: c, updated_at: new Date().toISOString() }).eq('id', doc.id)
    setSaved(true)
  }

  function onTitleChange(v: string) { setTitle(v); scheduleSave(v, content) }
  function onContentChange(v: string) { setContent(v); renderPreview(v); scheduleSave(title, v) }

  function getTA() { return document.getElementById('editor-ta') as HTMLTextAreaElement }

  function wrap(before: string, after: string) {
    const ta = getTA(); if (!ta) return
    const s = ta.selectionStart, e = ta.selectionEnd
    const newVal = content.slice(0, s) + before + content.slice(s, e) + after + content.slice(e)
    updateContent(newVal)
    setTimeout(() => { ta.selectionStart = s + before.length; ta.selectionEnd = e + before.length; ta.focus() }, 0)
  }

  function insertLine(prefix: string) {
    const ta = getTA(); if (!ta) return
    const pos = ta.selectionStart
    const lineStart = content.lastIndexOf('\n', pos - 1) + 1
    const lineContent = content.slice(lineStart, pos)
    // Toggle off
    if (lineContent.startsWith(prefix)) {
      const newVal = content.slice(0, lineStart) + content.slice(lineStart + prefix.length)
      updateContent(newVal)
      setTimeout(() => { ta.selectionStart = ta.selectionEnd = Math.max(lineStart, pos - prefix.length); ta.focus() }, 0)
      return
    }
    // Replace existing prefix
    const existing = lineContent.match(/^(\d+\.\s+|[-*]\s+)/)
    const removeLen = existing ? existing[0].length : 0
    const newVal = content.slice(0, lineStart) + prefix + content.slice(lineStart + removeLen)
    updateContent(newVal)
    setTimeout(() => { ta.selectionStart = ta.selectionEnd = pos + prefix.length - removeLen; ta.focus() }, 0)
  }

  function insertAt(text: string) {
    const ta = getTA(); if (!ta) return
    const pos = ta.selectionStart
    const newVal = content.slice(0, pos) + text + content.slice(pos)
    updateContent(newVal)
    setTimeout(() => { ta.selectionStart = ta.selectionEnd = pos + text.length; ta.focus() }, 0)
  }

  function updateContent(val: string) {
    setContent(val); renderPreview(val); scheduleSave(title, val)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const ta = e.currentTarget
    if (e.key === 'Enter') {
      const pos = ta.selectionStart
      const lineStart = content.lastIndexOf('\n', pos - 1) + 1
      const lineContent = content.slice(lineStart, pos)
      const bullet = lineContent.match(/^([-*]\s)(.*)$/)
      const numbered = lineContent.match(/^(\d+)(\.\s)(.*)$/)

      if (bullet) {
        e.preventDefault()
        if (bullet[2] === '') {
          // Second Enter on empty bullet — exit list, no blank line
          const newVal = content.slice(0, lineStart) + content.slice(pos)
          updateContent(newVal)
          setTimeout(() => { ta.selectionStart = ta.selectionEnd = lineStart; ta.focus() }, 0)
        } else {
          const insert = '\n' + bullet[1]
          const newVal = content.slice(0, pos) + insert + content.slice(pos)
          updateContent(newVal)
          setTimeout(() => { ta.selectionStart = ta.selectionEnd = pos + insert.length; ta.focus() }, 0)
        }
        return
      }
      if (numbered) {
        e.preventDefault()
        if (numbered[3] === '') {
          // Second Enter on empty numbered — exit list, no blank line
          const newVal = content.slice(0, lineStart) + content.slice(pos)
          updateContent(newVal)
          setTimeout(() => { ta.selectionStart = ta.selectionEnd = lineStart; ta.focus() }, 0)
        } else {
          const insert = '\n' + (parseInt(numbered[1]) + 1) + numbered[2]
          const newVal = content.slice(0, pos) + insert + content.slice(pos)
          updateContent(newVal)
          setTimeout(() => { ta.selectionStart = ta.selectionEnd = pos + insert.length; ta.focus() }, 0)
        }
        return
      }
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save(title, content); setSaved(true) }
    if ((e.ctrlKey || e.metaKey) && e.key === 'b') { e.preventDefault(); wrap('**', '**') }
    if ((e.ctrlKey || e.metaKey) && e.key === 'i') { e.preventDefault(); wrap('*', '*') }
  }

  // Image upload to Supabase Storage
  async function uploadImage(file: File): Promise<string | null> {
    const ext = file.name.split('.').pop()
    const path = `${userId}/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('images').upload(path, file)
    if (error) { showToast('Upload failed: ' + error.message); return null }
    const { data } = supabase.storage.from('images').getPublicUrl(path)
    return data.publicUrl
  }

  async function handleImageDrop(e: React.DragEvent) {
    // Only handle if dropping on editor pane (not sidebar)
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))
    if (!files.length) return
    e.preventDefault(); setDragOver(false)
    showToast('Uploading image…')
    for (const file of files) {
      const url = await uploadImage(file)
      if (url) insertAt(`\n![${file.name}](${url})\n`)
    }
  }

  async function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(e.clipboardData.files).filter(f => f.type.startsWith('image/'))
    if (!files.length) return
    e.preventDefault()
    showToast('Uploading image…')
    for (const file of files) {
      const url = await uploadImage(file)
      if (url) insertAt(`\n![Image](${url})\n`)
    }
  }

  async function updateLinkPerm(perm: string) {
    await supabase.from('documents').update({ link_permission: perm }).eq('id', doc.id)
    setDoc(d => ({ ...d, link_permission: perm }))
  }

  async function inviteUser() {
    if (!inviteEmail.trim()) return
    const { data: profile } = await supabase.from('profiles').select('id').eq('email', inviteEmail.trim()).single()
    if (!profile) { showToast('User not found. They must have a Canopy account.'); return }
    await supabase.from('document_shares').upsert({ document_id: doc.id, user_id: profile.id, permission: inviteRole })
    setInviteEmail(''); loadShares(); showToast('Invitation sent!')
  }

  async function removeShare(uid: string) {
    await supabase.from('document_shares').delete().eq('document_id', doc.id).eq('user_id', uid)
    loadShares()
  }

  function copyLink() {
    navigator.clipboard?.writeText(`${window.location.origin}/app/doc/${doc.id}`)
    showToast('Link copied!')
  }

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 2500) }

  const created = new Date(doc.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}
      onDragOver={e => { if (canEdit && Array.from(e.dataTransfer.types).includes('Files')) { e.preventDefault(); setDragOver(true) } }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false) }}
      onDrop={e => { if (canEdit) handleImageDrop(e) }}
    >
      {/* Drag overlay */}
      {dragOver && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(45,106,79,0.08)', border: '2px dashed var(--accent)', borderRadius: '8px', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <span style={{ fontFamily: 'var(--font-serif)', fontSize: '1.2rem', color: 'var(--accent)' }}>Drop image to insert</span>
        </div>
      )}

      {/* TOOLBAR */}
      {canEdit && (
        <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '6px 16px', display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap', flexShrink: 0 }}>
          <select onChange={e => { if (e.target.value) { insertLine(e.target.value); e.target.value = '' } }} style={tbSelectSt} defaultValue="">
            <option value="">Paragraph</option>
            <option value="# ">Heading 1</option>
            <option value="## ">Heading 2</option>
            <option value="### ">Heading 3</option>
          </select>
          <Sep />
          <TbBtn onClick={() => wrap('**', '**')} title="Bold"><b style={{ fontWeight: 700 }}>B</b></TbBtn>
          <TbBtn onClick={() => wrap('*', '*')} title="Italic"><i>I</i></TbBtn>
          <TbBtn onClick={() => wrap('~~', '~~')} title="Strikethrough"><span style={{ textDecoration: 'line-through' }}>S</span></TbBtn>
          <TbBtn onClick={() => wrap('`', '`')} title="Code">{'<>'}</TbBtn>
          <Sep />
          <TbBtn onClick={() => insertLine('- ')} title="Bullet list">• —</TbBtn>
          <TbBtn onClick={() => insertLine('1. ')} title="Numbered list">1.</TbBtn>
          <TbBtn onClick={() => insertLine('> ')} title="Quote">❝</TbBtn>
          <TbBtn onClick={() => insertAt('\n---\n')} title="Divider">—</TbBtn>
          <Sep />
          <TbBtn onClick={() => insertAt('[Link text](https://...)')} title="Link">🔗</TbBtn>
          <TbBtn onClick={() => insertAt('\n| Col 1 | Col 2 | Col 3 |\n|---|---|---|\n| Cell | Cell | Cell |\n')} title="Table">⊞</TbBtn>
          <TbBtn onClick={() => insertAt('\n!video[Title](https://youtube.com/watch?v=...)\n')} title="Embed video">▶</TbBtn>
          <label title="Upload image"
            style={{ ...tbBtnBase, cursor: 'pointer' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--accent-light)'; (e.currentTarget as HTMLElement).style.color = 'var(--accent)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; (e.currentTarget as HTMLElement).style.color = 'var(--muted)'; (e.currentTarget as HTMLElement).style.borderColor = 'transparent' }}
          >
            ⬚<input type="file" accept="image/*" style={{ display: 'none' }} onChange={async e => {
              const file = e.target.files?.[0]; if (!file) return
              showToast('Uploading…')
              const url = await uploadImage(file)
              if (url) insertAt(`\n![${file.name}](${url})\n`)
              e.target.value = ''
            }} />
          </label>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{saved ? '✓ Saved' : 'Saving…'}</span>
            <Sep />
            <div style={{ display: 'flex', background: 'var(--sidebar)', borderRadius: '7px', padding: '2px', gap: '2px' }}>
              {(['edit', 'split', 'preview'] as const).map(m => (
                <button key={m} onClick={() => setMode(m)}
                  style={{ background: mode === m ? 'var(--surface)' : 'none', border: 'none', padding: '3px 10px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', color: mode === m ? 'var(--text)' : 'var(--muted)', fontFamily: 'var(--font-sans)', fontWeight: mode === m ? 500 : 400, boxShadow: mode === m ? '0 1px 2px rgba(0,0,0,0.08)' : 'none' }}>
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>
            <Sep />
            {isOwner && <button onClick={() => setShareOpen(o => !o)} style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '5px 14px', borderRadius: '7px', fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>Share</button>}
          </div>
        </div>
      )}

      {/* CONTENT */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          <div ref={editorPaneRef} onScroll={() => { if (mode === 'split') syncScroll('editor') }} style={{ flex: 1, overflowY: 'auto', padding: mode === 'split' ? '32px' : '40px 60px', display: 'flex', flexDirection: 'column', maxWidth: mode === 'split' ? 'none' : '780px', margin: mode === 'split' ? '0' : '0 auto', width: '100%' }}>
            {canEdit ? (
              <input value={title} onChange={e => onTitleChange(e.target.value)} placeholder="Untitled"
                style={{ fontFamily: 'var(--font-serif)', fontSize: '2rem', fontWeight: 600, border: 'none', background: 'transparent', color: 'var(--text)', outline: 'none', width: '100%', marginBottom: '8px', lineHeight: 1.2 }} />
            ) : (
              <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '2rem', fontWeight: 600, marginBottom: '8px' }}>{title}</h1>
            )}
            <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '28px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <span>Created {created}</span>
              {!canEdit && <span style={{ background: '#fdf3e3', color: '#8b5e00', padding: '1px 8px', borderRadius: '6px', fontSize: '11px' }}>View only</span>}
              {canEdit && <span style={{ color: 'var(--muted)', fontSize: '11px' }}>Drag & drop or paste images directly</span>}
            </div>

            {(mode === 'edit' || mode === 'split') && canEdit && (
              <textarea id="editor-ta" value={content}
                onChange={e => onContentChange(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder="Start writing… Markdown supported. Paste or drag images."
                style={{ flex: 1, border: mode === 'split' ? '1px solid var(--border)' : 'none', borderRadius: mode === 'split' ? '8px' : '0', background: mode === 'split' ? 'var(--bg)' : 'transparent', fontFamily: 'var(--font-sans)', fontSize: '0.9rem', lineHeight: 1.7, color: 'var(--text)', outline: 'none', resize: 'none', minHeight: '400px', padding: mode === 'split' ? '12px' : '0' }} />
            )}
            {(mode === 'edit' && !canEdit) || mode === 'preview' ? (
              <div className="prose" dangerouslySetInnerHTML={{ __html: preview }} />
            ) : null}
          </div>

          {mode === 'split' && (
            <div ref={previewPaneRef} onScroll={() => syncScroll('preview')} style={{ flex: 1, overflowY: 'auto', padding: '32px', borderLeft: '1px solid var(--border)' }}>
              <div className="prose" dangerouslySetInnerHTML={{ __html: preview }} />
            </div>
          )}
        </div>

        {/* SHARE PANEL */}
        {shareOpen && isOwner && (
          <div style={{ width: '280px', background: 'var(--surface)', borderLeft: '1px solid var(--border)', padding: '20px', overflowY: 'auto', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: '1rem' }}>Share</h3>
              <button onClick={() => setShareOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '16px' }}>✕</button>
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={shareLabelSt}>Link access</label>
              <select value={doc.link_permission} onChange={e => updateLinkPerm(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: '8px', fontFamily: 'var(--font-sans)', fontSize: '0.875rem', background: 'var(--bg)', color: 'var(--text)', marginTop: '6px', outline: 'none' }}>
                <option value="none">No link access</option>
                <option value="view">Anyone with link can view</option>
                <option value="edit">Anyone with link can edit</option>
              </select>
              {doc.link_permission !== 'none' && (
                <button onClick={copyLink} style={{ marginTop: '8px', width: '100%', padding: '7px', border: '1px solid var(--border)', borderRadius: '7px', background: 'var(--bg)', fontFamily: 'var(--font-sans)', fontSize: '0.85rem', cursor: 'pointer', color: 'var(--text)' }}>Copy link</button>
              )}
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={shareLabelSt}>Invite by email</label>
              <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="email@example.com"
                style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: '8px', fontFamily: 'var(--font-sans)', fontSize: '0.875rem', background: 'var(--bg)', color: 'var(--text)', marginTop: '6px', outline: 'none', marginBottom: '6px' }} />
              <div style={{ display: 'flex', gap: '6px' }}>
                <select value={inviteRole} onChange={e => setInviteRole(e.target.value)}
                  style={{ flex: 1, padding: '7px 8px', border: '1px solid var(--border)', borderRadius: '7px', fontFamily: 'var(--font-sans)', fontSize: '0.85rem', background: 'var(--bg)', color: 'var(--text)', outline: 'none' }}>
                  <option value="view">Can view</option>
                  <option value="edit">Can edit</option>
                </select>
                <button onClick={inviteUser} style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '7px 14px', borderRadius: '7px', fontFamily: 'var(--font-sans)', fontSize: '0.85rem', cursor: 'pointer', fontWeight: 500 }}>Invite</button>
              </div>
            </div>
            {shares.length > 0 && (
              <div>
                <label style={shareLabelSt}>Shared with</label>
                <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {shares.map(s => (
                    <div key={s.user_id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 8px', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                      <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: 'var(--accent-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 600, color: 'var(--accent)', flexShrink: 0 }}>
                        {(s.email || s.user_id)[0].toUpperCase()}
                      </div>
                      <span style={{ flex: 1, fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.email || s.user_id.slice(0, 8)}</span>
                      <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{s.permission}</span>
                      <button onClick={() => removeShare(s.user_id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '12px' }}>✕</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {toast && (
        <div style={{ position: 'fixed', bottom: '24px', right: '24px', background: 'var(--text)', color: '#fff', padding: '10px 18px', borderRadius: '10px', fontSize: '13px', zIndex: 200, animation: 'fadeIn 0.2s ease' }}>
          {toast}
        </div>
      )}
    </div>
  )
}

function TbBtn({ onClick, title, children }: any) {
  return (
    <button onClick={onClick} title={title} style={tbBtnBase}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--accent-light)'; (e.currentTarget as HTMLElement).style.color = 'var(--accent)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; (e.currentTarget as HTMLElement).style.color = 'var(--muted)'; (e.currentTarget as HTMLElement).style.borderColor = 'transparent' }}>
      {children}
    </button>
  )
}

function Sep() {
  return <div style={{ width: '1px', height: '18px', background: 'var(--border)', margin: '0 2px', flexShrink: 0 }} />
}

const tbBtnBase: React.CSSProperties = { background: 'none', border: '1px solid transparent', cursor: 'pointer', color: 'var(--muted)', padding: '4px 8px', borderRadius: '6px', fontSize: '12px', fontFamily: 'var(--font-sans)', display: 'flex', alignItems: 'center', gap: '2px', transition: 'all 0.1s' }
const tbSelectSt: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--font-sans)', fontSize: '12px', padding: '4px 8px', borderRadius: '6px', cursor: 'pointer', outline: 'none' }
const shareLabelSt: React.CSSProperties = { fontSize: '10px', fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.7px' }

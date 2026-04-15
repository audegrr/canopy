'use client'
import { useState, useTransition } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Folder = { id: string; name: string; expanded?: boolean }
type Doc = { id: string; title: string; folder_id: string | null; link_permission: string }
type User = { id: string; email: string; name: string }

export default function AppShell({
  user, initialFolders, initialDocs, children
}: {
  user: User
  initialFolders: Folder[]
  initialDocs: Doc[]
  children: React.ReactNode
}) {
  const [folders, setFolders] = useState<Folder[]>(initialFolders.map(f => ({ ...f, expanded: true })))
  const [docs, setDocs] = useState<Doc[]>(initialDocs)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [modal, setModal] = useState<null | 'newDoc' | 'newFolder' | 'renameFolder' | 'deleteFolder' | 'renameDoc' | 'deleteDoc'>(null)
  const [modalData, setModalData] = useState<any>({})
  const [inputVal, setInputVal] = useState('')
  const [folderSelect, setFolderSelect] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  const currentDocId = pathname.startsWith('/app/doc/') ? pathname.split('/app/doc/')[1] : null

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  function openModal(type: typeof modal, data: any = {}, prefill = '') {
    setModal(type); setModalData(data); setInputVal(prefill); setFolderSelect('')
  }
  function closeModal() { setModal(null); setModalData({}) }

  async function createFolder() {
    const name = inputVal.trim() || 'Untitled folder'
    const { data, error } = await supabase.from('folders').insert({ name, owner_id: user.id }).select().single()
    if (!error && data) setFolders(f => [...f, { ...data, expanded: true }])
    closeModal()
  }

  async function renameFolder() {
    const name = inputVal.trim() || modalData.name
    const { error } = await supabase.from('folders').update({ name }).eq('id', modalData.id)
    if (!error) setFolders(f => f.map(x => x.id === modalData.id ? { ...x, name } : x))
    closeModal()
  }

  async function deleteFolder() {
    await supabase.from('documents').delete().eq('folder_id', modalData.id)
    await supabase.from('folders').delete().eq('id', modalData.id)
    setFolders(f => f.filter(x => x.id !== modalData.id))
    setDocs(d => d.filter(x => x.folder_id !== modalData.id))
    if (currentDocId && docs.find(d => d.id === currentDocId && d.folder_id === modalData.id)) router.push('/app')
    closeModal()
  }

  async function createDoc() {
    const title = inputVal.trim() || 'Untitled'
    const folder_id = modalData.folderId || folderSelect || null
    const { data, error } = await supabase.from('documents').insert({
      title, folder_id, content: '', link_permission: 'none'
    }).select().single()
    if (error) {
      console.error('createDoc error:', error)
      alert('Error creating document: ' + error.message)
      return
    }
    if (data) {
      setDocs(d => [data, ...d])
      closeModal()
      router.push(`/app/doc/${data.id}`)
    }
  }

  async function renameDoc() {
    const title = inputVal.trim() || modalData.title
    const { error } = await supabase.from('documents').update({ title }).eq('id', modalData.id)
    if (!error) setDocs(d => d.map(x => x.id === modalData.id ? { ...x, title } : x))
    closeModal()
  }

  async function deleteDoc() {
    await supabase.from('documents').delete().eq('id', modalData.id)
    setDocs(d => d.filter(x => x.id !== modalData.id))
    if (currentDocId === modalData.id) router.push('/app')
    closeModal()
  }

  async function moveDocToFolder(docId: string, folderId: string | null) {
    const doc = docs.find(d => d.id === docId)
    if (!doc || doc.folder_id === folderId) return
    await supabase.from('documents').update({ folder_id: folderId }).eq('id', docId)
    setDocs(d => d.map(x => x.id === docId ? { ...x, folder_id: folderId } : x))
  }

  function toggleFolder(id: string) {
    setFolders(f => f.map(x => x.id === id ? { ...x, expanded: !x.expanded } : x))
  }

  const rootDocs = docs.filter(d => !d.folder_id)

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg)' }}>
      {/* SIDEBAR */}
      <aside style={{
        width: sidebarOpen ? '240px' : '0', minWidth: sidebarOpen ? '240px' : '0',
        background: 'var(--sidebar)', borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', height: '100vh',
        overflow: 'hidden', transition: 'width 0.2s, min-width 0.2s', flexShrink: 0
      }}>
        {/* Logo */}
        <div style={{ padding: '16px 14px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ fontFamily: 'var(--font-serif)', fontSize: '1.25rem', fontWeight: 600, color: 'var(--accent)' }}>Canopy</span>
          <div style={{ display: 'flex', gap: '2px' }}>
            <SideBtn title="New document" onClick={() => openModal('newDoc')}>✦</SideBtn>
            <SideBtn title="New folder" onClick={() => openModal('newFolder')}>⊞</SideBtn>
          </div>
        </div>

        {/* Tree */}
        <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '12px' }}>
          <div style={{ padding: '8px 10px 4px', fontSize: '10px', fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.7px' }}>Workspace</div>

          {/* Folders with drag & drop */}
          {folders.map(f => (
            <FolderDropZone key={f.id} folder={f}
              onDrop={moveDocToFolder}
              onToggle={() => toggleFolder(f.id)}
              onNewDoc={() => openModal('newDoc', { folderId: f.id })}
              onRename={() => openModal('renameFolder', f, f.name)}
              onDelete={() => openModal('deleteFolder', f)}
            >
              {docs.filter(d => d.folder_id === f.id).map(d => (
                <DocItem key={d.id} doc={d} active={currentDocId === d.id}
                  onClick={() => router.push(`/app/doc/${d.id}`)}
                  onRename={() => openModal('renameDoc', d, d.title)}
                  onDelete={() => openModal('deleteDoc', d)}
                />
              ))}
                ]}
              />
              {f.expanded && (
                <div style={{ paddingLeft: '12px' }}>
                  {docs.filter(d => d.folder_id === f.id).map(d => (
                    <DocItem key={d.id} doc={d} active={currentDocId === d.id}
                      onClick={() => router.push(`/app/doc/${d.id}`)}
                      onRename={() => openModal('renameDoc', d, d.title)}
                      onDelete={() => openModal('deleteDoc', d)}
                    />
                  ))}
            </FolderDropZone>
          ))}

          {/* Root docs — also droppable to remove from folder */}
          <div
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const docId = e.dataTransfer.getData('docId'); if (docId) moveDocToFolder(docId, null) }}
            style={{ minHeight: '8px' }}
          >
            {rootDocs.map(d => (
              <DocItem key={d.id} doc={d} active={currentDocId === d.id}
                onClick={() => router.push(`/app/doc/${d.id}`)}
                onRename={() => openModal('renameDoc', d, d.title)}
                onDelete={() => openModal('deleteDoc', d)}
              />
            ))}
          </div>
        </div>

        {/* User */}
        <div style={{ padding: '10px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', borderRadius: '8px' }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--accent-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 600, color: 'var(--accent)', flexShrink: 0 }}>
              {user.name[0].toUpperCase()}
            </div>
            <span style={{ fontSize: '13px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }}>{user.name}</span>
            <button onClick={signOut} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '12px', padding: '2px 4px', borderRadius: '4px' }} title="Sign out">⏻</button>
          </div>
        </div>
      </aside>

      {/* MAIN */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {/* Top bar toggle */}
        <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <button onClick={() => setSidebarOpen(o => !o)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '16px', padding: '4px 6px', borderRadius: '6px' }}>☰</button>
        </div>
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
          {children}
        </div>
      </main>

      {/* MODAL */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
          onClick={e => { if (e.target === e.currentTarget) closeModal() }}>
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: '28px', width: '100%', maxWidth: '380px', boxShadow: '0 8px 40px rgba(0,0,0,0.15)' }}>
            {modal === 'newFolder' && <>
              <h2 style={modalTitle}>New folder</h2>
              <Input label="Name" value={inputVal} onChange={setInputVal} placeholder="My folder" autoFocus />
              <ModalActions onCancel={closeModal} onConfirm={createFolder} confirmLabel="Create" />
            </>}
            {modal === 'renameFolder' && <>
              <h2 style={modalTitle}>Rename folder</h2>
              <Input label="Name" value={inputVal} onChange={setInputVal} autoFocus />
              <ModalActions onCancel={closeModal} onConfirm={renameFolder} confirmLabel="Rename" />
            </>}
            {modal === 'deleteFolder' && <>
              <h2 style={modalTitle}>Delete folder?</h2>
              <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginBottom: '20px' }}>All documents inside will also be deleted. This cannot be undone.</p>
              <ModalActions onCancel={closeModal} onConfirm={deleteFolder} confirmLabel="Delete" danger />
            </>}
            {modal === 'newDoc' && <>
              <h2 style={modalTitle}>New document</h2>
              <Input label="Title" value={inputVal} onChange={setInputVal} placeholder="Untitled" autoFocus />
              {!modalData.folderId && folders.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  <label style={labelSt}>Folder (optional)</label>
                  <select value={folderSelect} onChange={e => setFolderSelect(e.target.value)} style={selectSt}>
                    <option value="">No folder</option>
                    {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </div>
              )}
              <ModalActions onCancel={closeModal} onConfirm={createDoc} confirmLabel="Create" />
            </>}
            {modal === 'renameDoc' && <>
              <h2 style={modalTitle}>Rename document</h2>
              <Input label="Title" value={inputVal} onChange={setInputVal} autoFocus />
              <ModalActions onCancel={closeModal} onConfirm={renameDoc} confirmLabel="Rename" />
            </>}
            {modal === 'deleteDoc' && <>
              <h2 style={modalTitle}>Delete document?</h2>
              <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginBottom: '20px' }}>This cannot be undone.</p>
              <ModalActions onCancel={closeModal} onConfirm={deleteDoc} confirmLabel="Delete" danger />
            </>}
          </div>
        </div>
      )}
    </div>
  )
}

function DocItem({ doc, active, onClick, onRename, onDelete, onDrop }: any) {
  const permIcon = doc.link_permission === 'view' ? ' 👁' : doc.link_permission === 'edit' ? ' ✎' : ''
  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.setData('docId', doc.id); e.dataTransfer.effectAllowed = 'move' }}
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px',
        cursor: 'grab', borderRadius: '7px', margin: '1px 6px', userSelect: 'none',
        background: active ? 'var(--accent-light)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text)', transition: 'background 0.1s', position: 'relative'
      }}
      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--border)' }}
      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = active ? 'var(--accent-light)' : 'transparent' }}
    >
      <span style={{ fontSize: '15px', flexShrink: 0, width: '18px', textAlign: 'center' }}>📄</span>
      <span style={{ flex: 1, fontSize: '13.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.title || 'Untitled'}</span>
      {permIcon && <span style={{ fontSize: '10px' }}>{permIcon}</span>}
      <span className="tree-actions" style={{ display: 'none', gap: '2px' }} onClick={e => e.stopPropagation()}>
        <button onClick={onRename} title="Rename" style={actionBtnSt}>✎</button>
        <button onClick={onDelete} title="Delete" style={actionBtnSt}>✕</button>
      </span>
      <style>{`.tree-actions{display:none!important}div:hover>.tree-actions{display:flex!important}`}</style>
    </div>
  )
}

function FolderDropZone({ folder, onDrop, children, onToggle, onNewDoc, onRename, onDelete }: any) {
  const [dragOver, setDragOver] = useState(false)
  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => { e.preventDefault(); setDragOver(false); const docId = e.dataTransfer.getData('docId'); if (docId) onDrop(docId, folder.id) }}
      style={{ outline: dragOver ? '2px dashed var(--accent)' : 'none', borderRadius: '8px', transition: 'outline 0.1s' }}
    >
      <div onClick={onToggle} style={{
        display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px',
        cursor: 'pointer', borderRadius: '7px', margin: '1px 6px', userSelect: 'none',
        background: dragOver ? 'var(--accent-light)' : 'transparent', transition: 'background 0.1s', position: 'relative'
      }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = dragOver ? 'var(--accent-light)' : 'var(--border)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = dragOver ? 'var(--accent-light)' : 'transparent' }}
      >
        <span style={{ fontSize: '10px', color: 'var(--muted)', transition: 'transform 0.15s', display: 'inline-block', transform: folder.expanded ? 'rotate(90deg)' : 'none' }}>▶</span>
        <span style={{ fontSize: '15px', flexShrink: 0, width: '18px', textAlign: 'center' }}>📁</span>
        <span style={{ flex: 1, fontSize: '13.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{folder.name}</span>
        <span className="tree-actions" style={{ display: 'none', gap: '2px' }} onClick={e => e.stopPropagation()}>
          <button onClick={onNewDoc} title="New doc" style={actionBtnSt}>+</button>
          <button onClick={onRename} title="Rename" style={actionBtnSt}>✎</button>
          <button onClick={onDelete} title="Delete" style={actionBtnSt}>✕</button>
        </span>
        <style>{`.tree-actions{display:none!important}div:hover>.tree-actions{display:flex!important}`}</style>
      </div>
      {folder.expanded && <div style={{ paddingLeft: '12px' }}>{children}</div>}
    </div>
  )
}

function TreeItem({ icon, label, active, onClick, prefix, suffix, actions }: {
  icon: string; label: string; active: boolean; onClick: () => void
  prefix?: React.ReactNode; suffix?: React.ReactNode
  actions?: { label: string; title: string; onClick: () => void }[]
}) {
  return (
    <div onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px',
      cursor: 'pointer', borderRadius: '7px', margin: '1px 6px', userSelect: 'none',
      background: active ? 'var(--accent-light)' : 'transparent', color: active ? 'var(--accent)' : 'var(--text)',
      transition: 'background 0.1s', position: 'relative'
    }}
      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--border)' }}
      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
    >
      {prefix}
      <span style={{ fontSize: '15px', flexShrink: 0, width: '18px', textAlign: 'center' }}>{icon}</span>
      <span style={{ flex: 1, fontSize: '13.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      {suffix}
      {actions && (
        <span className="tree-actions" style={{ display: 'none', gap: '2px' }} onClick={e => e.stopPropagation()}>
          {actions.map((a, i) => (
            <button key={i} onClick={a.onClick} title={a.title} style={actionBtnSt}>{a.label}</button>
          ))}
        </span>
      )}
      <style>{`.tree-actions{display:none!important}div:hover>.tree-actions{display:flex!important}`}</style>
    </div>
  )
}

const actionBtnSt: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: '2px 4px', borderRadius: '4px', fontSize: '11px' }

function SideBtn({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={title} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: '6px 8px', borderRadius: '6px', fontSize: '17px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--border)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
      {children}
    </button>
  )
}

function Input({ label, value, onChange, placeholder, autoFocus }: any) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <label style={labelSt}>{label}</label>
      <input value={value} onChange={(e: any) => onChange(e.target.value)} placeholder={placeholder}
        autoFocus={autoFocus}
        style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: '8px', fontFamily: 'var(--font-sans)', fontSize: '0.95rem', background: 'var(--bg)', color: 'var(--text)', outline: 'none' }} />
    </div>
  )
}

function ModalActions({ onCancel, onConfirm, confirmLabel, danger }: any) {
  return (
    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
      <button onClick={onCancel} style={{ background: 'var(--sidebar)', border: 'none', padding: '8px 16px', borderRadius: '8px', fontFamily: 'var(--font-sans)', fontSize: '0.9rem', cursor: 'pointer', color: 'var(--text)' }}>Cancel</button>
      <button onClick={onConfirm} style={{ background: danger ? '#fde8e8' : 'var(--accent)', color: danger ? 'var(--danger)' : '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', fontFamily: 'var(--font-sans)', fontSize: '0.9rem', fontWeight: 500, cursor: 'pointer' }}>{confirmLabel}</button>
    </div>
  )
}

const modalTitle: React.CSSProperties = { fontFamily: 'var(--font-serif)', fontSize: '1.2rem', marginBottom: '20px' }
const labelSt: React.CSSProperties = { display: 'block', fontSize: '0.75rem', fontWeight: 500, color: 'var(--muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }
const selectSt: React.CSSProperties = { width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: '8px', fontFamily: 'var(--font-sans)', fontSize: '0.95rem', background: 'var(--bg)', color: 'var(--text)', outline: 'none' }

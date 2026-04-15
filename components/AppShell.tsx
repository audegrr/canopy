'use client'
import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Folder = { id: string; name: string; expanded?: boolean }
type Doc = { id: string; title: string; folder_id: string | null; link_permission: string }
type User = { id: string; email: string; name: string }
type Database = { id: string; title: string }

export default function AppShell({
  user, initialFolders, initialDocs, initialDatabases = [], children
}: {
  user: User
  initialFolders: Folder[]
  initialDocs: Doc[]
  initialDatabases?: Database[]
  children: React.ReactNode
}) {
  const [folders, setFolders] = useState<Folder[]>(initialFolders.map(f => ({ ...f, expanded: true })))
  const [docs, setDocs] = useState<Doc[]>(initialDocs)
  const [databases, setDatabases] = useState<Database[]>(initialDatabases)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [modal, setModal] = useState<null | 'newDoc' | 'newFolder' | 'renameFolder' | 'deleteFolder' | 'renameDoc' | 'deleteDoc'>(null)
  const [modalData, setModalData] = useState<any>({})
  const [inputVal, setInputVal] = useState('')
  const [folderSelect, setFolderSelect] = useState('')
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
    if (error) { alert('Error: ' + error.message); return }
    if (data) { setDocs(d => [data, ...d]); closeModal(); router.push(`/app/doc/${data.id}`) }
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

  async function createDatabase() {
    const { data, error } = await supabase.from('databases').insert({ title: 'Untitled database', owner_id: user.id, fields: [] }).select().single()
    if (error) { alert('Error: ' + error.message); return }
    if (data) { setDatabases(d => [data, ...d]); router.push(`/app/db/${data.id}`) }
  }

  function toggleFolder(id: string) {
    setFolders(f => f.map(x => x.id === id ? { ...x, expanded: !x.expanded } : x))
  }

  async function moveDocToFolder(docId: string, folderId: string | null) {
    const doc = docs.find(d => d.id === docId)
    if (!doc || doc.folder_id === folderId) return
    await supabase.from('documents').update({ folder_id: folderId }).eq('id', docId)
    setDocs(d => d.map(x => x.id === docId ? { ...x, folder_id: folderId } : x))
  }

  const rootDocs = docs.filter(d => !d.folder_id)

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg)' }}>
      <aside style={{
        width: sidebarOpen ? '240px' : '0', minWidth: sidebarOpen ? '240px' : '0',
        background: 'var(--sidebar)', borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', height: '100vh',
        overflow: 'hidden', transition: 'width 0.2s, min-width 0.2s', flexShrink: 0
      }}>
        {/* Logo + actions */}
        <div style={{ padding: '16px 14px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ fontFamily: 'var(--font-serif)', fontSize: '1.25rem', fontWeight: 600, color: 'var(--accent)' }}>Canopy</span>
          <div style={{ display: 'flex', gap: '4px' }}>
            <SideBtn title="New document" onClick={() => openModal('newDoc')}>✦</SideBtn>
            <SideBtn title="New folder" onClick={() => openModal('newFolder')}>⊞</SideBtn>
            <SideBtn title="New database" onClick={createDatabase}>🗄</SideBtn>
          </div>
        </div>

        {/* Tree */}
        <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '12px' }}>
          <div style={{ padding: '8px 10px 4px', fontSize: '10px', fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.7px' }}>Workspace</div>

          {folders.map(f => (
            <FolderZone key={f.id} folder={f}
              onDrop={moveDocToFolder}
              onToggle={() => toggleFolder(f.id)}
              onNewDoc={() => openModal('newDoc', { folderId: f.id })}
              onRename={() => openModal('renameFolder', f, f.name)}
              onDelete={() => openModal('deleteFolder', f)}
            >
              {docs.filter(d => d.folder_id === f.id).map(d => (
                <DocRow key={d.id} doc={d} active={currentDocId === d.id}
                  onClick={() => router.push(`/app/doc/${d.id}`)}
                  onRename={() => openModal('renameDoc', d, d.title)}
                  onDelete={() => openModal('deleteDoc', d)}
                />
              ))}
            </FolderZone>
          ))}

          {/* Root drop zone */}
          <RootDropZone onDrop={(docId) => moveDocToFolder(docId, null)}>
            {rootDocs.map(d => (
              <DocRow key={d.id} doc={d} active={currentDocId === d.id}
                onClick={() => router.push(`/app/doc/${d.id}`)}
                onRename={() => openModal('renameDoc', d, d.title)}
                onDelete={() => openModal('deleteDoc', d)}
              />
            ))}
          </RootDropZone>
        </div>

        {/* Databases */}
        {databases.length > 0 && (
          <div style={{ marginTop: '8px' }}>
            <div style={{ padding: '8px 10px 4px', fontSize: '10px', fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.7px' }}>Databases</div>
            {databases.map(db => (
              <div key={db.id} onClick={() => router.push(`/app/db/${db.id}`)}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px', cursor: 'pointer', borderRadius: '7px', margin: '1px 6px', userSelect: 'none', background: pathname === `/app/db/${db.id}` ? 'var(--accent-light)' : 'transparent', color: pathname === `/app/db/${db.id}` ? 'var(--accent)' : 'var(--text)' }}
                onMouseEnter={e => { if (pathname !== `/app/db/${db.id}`) (e.currentTarget as HTMLElement).style.background = 'var(--border)' }}
                onMouseLeave={e => { if (pathname !== `/app/db/${db.id}`) (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
                <span style={{ fontSize: '16px' }}>🗄️</span>
                <span style={{ flex: 1, fontSize: '13.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{db.title}</span>
              </div>
            ))}
          </div>
        )}
        {/* User */}
        <div style={{ padding: '10px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', borderRadius: '8px' }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--accent-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 600, color: 'var(--accent)', flexShrink: 0 }}>
              {user.name[0].toUpperCase()}
            </div>
            <span style={{ fontSize: '13px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }}>{user.name}</span>
            <button onClick={signOut} title="Sign out" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '16px', padding: '2px 4px', borderRadius: '4px' }}>⏻</button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <button onClick={() => setSidebarOpen(o => !o)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '18px', padding: '4px 6px', borderRadius: '6px' }}>☰</button>
        </div>
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>{children}</div>
      </main>

      {/* Modal */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
          onClick={e => { if (e.target === e.currentTarget) closeModal() }}>
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: '28px', width: '100%', maxWidth: '380px', boxShadow: '0 8px 40px rgba(0,0,0,0.15)' }}>
            {modal === 'newFolder' && <>
              <h2 style={modalTitle}>New folder</h2>
              <MInput label="Name" value={inputVal} onChange={setInputVal} placeholder="My folder" autoFocus />
              <MActions onCancel={closeModal} onConfirm={createFolder} confirmLabel="Create" />
            </>}
            {modal === 'renameFolder' && <>
              <h2 style={modalTitle}>Rename folder</h2>
              <MInput label="Name" value={inputVal} onChange={setInputVal} autoFocus />
              <MActions onCancel={closeModal} onConfirm={renameFolder} confirmLabel="Rename" />
            </>}
            {modal === 'deleteFolder' && <>
              <h2 style={modalTitle}>Delete folder?</h2>
              <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginBottom: '20px' }}>All documents inside will also be deleted.</p>
              <MActions onCancel={closeModal} onConfirm={deleteFolder} confirmLabel="Delete" danger />
            </>}
            {modal === 'newDoc' && <>
              <h2 style={modalTitle}>New document</h2>
              <MInput label="Title" value={inputVal} onChange={setInputVal} placeholder="Untitled" autoFocus />
              {!modalData.folderId && folders.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  <label style={labelSt}>Folder (optional)</label>
                  <select value={folderSelect} onChange={e => setFolderSelect(e.target.value)} style={selectSt}>
                    <option value="">No folder</option>
                    {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </div>
              )}
              <MActions onCancel={closeModal} onConfirm={createDoc} confirmLabel="Create" />
            </>}
            {modal === 'renameDoc' && <>
              <h2 style={modalTitle}>Rename document</h2>
              <MInput label="Title" value={inputVal} onChange={setInputVal} autoFocus />
              <MActions onCancel={closeModal} onConfirm={renameDoc} confirmLabel="Rename" />
            </>}
            {modal === 'deleteDoc' && <>
              <h2 style={modalTitle}>Delete document?</h2>
              <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginBottom: '20px' }}>This cannot be undone.</p>
              <MActions onCancel={closeModal} onConfirm={deleteDoc} confirmLabel="Delete" danger />
            </>}
          </div>
        </div>
      )}
    </div>
  )
}

// ── DRAG & DROP COMPONENTS ─────────────────────────────────────────────

function FolderZone({ folder, children, onDrop, onToggle, onNewDoc, onRename, onDelete }: any) {
  const [over, setOver] = useState(false)
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onDragOver={e => { e.preventDefault(); setOver(true) }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false) }}
      onDrop={e => { e.preventDefault(); setOver(false); const id = e.dataTransfer.getData('docId'); if (id) onDrop(id, folder.id) }}
      style={{ borderRadius: '8px', outline: over ? '2px dashed var(--accent)' : '2px dashed transparent', transition: 'outline 0.1s' }}
    >
      <div
        onClick={onToggle}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px', cursor: 'pointer', borderRadius: '7px', margin: '1px 6px', userSelect: 'none', background: over ? 'var(--accent-light)' : hovered ? 'var(--border)' : 'transparent', transition: 'background 0.1s' }}
      >
        <span style={{ fontSize: '11px', color: 'var(--muted)', transition: 'transform 0.15s', display: 'inline-block', transform: folder.expanded ? 'rotate(90deg)' : 'none', width: '10px' }}>▶</span>
        <span style={{ fontSize: '16px', flexShrink: 0 }}>📁</span>
        <span style={{ flex: 1, fontSize: '13.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{folder.name}</span>
        <span style={{ display: hovered ? 'flex' : 'none', gap: '2px', alignItems: 'center' }} onClick={e => e.stopPropagation()}>
          <ActionBtn onClick={onNewDoc} title="New doc">＋</ActionBtn>
          <ActionBtn onClick={onRename} title="Rename">✎</ActionBtn>
          <ActionBtn onClick={onDelete} title="Delete">✕</ActionBtn>
        </span>
      </div>
      {folder.expanded && <div style={{ paddingLeft: '14px' }}>{children}</div>}
    </div>
  )
}

function RootDropZone({ children, onDrop }: { children: React.ReactNode; onDrop: (id: string) => void }) {
  const [over, setOver] = useState(false)
  return (
    <div
      onDragOver={e => { e.preventDefault(); setOver(true) }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false) }}
      onDrop={e => { e.preventDefault(); setOver(false); const id = e.dataTransfer.getData('docId'); if (id) onDrop(id) }}
      style={{ minHeight: '40px', borderRadius: '8px', margin: '2px 6px', outline: over ? '2px dashed var(--accent)' : '2px dashed transparent', transition: 'outline 0.1s', background: over ? 'var(--accent-light)' : 'transparent' }}
    >
      {over && <div style={{ padding: '4px 10px', fontSize: '11px', color: 'var(--accent)' }}>Drop to move to root</div>}
      {children}
    </div>
  )
}

function DocRow({ doc, active, onClick, onRename, onDelete }: any) {
  const [hovered, setHovered] = useState(false)
  const permIcon = doc.link_permission === 'view' ? '👁' : doc.link_permission === 'edit' ? '✎' : ''
  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.setData('docId', doc.id); e.dataTransfer.effectAllowed = 'move' }}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px', cursor: 'pointer', borderRadius: '7px', margin: '1px 6px', userSelect: 'none', background: active ? 'var(--accent-light)' : hovered ? 'var(--border)' : 'transparent', color: active ? 'var(--accent)' : 'var(--text)', transition: 'background 0.1s' }}
    >
      <span style={{ fontSize: '16px', flexShrink: 0 }}>📄</span>
      <span style={{ flex: 1, fontSize: '13.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.title || 'Untitled'}</span>
      {permIcon && !hovered && <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{permIcon}</span>}
      <span style={{ display: hovered ? 'flex' : 'none', gap: '2px', alignItems: 'center' }} onClick={e => e.stopPropagation()}>
        <ActionBtn onClick={onRename} title="Rename">✎</ActionBtn>
        <ActionBtn onClick={onDelete} title="Delete">✕</ActionBtn>
      </span>
    </div>
  )
}

function ActionBtn({ onClick, title, children }: any) {
  return (
    <button onClick={onClick} title={title}
      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: '2px 5px', borderRadius: '4px', fontSize: '13px', fontFamily: 'var(--font-sans)', lineHeight: 1 }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--muted)' }}>
      {children}
    </button>
  )
}

function SideBtn({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={title}
      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', padding: '5px 8px', borderRadius: '6px', fontSize: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, fontWeight: 500 }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--border)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
      {children}
    </button>
  )
}

function MInput({ label, value, onChange, placeholder, autoFocus }: any) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <label style={labelSt}>{label}</label>
      <input value={value} onChange={(e: any) => onChange(e.target.value)} placeholder={placeholder} autoFocus={autoFocus}
        style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: '8px', fontFamily: 'var(--font-sans)', fontSize: '0.95rem', background: 'var(--bg)', color: 'var(--text)', outline: 'none' }} />
    </div>
  )
}

function MActions({ onCancel, onConfirm, confirmLabel, danger }: any) {
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

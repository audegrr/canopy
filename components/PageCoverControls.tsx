'use client'
/* eslint-disable @next/next/no-img-element -- Repositioning requires the original user-provided image without optimization. */

import { useRef, useState } from 'react'

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

// ── Cover position helpers ────────────────────────────────────────────────────
export type CoverPos = { x: number; y: number; scale: number }
export function parseCoverPos(raw?: string | null): CoverPos {
  try { if (raw) return { x: 50, y: 30, scale: 1, ...JSON.parse(raw) } } catch {}
  return { x: 50, y: 30, scale: 1 }
}

export function CoverReposition({ coverUrl, initialPosition, onSave, onCancel }: {
  coverUrl: string
  initialPosition: CoverPos
  onSave: (pos: CoverPos) => void
  onCancel: () => void
}) {
  const [pos, setPos] = useState<CoverPos>(initialPosition)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const [isDragging, setIsDragging] = useState(false)
  const lastMouse = useRef({ x: 0, y: 0 })

  function onMouseDown(e: React.MouseEvent) {
    dragging.current = true
    setIsDragging(true)
    lastMouse.current = { x: e.clientX, y: e.clientY }
    e.preventDefault()
  }
  function onMouseMove(e: React.MouseEvent) {
    if (!dragging.current || !containerRef.current) return
    const { offsetWidth, offsetHeight } = containerRef.current
    const dx = e.clientX - lastMouse.current.x
    const dy = e.clientY - lastMouse.current.y
    lastMouse.current = { x: e.clientX, y: e.clientY }
    setPos(p => ({
      ...p,
      x: Math.max(0, Math.min(100, p.x - (dx / offsetWidth) * 100 / p.scale)),
      y: Math.max(0, Math.min(100, p.y - (dy / offsetHeight) * 100 / p.scale)),
    }))
  }
  function onMouseUp() { dragging.current = false; setIsDragging(false) }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault()
    setPos(p => ({ ...p, scale: Math.max(1, Math.min(3, p.scale - e.deltaY * 0.002)) }))
  }

  // Touch support
  const lastTouch = useRef<{ x: number; y: number; dist?: number } | null>(null)
  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 1) lastTouch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      lastTouch.current = { x: 0, y: 0, dist: Math.hypot(dx, dy) }
    }
  }
  function onTouchMove(e: React.TouchEvent) {
    if (!containerRef.current || !lastTouch.current) return
    e.preventDefault()
    const { offsetWidth, offsetHeight } = containerRef.current
    if (e.touches.length === 1) {
      const dx = e.touches[0].clientX - lastTouch.current.x
      const dy = e.touches[0].clientY - lastTouch.current.y
      lastTouch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
      setPos(p => ({
        ...p,
        x: Math.max(0, Math.min(100, p.x - (dx / offsetWidth) * 100 / p.scale)),
        y: Math.max(0, Math.min(100, p.y - (dy / offsetHeight) * 100 / p.scale)),
      }))
    } else if (e.touches.length === 2 && lastTouch.current.dist != null) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      const dist = Math.hypot(dx, dy)
      const ratio = dist / lastTouch.current.dist
      lastTouch.current.dist = dist
      setPos(p => ({ ...p, scale: Math.max(1, Math.min(3, p.scale * ratio)) }))
    }
  }

  const btnStyle: React.CSSProperties = { border: 'none', padding: '6px 16px', borderRadius: 6, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-sans)', fontWeight: 500 }

  return (
    <div ref={containerRef}
      style={{ position: 'relative', height: '240px', overflow: 'hidden', background: '#111', cursor: isDragging ? 'grabbing' : 'grab', userSelect: 'none', touchAction: 'none' }}
      onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
      onWheel={onWheel} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={() => { lastTouch.current = null }}>
      <img src={coverUrl} alt="cover" draggable={false}
        style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: `${pos.x}% ${pos.y}%`, transform: `scale(${pos.scale})`, transformOrigin: `${pos.x}% ${pos.y}%`, pointerEvents: 'none', userSelect: 'none' }} />
      {/* Gradient overlay + controls */}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(transparent 55%, rgba(0,0,0,0.55))', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.85)', fontSize: 12, fontFamily: 'var(--font-sans)', textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>
          Drag to reposition · Scroll or pinch to zoom
        </div>
        {/* Zoom slider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, pointerEvents: 'all' }}>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', flexShrink: 0, lineHeight: 1 }}>−</span>
          <input type="range" min={100} max={300} step={1}
            value={Math.round(pos.scale * 100)}
            onChange={e => setPos(p => ({ ...p, scale: Number(e.target.value) / 100 }))}
            style={{ flex: 1, accentColor: '#fff', height: 4, cursor: 'pointer' }} />
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', flexShrink: 0, lineHeight: 1 }}>+</span>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', minWidth: 38, textAlign: 'right' }}>{Math.round(pos.scale * 100)}%</span>
        </div>
        {/* Action buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, pointerEvents: 'all' }}>
          <button onClick={onCancel} style={{ ...btnStyle, background: 'rgba(255,255,255,0.88)', color: '#333' }}>Cancel</button>
          <button onClick={() => onSave(pos)} style={{ ...btnStyle, background: 'var(--accent)', color: '#fff' }}>Save position</button>
        </div>
      </div>
    </div>
  )
}

export function CoverGallery({ onSelect, onUpload, onClose }: { onSelect: (v: string) => void; onUpload: (f: File) => void; onClose: () => void }) {
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

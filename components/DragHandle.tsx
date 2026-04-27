'use client'
import { useState, useEffect, useRef } from 'react'

type Props = { editor: any }

export default function DragHandle({ editor }: Props) {
  const [handleTop, setHandleTop] = useState(0)
  const [visible, setVisible] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [dropLineTop, setDropLineTop] = useState<number | null>(null)

  const hoverIdx = useRef(-1)
  const srcIdx = useRef(-1)
  const dstIdx = useRef(-1)
  const isDragging = useRef(false)
  const hideTimer = useRef<any>(null)
  const editorRef = useRef<any>(null)
  editorRef.current = editor

  function getBlocks() {
    const ed = editorRef.current
    if (!ed) return []
    const blocks: { from: number; to: number; node: any; el: HTMLElement; rect: DOMRect }[] = []
    ed.state.doc.forEach((node: any, offset: number) => {
      const dom = ed.view.nodeDOM(offset) as HTMLElement
      if (dom) blocks.push({ from: offset, to: offset + node.nodeSize, node, el: dom, rect: dom.getBoundingClientRect() })
    })
    return blocks
  }

  function getContainer() {
    const tiptap = document.querySelector('.tiptap') as HTMLElement
    return tiptap?.parentElement as HTMLElement | null
  }

  // Attach all listeners once on mount
  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (isDragging.current) return
      clearTimeout(hideTimer.current)
      const blocks = getBlocks()
      const container = getContainer()
      if (!container) return
      const parentRect = container.getBoundingClientRect()
      let found = -1
      for (let i = 0; i < blocks.length; i++) {
        const r = blocks[i].rect
        if (e.clientY >= r.top - 4 && e.clientY <= r.bottom + 4) { found = i; break }
      }
      if (found >= 0) {
        hoverIdx.current = found
        const r = blocks[found].rect
        setHandleTop(r.top - parentRect.top + r.height / 2 - 10)
        setVisible(true)
      } else {
        hoverIdx.current = -1
        hideTimer.current = setTimeout(() => setVisible(false), 400)
      }
    }

    function onDragOver(e: DragEvent) {
      if (!isDragging.current) return
      e.preventDefault()
      e.dataTransfer!.dropEffect = 'move'
      const blocks = getBlocks()
      const container = getContainer()
      if (!container || blocks.length === 0) return
      const parentRect = container.getBoundingClientRect()
      let idx = blocks.length
      for (let i = 0; i < blocks.length; i++) {
        if (e.clientY < blocks[i].rect.top + blocks[i].rect.height / 2) { idx = i; break }
      }
      dstIdx.current = idx
      const lineTop = idx < blocks.length
        ? blocks[idx].rect.top - parentRect.top - 1
        : blocks[blocks.length - 1].rect.bottom - parentRect.top + 1
      setDropLineTop(lineTop)
    }

    function onDrop(e: DragEvent) {
      if (!isDragging.current) return
      e.preventDefault()
      // actual move happens in onDragEnd
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('dragover', onDragOver)
    document.addEventListener('drop', onDrop)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('dragover', onDragOver)
      document.removeEventListener('drop', onDrop)
      clearTimeout(hideTimer.current)
    }
  }, []) // mount once — uses refs so always fresh

  function onDragStart(e: React.DragEvent) {
    if (hoverIdx.current < 0) return
    srcIdx.current = hoverIdx.current
    dstIdx.current = -1
    isDragging.current = true
    setDragging(true)
    setVisible(false)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(hoverIdx.current))

    // Ghost image
    const ghost = document.createElement('div')
    ghost.style.cssText = 'position:fixed;top:-999px;left:0;padding:8px 12px;background:#fff;border:1px solid #e9e9e7;border-radius:6px;font-size:13px;max-width:300px;font-family:Inter,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,.15);opacity:0.9;'
    const ed = editorRef.current
    if (ed) {
      let txt = ''; let i = 0
      ed.state.doc.forEach((node: any) => { if (i === hoverIdx.current) txt = node.textContent?.slice(0, 80) || '…'; i++ })
      ghost.textContent = txt || '…'
    }
    document.body.appendChild(ghost)
    e.dataTransfer.setDragImage(ghost, 20, 16)
    requestAnimationFrame(() => { if (document.body.contains(ghost)) document.body.removeChild(ghost) })
  }

  function onDragEnd() {
    const src = srcIdx.current
    const dst = dstIdx.current
    const ed = editorRef.current

    // Execute the move
    if (src >= 0 && dst >= 0 && src !== dst && src !== dst - 1 && ed) {
      const positions: { from: number; to: number; node: any }[] = []
      ed.state.doc.forEach((node: any, offset: number) => {
        positions.push({ from: offset, to: offset + node.nodeSize, node })
      })

      if (src < positions.length) {
        const srcPos = positions[src]
        try {
          const tr = ed.state.tr
          // Delete source block first
          tr.delete(srcPos.from, srcPos.to)
          const sizeRemoved = srcPos.to - srcPos.from

          let insertAt: number
          if (dst > src) {
            // Moving down — adjust for the deletion
            const adjDst = Math.min(dst - 1, positions.length - 1)
            insertAt = positions[adjDst].to - sizeRemoved
          } else {
            // Moving up
            insertAt = positions[dst].from
          }
          insertAt = Math.max(0, Math.min(insertAt, tr.doc.content.size))
          tr.insert(insertAt, srcPos.node)
          ed.view.dispatch(tr)
        } catch (err) {
          console.warn('DragHandle drop error:', err)
        }
      }
    }

    isDragging.current = false
    setDragging(false)
    setDropLineTop(null)
    setVisible(false)
    srcIdx.current = -1
    dstIdx.current = -1
  }

  return (
    <>
      <div
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onMouseEnter={() => { clearTimeout(hideTimer.current); setVisible(true) }}
        onMouseLeave={() => {
          if (!isDragging.current) {
            clearTimeout(hideTimer.current)
            hideTimer.current = setTimeout(() => setVisible(false), 400)
          }
        }}
        style={{
          position: 'absolute', left: -26, top: handleTop,
          width: 20, height: 20,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: dragging ? 'grabbing' : 'grab',
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.1s',
          color: 'var(--text-tertiary)', fontSize: 14,
          borderRadius: 3, userSelect: 'none', zIndex: 20,
          pointerEvents: visible ? 'all' : 'none',
        }}
        title="Drag to reorder"
      >⠿</div>

      {/* Blue drop indicator line */}
      {dragging && dropLineTop !== null && (
        <div style={{
          position: 'absolute', left: 0, right: 0, top: dropLineTop,
          height: 2, background: 'var(--accent)', borderRadius: 1,
          zIndex: 30, pointerEvents: 'none',
          boxShadow: '0 0 6px var(--accent)',
        }} />
      )}
    </>
  )
}

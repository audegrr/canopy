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
  const hideTimer = useRef<any>(null)
  const containerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const tiptap = document.querySelector('.tiptap') as HTMLElement
    containerRef.current = tiptap?.parentElement as HTMLElement
    if (!tiptap) return

    function getBlocks() {
      if (!editor) return []
      const blocks: { from: number; to: number; node: any; el: HTMLElement; rect: DOMRect }[] = []
      editor.state.doc.forEach((node: any, offset: number) => {
        const dom = editor.view.nodeDOM(offset) as HTMLElement
        if (dom) blocks.push({ from: offset, to: offset + node.nodeSize, node, el: dom, rect: dom.getBoundingClientRect() })
      })
      return blocks
    }

    function onMouseMove(e: MouseEvent) {
      if (dragging) return
      clearTimeout(hideTimer.current)
      const blocks = getBlocks()
      const parentRect = containerRef.current!.getBoundingClientRect()
      let found = -1
      for (let i = 0; i < blocks.length; i++) {
        const r = blocks[i].rect
        if (e.clientY >= r.top - 2 && e.clientY <= r.bottom + 2) { found = i; break }
      }
      if (found >= 0) {
        hoverIdx.current = found
        const r = blocks[found].rect
        setHandleTop(r.top - parentRect.top + r.height / 2 - 10)
        setVisible(true)
      } else {
        hoverIdx.current = -1
        hideTimer.current = setTimeout(() => setVisible(false), 300)
      }
    }

    tiptap.addEventListener('mousemove', onMouseMove)
    return () => { tiptap.removeEventListener('mousemove', onMouseMove); clearTimeout(hideTimer.current) }
  }, [editor, dragging])

  useEffect(() => {
    if (!dragging) return
    const tiptap = document.querySelector('.tiptap') as HTMLElement
    if (!tiptap) return

    function getBlocks() {
      if (!editor) return []
      const blocks: { from: number; to: number; node: any; rect: DOMRect }[] = []
      editor.state.doc.forEach((node: any, offset: number) => {
        const dom = editor.view.nodeDOM(offset) as HTMLElement
        if (dom) blocks.push({ from: offset, to: offset + node.nodeSize, node, rect: dom.getBoundingClientRect() })
      })
      return blocks
    }

    function onDragOver(e: DragEvent) {
      e.preventDefault()
      e.dataTransfer!.dropEffect = 'move'
      const blocks = getBlocks()
      const parentRect = containerRef.current!.getBoundingClientRect()
      let idx = blocks.length
      for (let i = 0; i < blocks.length; i++) {
        if (e.clientY < blocks[i].rect.top + blocks[i].rect.height / 2) { idx = i; break }
      }
      dstIdx.current = idx
      if (blocks.length > 0) {
        const lineTop = idx < blocks.length
          ? blocks[idx].rect.top - parentRect.top - 1
          : blocks[blocks.length - 1].rect.bottom - parentRect.top + 1
        setDropLineTop(lineTop)
      }
    }

    function onDrop(e: DragEvent) {
      e.preventDefault()
      // Use stored indices from onDragOver
    }

    tiptap.addEventListener('dragover', onDragOver)
    tiptap.addEventListener('drop', onDrop)
    return () => { tiptap.removeEventListener('dragover', onDragOver); tiptap.removeEventListener('drop', onDrop) }
  }, [dragging, editor])

  function onDragStart(e: React.DragEvent) {
    if (hoverIdx.current < 0) return
    srcIdx.current = hoverIdx.current
    dstIdx.current = -1
    setDragging(true)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(hoverIdx.current))

    // Ghost image
    const ghost = document.createElement('div')
    ghost.style.cssText = 'position:fixed;top:-999px;left:0;padding:8px 12px;background:#fff;border:1px solid #e9e9e7;border-radius:6px;font-size:13px;max-width:280px;font-family:Inter,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.1);'
    if (editor) {
      let txt = ''; let i = 0
      editor.state.doc.forEach((node: any) => { if (i === hoverIdx.current) txt = node.textContent?.slice(0, 60) || '…'; i++ })
      ghost.textContent = txt || '…'
    }
    document.body.appendChild(ghost)
    e.dataTransfer.setDragImage(ghost, 14, 14)
    requestAnimationFrame(() => document.body.removeChild(ghost))
  }

  function onDragEnd() {
    const src = srcIdx.current
    const dst = dstIdx.current

    if (src >= 0 && dst >= 0 && src !== dst && src !== dst - 1 && editor) {
      const positions: { from: number; to: number; node: any }[] = []
      editor.state.doc.forEach((node: any, offset: number) => {
        positions.push({ from: offset, to: offset + node.nodeSize, node })
      })

      if (src < positions.length) {
        const srcPos = positions[src]
        try {
          const tr = editor.state.tr
          tr.delete(srcPos.from, srcPos.to)

          // After deletion, recalc destination
          const sizeRemoved = srcPos.to - srcPos.from
          let insertAt: number

          if (dst > src) {
            // Moving down
            const adjDst = Math.min(dst - 1, positions.length - 1)
            if (adjDst < positions.length) {
              insertAt = positions[adjDst].to - sizeRemoved
            } else {
              insertAt = tr.doc.content.size
            }
          } else {
            // Moving up
            insertAt = dst < positions.length ? positions[dst].from : 0
          }

          insertAt = Math.max(0, Math.min(insertAt, tr.doc.content.size))
          tr.insert(insertAt, srcPos.node)
          editor.view.dispatch(tr)
        } catch (err) {
          console.warn('DragHandle drop error:', err)
        }
      }
    }

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
        onMouseLeave={() => { if (!dragging) { clearTimeout(hideTimer.current); hideTimer.current = setTimeout(() => setVisible(false), 300) } }}
        style={{
          position: 'absolute', left: -26, top: handleTop,
          width: 20, height: 20,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: dragging ? 'grabbing' : 'grab',
          opacity: visible && !dragging ? 1 : 0,
          transition: 'opacity 0.1s',
          color: 'var(--text-tertiary)', fontSize: 14,
          borderRadius: 3, userSelect: 'none', zIndex: 20,
          pointerEvents: visible ? 'all' : 'none',
        }}
        title="Drag to reorder"
      >⠿</div>
      {dragging && dropLineTop !== null && (
        <div style={{
          position: 'absolute', left: 0, right: 0, top: dropLineTop,
          height: 2, background: 'var(--accent)', borderRadius: 1,
          zIndex: 30, pointerEvents: 'none',
          boxShadow: '0 0 4px var(--accent)',
        }} />
      )}
    </>
  )
}

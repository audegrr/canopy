'use client'
import { useState, useEffect, useRef } from 'react'

type Props = { editor: any }

export default function DragHandle({ editor }: Props) {
  const [handleTop, setHandleTop] = useState(0)
  const [visible, setVisible] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [dropLine, setDropLine] = useState<number | null>(null)
  const hoverIdx = useRef(-1)
  const dragIdx = useRef(-1)
  const currentDropIdx = useRef(-1)
  const hideTimer = useRef<any>(null)

  // Get all top-level block elements from the editor
  function getBlocks(): { el: HTMLElement; from: number; to: number; node: any }[] {
    if (!editor) return []
    const result: { el: HTMLElement; from: number; to: number; node: any }[] = []
    editor.state.doc.forEach((node: any, offset: number) => {
      const dom = editor.view.nodeDOM(offset) as HTMLElement
      if (dom) result.push({ el: dom, from: offset, to: offset + node.nodeSize, node })
    })
    return result
  }

  useEffect(() => {
    const tiptap = document.querySelector('.tiptap') as HTMLElement
    if (!tiptap) return

    function onMouseMove(e: MouseEvent) {
      if (dragging) return
      clearTimeout(hideTimer.current)
      const blocks = getBlocks()
      const parent = tiptap.parentElement!
      const parentRect = parent.getBoundingClientRect()
      let found = -1
      for (let i = 0; i < blocks.length; i++) {
        const r = blocks[i].el.getBoundingClientRect()
        if (e.clientY >= r.top - 2 && e.clientY <= r.bottom + 2) { found = i; break }
      }
      if (found >= 0) {
        hoverIdx.current = found
        const r = blocks[found].el.getBoundingClientRect()
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

  function onDragStart(e: React.DragEvent) {
    if (hoverIdx.current < 0) return
    dragIdx.current = hoverIdx.current
    setDragging(true)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(hoverIdx.current))
    const ghost = document.createElement('div')
    ghost.style.cssText = 'position:fixed;top:-999px;padding:6px 12px;background:white;border:1px solid #e9e9e7;border-radius:6px;font-size:13px;max-width:260px;font-family:Inter,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.1);'
    const blocks = getBlocks()
    ghost.textContent = blocks[hoverIdx.current]?.el.textContent?.slice(0, 50) || '…'
    document.body.appendChild(ghost)
    e.dataTransfer.setDragImage(ghost, 14, 14)
    requestAnimationFrame(() => document.body.removeChild(ghost))
  }

  function onDragEnd() {
    // Execute the drop using stored indices
    const src = dragIdx.current
    const dst = currentDropIdx.current

    if (src >= 0 && dst >= 0 && src !== dst && src !== dst - 1 && editor) {
      const blocks = getBlocks()
      if (src < blocks.length) {
        const srcBlock = blocks[src]
        try {
          const tr = editor.state.tr
          // Delete source block
          tr.delete(srcBlock.from, srcBlock.to)
          // Recalculate destination
          const sizeRemoved = srcBlock.to - srcBlock.from
          let insertAt: number
          if (dst > src) {
            const adjDst = dst - 1
            if (adjDst < blocks.length) {
              insertAt = blocks[adjDst].to - sizeRemoved
            } else {
              insertAt = tr.doc.content.size
            }
          } else {
            insertAt = dst < blocks.length ? blocks[dst].from : 0
          }
          insertAt = Math.max(0, Math.min(insertAt, tr.doc.content.size))
          tr.insert(insertAt, srcBlock.node)
          editor.view.dispatch(tr)
        } catch (err) {
          console.warn('Block drag error:', err)
        }
      }
    }

    setDragging(false)
    setDropLine(null)
    setVisible(false)
    dragIdx.current = -1
    currentDropIdx.current = -1
  }

  useEffect(() => {
    if (!dragging) return
    const tiptap = document.querySelector('.tiptap') as HTMLElement
    const parent = tiptap?.parentElement
    if (!tiptap || !parent) return

    function onDragOver(e: DragEvent) {
      e.preventDefault()
      e.dataTransfer!.dropEffect = 'move'
      const blocks = getBlocks()
      const parentRect = parent!.getBoundingClientRect()
      let dropIdx = blocks.length
      for (let i = 0; i < blocks.length; i++) {
        const r = blocks[i].el.getBoundingClientRect()
        if (e.clientY < r.top + r.height / 2) { dropIdx = i; break }
      }
      currentDropIdx.current = dropIdx
      if (dropIdx === 0 && blocks.length > 0) {
        setDropLine(blocks[0].el.getBoundingClientRect().top - parentRect.top - 2)
      } else if (dropIdx >= blocks.length && blocks.length > 0) {
        const last = blocks[blocks.length - 1].el.getBoundingClientRect()
        setDropLine(last.bottom - parentRect.top + 2)
      } else if (blocks[dropIdx]) {
        setDropLine(blocks[dropIdx].el.getBoundingClientRect().top - parentRect.top - 2)
      }
    }

    // Use ondrop to capture the drop event
    function onDrop(e: DragEvent) {
      e.preventDefault()
      // onDragEnd will handle the actual move
    }

    tiptap.addEventListener('dragover', onDragOver)
    tiptap.addEventListener('drop', onDrop)
    return () => { tiptap.removeEventListener('dragover', onDragOver); tiptap.removeEventListener('drop', onDrop) }
  }, [dragging, editor])

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
      {dragging && dropLine !== null && (
        <div style={{
          position: 'absolute', left: 0, right: 0, top: dropLine,
          height: 2, background: 'var(--accent)', borderRadius: 1,
          zIndex: 30, pointerEvents: 'none', boxShadow: '0 0 4px var(--accent)'
        }} />
      )}
    </>
  )
}

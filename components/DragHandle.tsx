'use client'
import { useState, useEffect, useRef } from 'react'

type Props = { editor: any }

export default function DragHandle({ editor }: Props) {
  const [handleTop, setHandleTop] = useState(0)
  const [visible, setVisible] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [dropLine, setDropLine] = useState<number | null>(null)
  const hoverIdx = useRef<number>(-1)
  const dragIdx = useRef<number>(-1)
  const dropIdx = useRef<number>(-1)
  const hideTimer = useRef<any>(null)

  useEffect(() => {
    const tiptap = document.querySelector('.tiptap') as HTMLElement
    if (!tiptap) return

    function getBlockEls(): HTMLElement[] {
      if (!editor) return []
      const els: HTMLElement[] = []
      editor.state.doc.forEach((_: any, offset: number) => {
        const dom = editor.view.nodeDOM(offset) as HTMLElement
        if (dom) els.push(dom)
      })
      return els
    }

    function onMouseMove(e: MouseEvent) {
      if (dragging) return
      clearTimeout(hideTimer.current)
      const els = getBlockEls()
      const parent = tiptap.parentElement!
      const parentRect = parent.getBoundingClientRect()
      let found = -1
      for (let i = 0; i < els.length; i++) {
        const r = els[i].getBoundingClientRect()
        if (e.clientY >= r.top - 2 && e.clientY <= r.bottom + 2) { found = i; break }
      }
      if (found >= 0) {
        hoverIdx.current = found
        const r = els[found].getBoundingClientRect()
        setHandleTop(r.top - parentRect.top + r.height / 2 - 10)
        setVisible(true)
      } else {
        hideTimer.current = setTimeout(() => setVisible(false), 400)
      }
    }

    tiptap.addEventListener('mousemove', onMouseMove)
    return () => tiptap.removeEventListener('mousemove', onMouseMove)
  }, [editor, dragging])

  useEffect(() => {
    if (!dragging || !editor) return
    const tiptap = document.querySelector('.tiptap') as HTMLElement
    const parent = tiptap?.parentElement
    if (!tiptap || !parent) return

    function getBlockEls(): { el: HTMLElement; rect: DOMRect }[] {
      const result: { el: HTMLElement; rect: DOMRect }[] = []
      editor.state.doc.forEach((_: any, offset: number) => {
        const dom = editor.view.nodeDOM(offset) as HTMLElement
        if (dom && typeof dom.getBoundingClientRect === 'function') result.push({ el: dom, rect: dom.getBoundingClientRect() })
      })
      return result
    }

    function onDragOver(e: DragEvent) {
      e.preventDefault()
      e.dataTransfer!.dropEffect = 'move'
      const els = getBlockEls()
      const parentRect = parent!.getBoundingClientRect()
      let idx = els.length
      for (let i = 0; i < els.length; i++) {
        if (e.clientY < els[i].rect.top + els[i].rect.height / 2) { idx = i; break }
      }
      dropIdx.current = idx
      // Set drop line position
      if (idx < els.length) {
        setDropLine(els[idx].rect.top - parentRect.top - 1)
      } else if (els.length > 0) {
        const last = els[els.length - 1]
        setDropLine(last.rect.bottom - parentRect.top + 1)
      }
    }

    function onDrop(e: DragEvent) {
      e.preventDefault()
      const src = dragIdx.current
      const dst = dropIdx.current
      if (src < 0 || dst < 0 || !editor) return

      // Get all node positions
      const positions: { from: number; size: number; node: any }[] = []
      editor.state.doc.forEach((node: any, offset: number) => {
        positions.push({ from: offset, size: node.nodeSize, node })
      })

      if (src >= positions.length) return
      if (src === dst || src === dst - 1) {
        setDragging(false); setDropLine(null); dragIdx.current = -1; return
      }

      const srcPos = positions[src]
      try {
        const tr = editor.state.tr
        tr.delete(srcPos.from, srcPos.from + srcPos.size)

        // Recalculate positions after deletion
        const newPositions: { from: number; size: number }[] = []
        let pos = 0
        editor.state.doc.forEach((node: any, offset: number) => {
          newPositions.push({ from: offset, size: node.nodeSize })
          pos = offset + node.nodeSize
        })

        let insertAt: number
        if (dst === 0) {
          insertAt = 0
        } else if (dst > src) {
          const adjDst = Math.min(dst - 1, newPositions.length - 1)
          insertAt = adjDst >= 0 ? newPositions[adjDst].from + newPositions[adjDst].size : tr.doc.content.size
        } else {
          insertAt = dst < newPositions.length ? newPositions[dst].from : tr.doc.content.size
        }

        insertAt = Math.max(0, Math.min(insertAt, tr.doc.content.size))
        tr.insert(insertAt, srcPos.node)
        editor.view.dispatch(tr)
      } catch (err) {
        console.warn('Drag drop error:', err)
      }

      setDragging(false); setDropLine(null); setVisible(false)
      dragIdx.current = -1; dropIdx.current = -1
    }

    tiptap.addEventListener('dragover', onDragOver)
    tiptap.addEventListener('drop', onDrop)
    return () => {
      tiptap.removeEventListener('dragover', onDragOver)
      tiptap.removeEventListener('drop', onDrop)
    }
  }, [dragging, editor])

  function onDragStart(e: React.DragEvent) {
    dragIdx.current = hoverIdx.current
    setDragging(true)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(hoverIdx.current))
    // Ghost image
    const ghost = document.createElement('div')
    ghost.style.cssText = 'position:fixed;top:-999px;padding:6px 12px;background:#fff;border:1px solid #e9e9e7;border-radius:6px;font-size:13px;max-width:260px;font-family:Inter,sans-serif;'
    if (editor) {
      let txt = ''; let i = 0
      editor.state.doc.forEach((node: any) => { if (i === hoverIdx.current) txt = node.textContent?.slice(0, 50) || '…'; i++ })
      ghost.textContent = txt || '…'
    }
    document.body.appendChild(ghost)
    e.dataTransfer.setDragImage(ghost, 10, 10)
    requestAnimationFrame(() => document.body.removeChild(ghost))
  }

  function onDragEnd() { setDragging(false); setDropLine(null); setVisible(false); dragIdx.current = -1 }

  return (
    <>
      <div
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onMouseEnter={() => { clearTimeout(hideTimer.current); setVisible(true) }}
        onMouseLeave={() => { if (!dragging) { clearTimeout(hideTimer.current); hideTimer.current = setTimeout(() => setVisible(false), 400) } }}
        style={{
          position: 'absolute', left: -26, top: handleTop,
          width: 20, height: 20,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: dragging ? 'grabbing' : 'grab',
          opacity: visible && !dragging ? 1 : 0,
          transition: 'opacity 0.15s',
          color: 'var(--text-tertiary)', fontSize: 14,
          borderRadius: 3, userSelect: 'none', zIndex: 20,
          pointerEvents: visible ? 'all' : 'none',
        }}
        title="Drag to reorder"
      >⠿</div>
      {dragging && dropLine !== null && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: dropLine, height: 2, background: 'var(--accent)', borderRadius: 1, zIndex: 30, pointerEvents: 'none', boxShadow: '0 0 6px var(--accent)' }} />
      )}
    </>
  )
}

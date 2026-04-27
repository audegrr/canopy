'use client'
import { useState, useEffect, useRef } from 'react'

type Props = { editor: any }

export default function DragHandle({ editor }: Props) {
  const [handleTop, setHandleTop] = useState(0)
  const [visible, setVisible] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [dropLineTop, setDropLineTop] = useState<number | null>(null)

  const state = useRef({
    hoverIdx: -1,
    srcIdx: -1,
    dstIdx: -1,
    dragging: false,
    hideTimer: null as any,
  })

  // Re-attach listeners whenever editor changes
  useEffect(() => {
    if (!editor) return
    const tiptap = document.querySelector('.tiptap') as HTMLElement
    if (!tiptap) return
    const container = tiptap.parentElement as HTMLElement

    function getBlocks() {
      const blocks: { from: number; to: number; node: any; rect: DOMRect }[] = []
      editor.state.doc.forEach((node: any, offset: number) => {
        const dom = editor.view.nodeDOM(offset) as HTMLElement
        if (dom) {
          blocks.push({ from: offset, to: offset + node.nodeSize, node, rect: dom.getBoundingClientRect() })
        }
      })
      return blocks
    }

    function onMouseMove(e: MouseEvent) {
      if (state.current.dragging) return
      clearTimeout(state.current.hideTimer)
      const blocks = getBlocks()
      const pr = container.getBoundingClientRect()
      let found = -1
      for (let i = 0; i < blocks.length; i++) {
        const r = blocks[i].rect
        if (e.clientY >= r.top - 4 && e.clientY <= r.bottom + 4) { found = i; break }
      }
      if (found >= 0) {
        state.current.hoverIdx = found
        const r = blocks[found].rect
        setHandleTop(r.top - pr.top + r.height / 2 - 10)
        setVisible(true)
      } else {
        state.current.hoverIdx = -1
        state.current.hideTimer = setTimeout(() => setVisible(false), 400)
      }
    }

    function onDragOver(e: DragEvent) {
      if (!state.current.dragging) return
      e.preventDefault()
      e.dataTransfer!.dropEffect = 'move'
      const blocks = getBlocks()
      if (!blocks.length) return
      const pr = container.getBoundingClientRect()
      let idx = blocks.length
      for (let i = 0; i < blocks.length; i++) {
        if (e.clientY < blocks[i].rect.top + blocks[i].rect.height / 2) { idx = i; break }
      }
      state.current.dstIdx = idx
      const lineTop = idx < blocks.length
        ? blocks[idx].rect.top - pr.top - 1
        : blocks[blocks.length - 1].rect.bottom - pr.top + 1
      setDropLineTop(lineTop)
    }

    tiptap.addEventListener('mousemove', onMouseMove)
    tiptap.addEventListener('dragover', onDragOver)
    // dragover on parent too in case cursor is outside tiptap bounds
    container.addEventListener('dragover', onDragOver)

    return () => {
      tiptap.removeEventListener('mousemove', onMouseMove)
      tiptap.removeEventListener('dragover', onDragOver)
      container.removeEventListener('dragover', onDragOver)
      clearTimeout(state.current.hideTimer)
    }
  }, [editor])

  function onDragStart(e: React.DragEvent) {
    if (state.current.hoverIdx < 0 || !editor) return
    state.current.srcIdx = state.current.hoverIdx
    state.current.dstIdx = -1
    state.current.dragging = true
    setDragging(true)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('application/canopy-block', String(state.current.srcIdx))

    // Ghost
    const ghost = document.createElement('div')
    ghost.style.cssText = 'position:fixed;top:-999px;padding:8px 14px;background:#fff;border:1px solid #e9e9e7;border-radius:8px;font-size:13px;max-width:300px;font-family:Inter,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.12);'
    let txt = ''; let i = 0
    editor.state.doc.forEach((node: any) => {
      if (i === state.current.srcIdx) txt = node.textContent?.slice(0, 80) || '…'
      i++
    })
    ghost.textContent = txt || '…'
    document.body.appendChild(ghost)
    e.dataTransfer.setDragImage(ghost, 20, 16)
    requestAnimationFrame(() => { if (document.body.contains(ghost)) document.body.removeChild(ghost) })
  }

  function onDragEnd() {
    const src = state.current.srcIdx
    const dst = state.current.dstIdx

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
          const removed = srcPos.to - srcPos.from
          let insertAt: number
          if (dst > src) {
            insertAt = positions[Math.min(dst - 1, positions.length - 1)].to - removed
          } else {
            insertAt = positions[dst].from
          }
          insertAt = Math.max(0, Math.min(insertAt, tr.doc.content.size))
          tr.insert(insertAt, srcPos.node)
          editor.view.dispatch(tr)
        } catch (err) {
          console.warn('DragHandle error:', err)
        }
      }
    }

    state.current.dragging = false
    state.current.srcIdx = -1
    state.current.dstIdx = -1
    setDragging(false)
    setDropLineTop(null)
    setVisible(false)
  }

  if (!editor) return null

  return (
    <>
      <div
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onMouseEnter={() => { clearTimeout(state.current.hideTimer); setVisible(true) }}
        onMouseLeave={() => {
          if (!state.current.dragging) {
            state.current.hideTimer = setTimeout(() => setVisible(false), 400)
          }
        }}
        style={{
          position: 'absolute', left: -26, top: handleTop,
          width: 20, height: 20,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: dragging ? 'grabbing' : 'grab',
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.15s',
          color: 'var(--text-tertiary)', fontSize: 14,
          borderRadius: 3, userSelect: 'none', zIndex: 20,
          pointerEvents: visible ? 'all' : 'none',
        }}
      >⠿</div>

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

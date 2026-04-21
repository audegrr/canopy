'use client'
import { useState, useEffect, useRef } from 'react'

type Props = {
  editor: any
}

export default function DragHandle({ editor }: Props) {
  const [visible, setVisible] = useState(false)
  const [top, setTop] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [dropLineTop, setDropLineTop] = useState<number | null>(null)
  const srcIndexRef = useRef<number | null>(null)
  const hoverIndexRef = useRef<number | null>(null)
  const handleRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const leaveTimer = useRef<any>(null)

  useEffect(() => {
    const el = document.querySelector('.tiptap') as HTMLDivElement
    if (!el) return
    // The container is the relative-positioned parent of .tiptap
    containerRef.current = el.parentElement as HTMLDivElement

    function getBlockRects() {
      if (!editor) return []
      const rects: { top: number; bottom: number; height: number; index: number; domNode: HTMLElement }[] = []
      let i = 0
      editor.state.doc.forEach((_node: any, offset: number) => {
        const dom = editor.view.nodeDOM(offset) as HTMLElement
        if (dom && dom.getBoundingClientRect) {
          const r = dom.getBoundingClientRect()
          rects.push({ top: r.top, bottom: r.bottom, height: r.height, index: i, domNode: dom })
        }
        i++
      })
      return rects
    }

    function onMouseMove(e: MouseEvent) {
      if (isDragging) return
      clearTimeout(leaveTimer.current)

      const rects = getBlockRects()
      const container = containerRef.current
      if (!container) return
      const containerRect = container.getBoundingClientRect()

      let found = -1
      for (let i = 0; i < rects.length; i++) {
        if (e.clientY >= rects[i].top - 4 && e.clientY <= rects[i].bottom + 4) {
          found = i; break
        }
      }

      if (found >= 0) {
        hoverIndexRef.current = found
        const r = rects[found]
        setTop(r.top - containerRect.top + r.height / 2 - 10)
        setVisible(true)
      } else {
        hoverIndexRef.current = null
        leaveTimer.current = setTimeout(() => setVisible(false), 300)
      }
    }

    el.addEventListener('mousemove', onMouseMove)
    return () => {
      el.removeEventListener('mousemove', onMouseMove)
      clearTimeout(leaveTimer.current)
    }
  }, [editor, isDragging])

  function onDragStart(e: React.DragEvent) {
    if (hoverIndexRef.current === null) return
    srcIndexRef.current = hoverIndexRef.current
    setIsDragging(true)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('blockIndex', String(hoverIndexRef.current))

    // Create ghost
    const ghost = document.createElement('div')
    ghost.style.cssText = 'position:fixed;top:-999px;left:0;padding:8px 12px;background:white;border:1px solid #e9e9e7;border-radius:6px;font-size:13px;max-width:280px;'
    if (editor) {
      let text = ''
      let idx = 0
      editor.state.doc.forEach((node: any, _: number) => {
        if (idx === hoverIndexRef.current) text = node.textContent?.slice(0, 50) || '…'
        idx++
      })
      ghost.textContent = text || '…'
    }
    document.body.appendChild(ghost)
    e.dataTransfer.setDragImage(ghost, 10, 10)
    requestAnimationFrame(() => document.body.removeChild(ghost))
  }

  function onDragEnd() {
    setIsDragging(false)
    setDropLineTop(null)
    setVisible(false)
    srcIndexRef.current = null
  }

  useEffect(() => {
    if (!isDragging || !editor) return
    const el = document.querySelector('.tiptap') as HTMLElement
    const container = containerRef.current
    if (!el || !container) return

    function getPositions() {
      const positions: { from: number; to: number; node: any; rect: DOMRect }[] = []
      editor.state.doc.forEach((node: any, offset: number) => {
        const dom = editor.view.nodeDOM(offset) as HTMLElement
        if (dom) positions.push({ from: offset, to: offset + node.nodeSize, node, rect: dom.getBoundingClientRect() })
      })
      return positions
    }

    function onDragOver(e: DragEvent) {
      e.preventDefault()
      e.dataTransfer!.dropEffect = 'move'
      const positions = getPositions()
      const containerRect = container!.getBoundingClientRect()
      let dropIdx = positions.length
      for (let i = 0; i < positions.length; i++) {
        const midY = positions[i].rect.top + positions[i].rect.height / 2
        if (e.clientY < midY) { dropIdx = i; break }
      }
      // Show drop line
      if (dropIdx === 0 && positions.length > 0) {
        setDropLineTop(positions[0].rect.top - containerRect.top - 2)
      } else if (dropIdx >= positions.length && positions.length > 0) {
        const last = positions[positions.length - 1]
        setDropLineTop(last.rect.bottom - containerRect.top + 2)
      } else if (positions[dropIdx]) {
        setDropLineTop(positions[dropIdx].rect.top - containerRect.top - 2)
      }
      hoverIndexRef.current = dropIdx
    }

    function onDrop(e: DragEvent) {
      e.preventDefault()
      const src = srcIndexRef.current
      const dest = hoverIndexRef.current
      if (src === null || dest === null || !editor) return

      const positions = getPositions()
      if (src >= positions.length) return

      const srcPos = positions[src]
      const srcNode = srcPos.node

      try {
        const tr = editor.state.tr
        // Delete source
        tr.delete(srcPos.from, srcPos.to)
        // Recalculate destination after deletion
        let insertAt: number
        if (dest <= src) {
          // Moving up
          insertAt = dest < positions.length ? positions[dest].from : 0
        } else {
          // Moving down — account for deleted node
          const adjustedIdx = dest - 1
          if (adjustedIdx < positions.length) {
            insertAt = positions[adjustedIdx].to - srcNode.nodeSize
          } else {
            insertAt = editor.state.doc.content.size - srcNode.nodeSize
          }
        }
        tr.insert(Math.max(0, Math.min(insertAt, editor.state.doc.content.size - srcNode.nodeSize)), srcNode)
        editor.view.dispatch(tr)
      } catch {}

      setIsDragging(false)
      setDropLineTop(null)
      setVisible(false)
      srcIndexRef.current = null
    }

    el.addEventListener('dragover', onDragOver)
    el.addEventListener('drop', onDrop)
    return () => {
      el.removeEventListener('dragover', onDragOver)
      el.removeEventListener('drop', onDrop)
    }
  }, [isDragging, editor])

  return (
    <>
      <div
        ref={handleRef}
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onMouseEnter={() => clearTimeout(leaveTimer.current)}
        onMouseLeave={() => { leaveTimer.current = setTimeout(() => setVisible(false), 400) }}
        style={{
          position: 'absolute',
          top,
          left: -26,
          width: '20px',
          height: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: isDragging ? 'grabbing' : 'grab',
          opacity: visible && !isDragging ? 1 : 0,
          transition: 'opacity 0.15s',
          borderRadius: '3px',
          color: 'var(--text-tertiary)',
          fontSize: '14px',
          userSelect: 'none',
          zIndex: 20,
          pointerEvents: visible ? 'all' : 'none',
        }}
      >
        ⠿
      </div>

      {/* Drop indicator line */}
      {isDragging && dropLineTop !== null && (
        <div style={{
          position: 'absolute',
          left: 0, right: 0,
          top: dropLineTop,
          height: '2px',
          background: 'var(--accent)',
          borderRadius: '1px',
          zIndex: 30,
          pointerEvents: 'none',
          boxShadow: '0 0 4px var(--accent)',
        }} />
      )}
    </>
  )
}

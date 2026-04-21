'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Editor } from '@tiptap/core'

type Props = {
  editor: Editor | null
}

type BlockInfo = {
  el: HTMLElement
  top: number
  height: number
  pos: number
}

export default function DragHandle({ editor }: Props) {
  const [handlePos, setHandlePos] = useState<{ top: number; left: number } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [blocks, setBlocks] = useState<BlockInfo[]>([])
  const dragSourceIndex = useRef<number | null>(null)
  const handleRef = useRef<HTMLDivElement>(null)
  const editorContainerRef = useRef<HTMLElement | null>(null)
  const hoverBlockIndex = useRef<number | null>(null)

  useEffect(() => {
    if (!editor) return
    const el = document.querySelector('.tiptap') as HTMLElement
    editorContainerRef.current = el
    if (!el) return

    function getBlocks(): BlockInfo[] {
      if (!editor) return []
      const result: BlockInfo[] = []
      const editorEl = document.querySelector('.tiptap')
      if (!editorEl) return []

      editor.state.doc.forEach((node, offset) => {
        const domNode = editor.view.nodeDOM(offset) as HTMLElement
        if (!domNode) return
        const rect = domNode.getBoundingClientRect()
        result.push({ el: domNode, top: rect.top, height: rect.height, pos: offset })
      })
      return result
    }

    function onMouseMove(e: MouseEvent) {
      if (isDragging) return
      const bks = getBlocks()
      setBlocks(bks)

      let found: BlockInfo | null = null
      let foundIdx = -1
      for (let i = 0; i < bks.length; i++) {
        const b = bks[i]
        if (e.clientY >= b.top && e.clientY <= b.top + b.height) {
          found = b
          foundIdx = i
          break
        }
      }

      if (found) {
        const editorRect = editorContainerRef.current!.getBoundingClientRect()
        hoverBlockIndex.current = foundIdx
        setHandlePos({
          top: found.top - editorRect.top + (found.height / 2) - 10,
          left: -28,
        })
      } else {
        hoverBlockIndex.current = null
        setHandlePos(null)
      }
    }

    function onMouseLeave() {
      if (!isDragging) setHandlePos(null)
    }

    el.addEventListener('mousemove', onMouseMove)
    el.addEventListener('mouseleave', onMouseLeave)
    return () => {
      el.removeEventListener('mousemove', onMouseMove)
      el.removeEventListener('mouseleave', onMouseLeave)
    }
  }, [editor, isDragging])

  function onDragStart(e: React.DragEvent) {
    if (hoverBlockIndex.current === null || !editor) return
    dragSourceIndex.current = hoverBlockIndex.current
    setIsDragging(true)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(hoverBlockIndex.current))

    // Ghost image
    const ghost = document.createElement('div')
    ghost.style.cssText = 'position:fixed;top:-1000px;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 12px;font-size:13px;color:var(--text);max-width:300px;opacity:0.9;'
    const bks = blocks.length > 0 ? blocks : (() => {
      const result: BlockInfo[] = []
      editor.state.doc.forEach((node, offset) => {
        const domNode = editor.view.nodeDOM(offset) as HTMLElement
        if (!domNode) return
        const rect = domNode.getBoundingClientRect()
        result.push({ el: domNode, top: rect.top, height: rect.height, pos: offset })
      })
      return result
    })()
    const srcBlock = bks[hoverBlockIndex.current]
    if (srcBlock) ghost.textContent = srcBlock.el.textContent?.slice(0, 60) || '...'
    document.body.appendChild(ghost)
    e.dataTransfer.setDragImage(ghost, 0, 0)
    setTimeout(() => document.body.removeChild(ghost), 0)
  }

  function onDragEnd() {
    setIsDragging(false)
    setDragOverIndex(null)
    dragSourceIndex.current = null
  }

  // Track drag over on editor
  useEffect(() => {
    if (!isDragging || !editor) return

    const el = document.querySelector('.tiptap') as HTMLElement
    if (!el) return

    function onDragOver(e: DragEvent) {
      e.preventDefault()
      e.dataTransfer!.dropEffect = 'move'

      const bks: BlockInfo[] = []
      editor!.state.doc.forEach((node, offset) => {
        const domNode = editor!.view.nodeDOM(offset) as HTMLElement
        if (!domNode) return
        const rect = domNode.getBoundingClientRect()
        bks.push({ el: domNode, top: rect.top, height: rect.height, pos: offset })
      })

      let idx = bks.length
      for (let i = 0; i < bks.length; i++) {
        if (e.clientY < bks[i].top + bks[i].height / 2) { idx = i; break }
      }
      setDragOverIndex(idx)
    }

    function onDrop(e: DragEvent) {
      e.preventDefault()
      if (dragSourceIndex.current === null || !editor) return

      const src = dragSourceIndex.current
      const dest = dragOverIndex ?? 0
      if (src === dest || src === dest - 1) return

      // Get node positions
      const positions: { from: number; to: number; node: any }[] = []
      editor.state.doc.forEach((node, offset) => {
        positions.push({ from: offset, to: offset + node.nodeSize, node })
      })

      if (src >= positions.length || dest > positions.length) return

      const srcPos = positions[src]
      const tr = editor.state.tr

      // Cut the source node
      const srcNode = srcPos.node
      const srcFrom = srcPos.from
      const srcTo = srcPos.to

      // Compute destination after deletion
      let destPos: number
      if (dest > src) {
        const afterDel = dest - 1
        destPos = afterDel < positions.length ? positions[afterDel].to - srcNode.nodeSize : editor.state.doc.content.size - srcNode.nodeSize
      } else {
        destPos = dest < positions.length ? positions[dest].from : editor.state.doc.content.size
      }

      try {
        tr.delete(srcFrom, srcTo)
        const insertPos = dest > src ? destPos : destPos
        tr.insert(dest > src ? insertPos : insertPos, srcNode)
        editor.view.dispatch(tr)
      } catch (err) {
        // If transaction fails, ignore
      }

      setIsDragging(false)
      setDragOverIndex(null)
      dragSourceIndex.current = null
    }

    el.addEventListener('dragover', onDragOver)
    el.addEventListener('drop', onDrop)
    return () => {
      el.removeEventListener('dragover', onDragOver)
      el.removeEventListener('drop', onDrop)
    }
  }, [isDragging, dragOverIndex, editor])

  if (!handlePos) return null

  return (
    <>
      {/* Drag handle */}
      <div
        ref={handleRef}
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        style={{
          position: 'absolute',
          top: handlePos.top,
          left: handlePos.left,
          width: '20px',
          height: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: isDragging ? 'grabbing' : 'grab',
          color: 'var(--text-tertiary)',
          borderRadius: '3px',
          fontSize: '13px',
          userSelect: 'none',
          opacity: isDragging ? 0 : 1,
          transition: 'opacity 0.1s',
          zIndex: 10,
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; (e.currentTarget as HTMLElement).style.color = 'var(--text-tertiary)' }}
        title="Drag to reorder"
      >
        ⠿
      </div>

      {/* Drop indicator */}
      {isDragging && dragOverIndex !== null && (
        <DropIndicator blocks={blocks} index={dragOverIndex} />
      )}
    </>
  )
}

function DropIndicator({ blocks, index }: { blocks: BlockInfo[]; index: number }) {
  const editorEl = document.querySelector('.tiptap')
  if (!editorEl) return null
  const editorRect = editorEl.getBoundingClientRect()

  let top: number
  if (index === 0 && blocks.length > 0) {
    top = blocks[0].top - editorRect.top - 2
  } else if (index >= blocks.length && blocks.length > 0) {
    const last = blocks[blocks.length - 1]
    top = last.top - editorRect.top + last.height + 2
  } else if (blocks[index]) {
    top = blocks[index].top - editorRect.top - 2
  } else {
    return null
  }

  return (
    <div style={{
      position: 'absolute',
      left: 0, right: 0,
      top,
      height: '2px',
      background: 'var(--accent)',
      borderRadius: '1px',
      zIndex: 20,
      pointerEvents: 'none',
    }} />
  )
}

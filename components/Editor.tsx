'use client'
import { useRef, useState, useEffect } from 'react'
import { useEditor, EditorContent, BubbleMenu, NodeViewWrapper, NodeViewContent, ReactNodeViewRenderer } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Typography from '@tiptap/extension-typography'
import { Color } from '@tiptap/extension-color'
import TextStyle from '@tiptap/extension-text-style'
import Highlight from '@tiptap/extension-highlight'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import Image from '@tiptap/extension-image'
import { Node, mergeAttributes } from '@tiptap/core'
import { createClient } from '@/lib/supabase/client'

// ── Video node ─────────────────────────────────────────
const VideoNode = Node.create({
  name: 'video', group: 'block', atom: true,
  addAttributes() { return { src: {}, width: { default: '100%' } } },
  parseHTML() { return [{ tag: 'div[data-video]' }] },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-video': '' })] },
  addNodeView() {
    return ({ node }: any) => {
      const dom = document.createElement('div')
      dom.style.cssText = 'margin: 8px 0; border-radius: 8px; overflow: hidden;'
      // Try to embed as video — works for direct video URLs
      const isYt = /youtube|youtu\.be/.test(node.attrs.src)
      if (isYt) {
        const iframe = document.createElement('iframe')
        const ytId = node.attrs.src.match(/(?:v=|youtu\.be\/)([^&?/]+)/)?.[1]
        iframe.src = `https://www.youtube.com/embed/${ytId}`
        iframe.style.cssText = 'width:100%;aspect-ratio:16/9;border:none;border-radius:8px;'
        iframe.allowFullscreen = true
        dom.appendChild(iframe)
      } else {
        const video = document.createElement('video')
        video.src = node.attrs.src
        video.controls = true
        video.style.cssText = 'width:100%;border-radius:8px;max-height:400px;'
        dom.appendChild(video)
      }
      return { dom }
    }
  }
})

// ── File attachment node ────────────────────────────────
function formatBytes(bytes: number) {
  if (!bytes) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + ' KB'
  return (bytes/(1024*1024)).toFixed(1) + ' MB'
}

const FileNode = Node.create({
  name: 'fileAttachment', group: 'block', atom: true,
  addAttributes() { return { src: { default: null }, name: { default: 'File' }, size: { default: 0 }, mime: { default: '' } } },
  parseHTML() { return [{ tag: 'div[data-file]' }] },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-file': '' })] },
  addNodeView() {
    return ({ node }: any) => {
      const dom = document.createElement('div')
      dom.style.cssText = 'margin:6px 0;'
      const ext = (node.attrs.name || '').split('.').pop()?.toLowerCase() || ''
      const icon = ['pdf'].includes(ext) ? '📄' : ['doc','docx'].includes(ext) ? '📝' : ['xls','xlsx'].includes(ext) ? '📊' : ['zip','rar'].includes(ext) ? '📦' : ['mp3','wav','ogg'].includes(ext) ? '🎵' : '📎'

      const a = document.createElement('a')
      a.href = node.attrs.src || '#'
      a.target = '_blank'
      a.rel = 'noopener'
      a.style.cssText = 'display:inline-flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid var(--border);border-radius:8px;text-decoration:none;color:var(--text);background:var(--surface);font-family:var(--font-sans);font-size:13px;cursor:pointer;transition:background 0.1s;'
      a.addEventListener('mouseover', () => { a.style.background = 'var(--sidebar-hover)' })
      a.addEventListener('mouseout', () => { a.style.background = 'var(--surface)' })

      const iconSpan = document.createElement('span')
      iconSpan.style.fontSize = '20px'
      iconSpan.textContent = icon
      a.appendChild(iconSpan)

      const nameSpan = document.createElement('span')
      nameSpan.textContent = node.attrs.name || 'File'
      a.appendChild(nameSpan)

      if (node.attrs.size) {
        const sizeSpan = document.createElement('span')
        sizeSpan.style.cssText = 'color:var(--text-tertiary);font-size:12px'
        sizeSpan.textContent = formatBytes(node.attrs.size)
        a.appendChild(sizeSpan)
      }

      const dlSpan = document.createElement('span')
      dlSpan.style.cssText = 'color:var(--accent);font-size:12px'
      dlSpan.textContent = '↓ Download'
      a.appendChild(dlSpan)

      dom.appendChild(a)
      return { dom }
    }
  }
})
import SubpageBlock from './SubpageBlock'
import DatabaseBlock from './DatabaseBlock'
import Link from '@tiptap/extension-link'
import Youtube from '@tiptap/extension-youtube'
import HorizontalRule from '@tiptap/extension-horizontal-rule'
import TextAlign from '@tiptap/extension-text-align'
import Underline from '@tiptap/extension-underline'
import EmojiPicker from './EmojiPicker'

// ── RESIZABLE IMAGE EXTENSION ──────────────────────────────────────────
function ResizableImageView({ node, updateAttributes, selected }: any) {
  const [loaded, setLoaded] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const width = node.attrs.width || '100%'
  const align = node.attrs.align || 'left'

  const alignStyle: React.CSSProperties =
    align === 'center' ? { marginLeft: 'auto', marginRight: 'auto' } :
    align === 'right'  ? { marginLeft: 'auto' } : {}

  function startResize(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startW = containerRef.current?.offsetWidth ?? 400
    const parentW = containerRef.current?.parentElement?.offsetWidth ?? 720

    function onMove(ev: MouseEvent) {
      const delta = ev.clientX - startX
      const newW = Math.max(80, Math.min(parentW, startW + delta))
      const pct = Math.round((newW / parentW) * 100)
      updateAttributes({ width: pct + '%' })
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <NodeViewWrapper style={{ display: 'block', position: 'relative', maxWidth: '100%', lineHeight: 0, margin: '4px 0' }}>
      <div ref={containerRef} style={{ position: 'relative', display: 'block', width, ...alignStyle }}>
        {!loaded && <div style={{ width: '100%', height: '120px', background: 'var(--border)', borderRadius: '6px' }} />}
        <img
          src={node.attrs.src}
          alt={node.attrs.alt || ''}
          onLoad={() => setLoaded(true)}
          style={{ width: '100%', borderRadius: '6px', display: loaded ? 'block' : 'none', userSelect: 'none' }}
          draggable={false}
        />
        <div className="img-resize-handle img-resize-right" onMouseDown={startResize} />
      </div>
    </NodeViewWrapper>
  )
}

const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: { default: '100%', renderHTML: attrs => ({ width: attrs.width }) },
      align: { default: 'left', renderHTML: attrs => ({ 'data-align': attrs.align }) },
    }
  },
  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView)
  },
})

// ── CALLOUT EXTENSION ──────────────────────────────────────────────────
function CalloutView({ node, updateAttributes }: any) {
  const [showPicker, setShowPicker] = useState(false)
  return (
    <NodeViewWrapper>
      <div style={{ background: 'var(--sidebar-bg)', border: '1px solid var(--border)', borderRadius: '6px', padding: '12px 16px', margin: '4px 0', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <span onClick={() => setShowPicker(o => !o)} style={{ fontSize: '20px', cursor: 'pointer', userSelect: 'none', lineHeight: 1.4 }}>
            {node.attrs.emoji || '💡'}
          </span>
          {showPicker && (
            <EmojiPicker
              onSelect={em => { if (em) updateAttributes({ emoji: em }) }}
              onClose={() => setShowPicker(false)}
              style={{ top: '28px', left: 0 }}
            />
          )}
        </div>
        <NodeViewContent style={{ flex: 1, outline: 'none', minHeight: '1.5em' }} />
      </div>
    </NodeViewWrapper>
  )
}

const CalloutExtension = Node.create({
  name: 'callout',
  group: 'block',
  content: 'inline*',
  addAttributes() { return { emoji: { default: '💡' } } },
  parseHTML() { return [{ tag: 'div[data-type="callout"]' }] },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'callout' }), 0] },
  addNodeView() { return ReactNodeViewRenderer(CalloutView) },
})

// ── TABLE OF CONTENTS ──────────────────────────────────────────────────
function TocView({ editor: editorInstance }: any) {
  const [headings, setHeadings] = useState<{ level: number; text: string }[]>([])
  useEffect(() => {
    if (!editorInstance) return
    const update = () => {
      const hs: { level: number; text: string }[] = []
      editorInstance.state.doc.descendants((node: any) => {
        if (node.type.name === 'heading') hs.push({ level: node.attrs.level, text: node.textContent })
      })
      setHeadings(hs)
    }
    update()
    editorInstance.on('update', update)
    return () => editorInstance.off('update', update)
  }, [editorInstance])

  return (
    <NodeViewWrapper>
      <div style={{ background: 'var(--sidebar-bg)', border: '1px solid var(--border)', borderRadius: '6px', padding: '12px 16px', margin: '4px 0' }}>
        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Table of contents</div>
        {headings.length === 0
          ? <div style={{ fontSize: '15px', color: 'var(--text-tertiary)' }}>No headings yet</div>
          : headings.map((h, i) => (
            <div key={i} style={{ fontSize: '15px', color: 'var(--text)', paddingLeft: `${(h.level - 1) * 12}px`, marginBottom: '3px', cursor: 'pointer' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--accent)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text)' }}
              onClick={() => {
                const els = document.querySelectorAll('.tiptap h1, .tiptap h2, .tiptap h3, .tiptap h4')
                for (const el of els) {
                  if ((el.textContent || '').trim() === h.text.trim()) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    break
                  }
                }
              }}>
              {h.text}
            </div>
          ))
        }
      </div>
    </NodeViewWrapper>
  )
}

const TocExtension = Node.create({
  name: 'toc',
  group: 'block',
  atom: true,
  parseHTML() { return [{ tag: 'div[data-type="toc"]' }] },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'toc' })] },
  addNodeView() {
    return ({ editor }: any) => {
      const dom = document.createElement('div')
      const ReactDOM = require('react-dom/client')
      const root = ReactDOM.createRoot(dom)
      root.render(<TocView editor={editor} />)
      return { dom, destroy: () => root.unmount() }
    }
  },
})

// ── SUBPAGE EXTENSION ─────────────────────────────────────────────────
const SubpageExtension = Node.create({
  name: 'subpage',
  group: 'block',
  atom: true,
  addAttributes() {
    return {
      pageId: { default: null },
      expanded: { default: true },
    }
  },
  parseHTML() { return [{ tag: 'div[data-type="subpage"]' }] },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'subpage', 'data-page-id': HTMLAttributes.pageId })]
  },
  addNodeView() {
    return ReactNodeViewRenderer(SubpageBlock)
  },
})

// ── DATABASE BLOCK EXTENSION ──────────────────────────────────────────
const DatabaseBlockExtension = Node.create({
  name: 'databaseBlock',
  group: 'block',
  atom: true,
  addAttributes() {
    return {
      pageId: { default: null },
      view: { default: 'table' },
      collapsed: { default: false },
    }
  },
  parseHTML() { return [{ tag: 'div[data-type="database-block"]' }] },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'database-block' })]
  },
  addNodeView() {
    return ReactNodeViewRenderer(DatabaseBlock)
  },
})

// ── PAGE MENTION NODE ─────────────────────────────────────────────────
function PageMentionView({ node }: any) {
  const [hovered, setHovered] = useState(false)
  const [preview, setPreview] = useState<{ icon: string; title: string; snippet: string } | null>(null)
  const [previewPos, setPreviewPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const ref = useRef<HTMLAnchorElement>(null)

  async function loadPreview() {
    if (preview) return
    try {
      const supabase = createClient()
      const { data } = await supabase.from('pages').select('title, icon, content').eq('id', node.attrs.pageId).single()
      if (!data) return
      const nodes: any[] = Array.isArray(data.content) ? data.content : (data.content?.content || [])
      const words: string[] = []
      function extract(n: any) {
        if (n.text) words.push(n.text)
        if (n.content) n.content.forEach(extract)
      }
      nodes.forEach(extract)
      const snippet = words.join(' ').slice(0, 120).trim()
      setPreview({ icon: data.icon || '📄', title: data.title || 'Untitled', snippet })
    } catch {}
  }

  function handleMouseEnter(e: React.MouseEvent) {
    setHovered(true)
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setPreviewPos({ top: rect.bottom + 6, left: Math.min(rect.left, window.innerWidth - 240) })
    loadPreview()
  }

  return (
    <NodeViewWrapper as="span" style={{ display: 'inline' }}>
      <a ref={ref} href={`/app/page/${node.attrs.pageId}`}
        onClick={e => { e.preventDefault(); window.location.href = `/app/page/${node.attrs.pageId}` }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setHovered(false)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', background: hovered ? 'var(--accent)' : 'var(--accent-light)', color: hovered ? '#fff' : 'var(--accent)', borderRadius: '4px', padding: '1px 7px', fontSize: '0.92em', textDecoration: 'none', cursor: 'pointer', fontWeight: 500, transition: 'background 0.12s,color 0.12s' }}>
        {'@' + (node.attrs.label || 'Page')}
      </a>
      {hovered && preview && typeof window !== 'undefined' && (
        <span style={{ position: 'fixed', top: previewPos.top, left: previewPos.left, zIndex: 9999, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 14px', boxShadow: 'var(--shadow-lg)', width: '220px', pointerEvents: 'none' }}
          className="scale-in">
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
            <span style={{ fontSize: '16px' }}>{preview.icon}</span>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{preview.title}</span>
          </span>
          {preview.snippet && (
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {preview.snippet}
            </span>
          )}
        </span>
      )}
    </NodeViewWrapper>
  )
}

const PageMentionNode = Node.create({
  name: 'pageMention',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes() {
    return {
      pageId: { default: null },
      label: { default: '' },
    }
  },
  parseHTML() { return [{ tag: 'a[data-page-mention]' }] },
  renderHTML({ HTMLAttributes }) {
    return ['a', mergeAttributes(HTMLAttributes, {
      'data-page-mention': HTMLAttributes.pageId,
      href: `/app/page/${HTMLAttributes.pageId}`,
    }), '@' + (HTMLAttributes.label || '')]
  },
  addNodeView() {
    return ReactNodeViewRenderer(PageMentionView)
  },
})

// ── COLUMN LAYOUT NODES ───────────────────────────────────────────────
const ColumnNode = Node.create({
  name: 'column',
  group: 'block',
  content: 'block+',
  parseHTML() { return [{ tag: 'div[data-column]' }] },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-column': '' }), 0]
  },
})

const ColumnsNode = Node.create({
  name: 'columns',
  group: 'block',
  content: 'column+',
  parseHTML() { return [{ tag: 'div[data-columns]' }] },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-columns': '' }), 0]
  },
})

// ── BOOKMARK NODE ──────────────────────────────────────────────────────
function BookmarkView({ node }: any) {
  const { url, title, description, image, favicon, hostname } = node.attrs
  return (
    <NodeViewWrapper>
      <a href={url} target="_blank" rel="noopener noreferrer"
        style={{ display: 'flex', gap: '12px', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', margin: '4px 0', textDecoration: 'none', background: 'var(--surface)', transition: 'border-color 0.15s' }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}>
        <div style={{ flex: 1, padding: '12px 14px', minWidth: 0 }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title || url}</div>
          {description && <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{description}</div>}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            {favicon && <img src={favicon} width={14} height={14} style={{ borderRadius: '2px', flexShrink: 0 }} alt="" />}
            <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{hostname || url}</span>
          </div>
        </div>
        {image && (
          <div style={{ width: '120px', flexShrink: 0, background: 'var(--border)' }}>
            <img src={image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          </div>
        )}
      </a>
    </NodeViewWrapper>
  )
}

const BookmarkNode = Node.create({
  name: 'bookmark',
  group: 'block',
  atom: true,
  addAttributes() {
    return {
      url: { default: '' },
      title: { default: '' },
      description: { default: '' },
      image: { default: '' },
      favicon: { default: '' },
      hostname: { default: '' },
    }
  },
  parseHTML() { return [{ tag: 'div[data-bookmark]' }] },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-bookmark': '' })] },
  addNodeView() { return ReactNodeViewRenderer(BookmarkView) },
})

// ── EMBED NODE ─────────────────────────────────────────────────────────
function EmbedView({ node, updateAttributes }: any) {
  const [editing, setEditing] = useState(!node.attrs.url)
  const [input, setInput] = useState(node.attrs.url || '')

  function apply() {
    const url = input.trim()
    if (!url) return
    updateAttributes({ url })
    setEditing(false)
  }

  if (editing) {
    return (
      <NodeViewWrapper>
        <div style={{ border: '1px dashed var(--border)', borderRadius: '8px', padding: '16px', margin: '4px 0', background: 'var(--sidebar-bg)' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>🌐 Embed a URL</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              autoFocus
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') apply(); if (e.key === 'Escape') setEditing(false) }}
              placeholder="https://…"
              style={{ flex: 1, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '13px', fontFamily: 'var(--font-sans)', outline: 'none', background: 'var(--surface)', color: 'var(--text)' }}
            />
            <button onClick={apply} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 14px', fontSize: '13px', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontWeight: 500 }}>Embed</button>
          </div>
        </div>
      </NodeViewWrapper>
    )
  }

  return (
    <NodeViewWrapper>
      <div style={{ position: 'relative', margin: '4px 0', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
        <iframe
          src={node.attrs.url}
          style={{ width: '100%', height: node.attrs.height || '400px', border: 'none', display: 'block' }}
          allow="fullscreen"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />
        <div style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: '4px' }}>
          <button onClick={() => { setInput(node.attrs.url); setEditing(true) }}
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px', padding: '2px 8px', fontSize: '11px', cursor: 'pointer', color: 'var(--text-secondary)', fontFamily: 'var(--font-sans)' }}>
            Edit URL
          </button>
          <select
            value={node.attrs.height || '400px'}
            onChange={e => updateAttributes({ height: e.target.value })}
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px', padding: '2px 4px', fontSize: '11px', cursor: 'pointer', color: 'var(--text-secondary)', fontFamily: 'var(--font-sans)' }}>
            <option value="200px">Small</option>
            <option value="400px">Medium</option>
            <option value="600px">Large</option>
            <option value="800px">X-Large</option>
          </select>
        </div>
      </div>
    </NodeViewWrapper>
  )
}

const EmbedNode = Node.create({
  name: 'embed',
  group: 'block',
  atom: true,
  addAttributes() { return { url: { default: '' }, height: { default: '400px' } } },
  parseHTML() { return [{ tag: 'div[data-embed]' }] },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-embed': '' })] },
  addNodeView() { return ReactNodeViewRenderer(EmbedView) },
})

// ── SLASH ITEMS ────────────────────────────────────────────────────────
const SLASH_ITEMS = [
  { id: 'h1', label: 'Heading 1', hint: 'Big section heading', icon: 'H1', section: 'Basic blocks' },
  { id: 'h2', label: 'Heading 2', hint: 'Medium heading', icon: 'H2', section: 'Basic blocks' },
  { id: 'h3', label: 'Heading 3', hint: 'Small heading', icon: 'H3', section: 'Basic blocks' },
  { id: 'bullet', label: 'Bulleted list', hint: 'Simple bullet list', icon: '•', section: 'Basic blocks' },
  { id: 'numbered', label: 'Numbered list', hint: 'Numbered list', icon: '1.', section: 'Basic blocks' },
  { id: 'todo', label: 'To-do list', hint: 'Track tasks', icon: '☑', section: 'Basic blocks' },
  { id: 'quote', label: 'Quote', hint: 'Capture a quote', icon: '❝', section: 'Basic blocks' },
  { id: 'callout', label: 'Callout', hint: 'Make writing stand out', icon: '💡', section: 'Basic blocks' },
  { id: 'code', label: 'Code block', hint: 'Capture a code snippet', icon: '<>', section: 'Basic blocks' },
  { id: 'divider', label: 'Divider', hint: 'Visual divider', icon: '—', section: 'Basic blocks' },
  { id: 'toc', label: 'Table of contents', hint: 'Show page headings', icon: '≡', section: 'Advanced' },
  { id: 'table', label: 'Table', hint: 'Insert a table', icon: '⊞', section: 'Advanced' },
  { id: 'image', label: 'Image', hint: 'Upload or embed an image', icon: '🖼', section: 'Media' },
  { id: 'video', label: 'Video', hint: 'Upload or embed a video', icon: '🎬', section: 'Media' },
  { id: 'file', label: 'File', hint: 'Attach a PDF, Word, Excel…', icon: '📎', section: 'Media' },
  { id: 'ai-write', label: 'Write with AI', hint: 'Generate content from a prompt', icon: '✨', section: 'AI' },
  { id: 'bookmark', label: 'Bookmark', hint: 'Save a link as a rich card', icon: '🔖', section: 'Media' },
  { id: 'embed', label: 'Embed', hint: 'Embed any website or URL', icon: '🌐', section: 'Media' },
  { id: 'subpage', label: 'Sub-page', hint: 'Embed a linked page', icon: '📄', section: 'Advanced' },
  { id: 'database', label: 'Database', hint: 'Embed a database', icon: '🗄️', section: 'Advanced' },
  { id: 'columns2', label: '2 Columns', hint: 'Side-by-side layout', icon: '⫿', section: 'Layout' },
  { id: 'columns3', label: '3 Columns', hint: 'Three-column layout', icon: '⫽', section: 'Layout' },
]

const COLORS = [
  { label: 'Default', value: '' },
  { label: 'Gray', value: '#787774' },
  { label: 'Red', value: '#eb5757' },
  { label: 'Orange', value: '#d9730d' },
  { label: 'Yellow', value: '#dfab01' },
  { label: 'Green', value: '#0f7b6c' },
  { label: 'Blue', value: '#0b6e99' },
  { label: 'Purple', value: '#6940a5' },
  { label: 'Pink', value: '#ad1a72' },
]

const HIGHLIGHTS = [
  { label: 'None', value: '' },
  { label: 'Yellow', value: '#fdf3a7' },
  { label: 'Green', value: '#c6efce' },
  { label: 'Blue', value: '#c9daf8' },
  { label: 'Pink', value: '#fce4ec' },
  { label: 'Orange', value: '#fce5cd' },
]

// ── CUSTOM CODE BLOCK ─────────────────────────────────────────────────────────
const CODE_LANGUAGES = ['bash','css','go','html','java','javascript','json','markdown','mermaid','python','rust','sql','svg','typescript','xml','yaml']

// Reports body scroll-height to parent via postMessage.
// Uses ResizeObserver for live tracking + fallback timeouts for lazy content.
// Also listens for 'canopy-remeasure' so the parent can trigger a fresh
// measurement whenever the iframe viewport width changes (preview ↔ split).
// NOTE: window.resize is intentionally NOT used — changing the iframe height
// also changes the iframe viewport, which would trigger resize → remeasure →
// height change → resize → infinite loop.
const HEIGHT_REPORTER = `<script>(function(){
  var s=document.createElement('style');
  s.textContent='html,body{height:auto!important;min-height:0!important}';
  (document.head||document.documentElement).appendChild(s);
  var tm;
  function r(){
    var b=document.body;if(!b)return;
    var cs=window.getComputedStyle(b);
    var mt=parseFloat(cs.marginTop)||0,mb=parseFloat(cs.marginBottom)||0;
    var h=b.scrollHeight+mt+mb;
    window.parent.postMessage({type:'canopy-height',h:Math.max(40,h)},'*');
  }
  function d(){clearTimeout(tm);tm=setTimeout(r,50);}
  window.addEventListener('load',r);
  setTimeout(r,150);setTimeout(r,600);
  if(typeof ResizeObserver!=='undefined')new ResizeObserver(d).observe(document.body);
  window.addEventListener('message',function(e){if(e.data&&e.data.type==='canopy-remeasure')d();});
})()</script>`

function previewSrcDoc(lang: string, code: string): string {
  if (lang === 'mermaid') {
    const escaped = code.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    // Use requestAnimationFrame to wait for SVG layout after mermaid.run(),
    // then ResizeObserver + remeasure listener to catch any reflows (including
    // viewport-width changes when the parent switches between preview and split).
    return `<!DOCTYPE html><html><head><style>body{margin:0;padding:16px 20px;background:#fff;font-family:sans-serif}svg{max-width:100%;height:auto}</style></head><body><pre class="mermaid">${escaped}</pre><script type="module">
import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
mermaid.initialize({startOnLoad:true,theme:'default',securityLevel:'loose'});
await mermaid.run().catch(()=>{});
function r(){var h=Math.max(document.body.scrollHeight,document.documentElement.scrollHeight);window.parent.postMessage({type:'canopy-height',h:h},'*');}
requestAnimationFrame(()=>requestAnimationFrame(()=>{
  r();setTimeout(r,200);setTimeout(r,600);
  if(typeof ResizeObserver!=='undefined'){var tm;new ResizeObserver(()=>{clearTimeout(tm);tm=setTimeout(r,50);}).observe(document.body);}
  window.addEventListener('message',function(e){if(e.data&&e.data.type==='canopy-remeasure'){if(typeof tm!=='undefined')clearTimeout(tm);tm=setTimeout(r,50);}});
}));
</script></body></html>`
  }
  if (lang === 'svg') {
    return `<!DOCTYPE html><html><head><style>body{margin:0;padding:8px;background:#fff;display:flex;justify-content:center}svg{max-width:100%;height:auto}</style></head><body>${code}${HEIGHT_REPORTER}</body></html>`
  }
  // HTML: inject reporter before </body> if present, otherwise wrap
  if (/<\/body\s*>/i.test(code)) return code.replace(/<\/body\s*>/i, `${HEIGHT_REPORTER}</body>`)
  if (/<html/i.test(code)) return code + HEIGHT_REPORTER
  return `<!DOCTYPE html><html><head><style>body{margin:0;padding:8px;background:#fff}</style></head><body>${code}${HEIGHT_REPORTER}</body></html>`
}

function CodeBlockComponent({ node, updateAttributes }: any) {
  const [tab, setTab] = useState<'code' | 'preview' | 'split'>('code')
  const lang = (node.attrs.language || '').toLowerCase()
  const canPreview = lang === 'html' || lang === 'svg' || lang === 'mermaid'
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const codeWrapRef = useRef<HTMLDivElement>(null)
  const [iframeHeight, setIframeHeight] = useState(160)
  const [codeH, setCodeH] = useState(0)

  // Receive height reports from the preview iframe; only update when value meaningfully changes
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (iframeRef.current && e.source === iframeRef.current.contentWindow) {
        if (e.data?.type === 'canopy-height' && typeof e.data.h === 'number') {
          const next = Math.max(60, Math.ceil(e.data.h) + 4)
          setIframeHeight(prev => Math.abs(next - prev) > 2 ? next : prev)
        }
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  // Measure natural code pane height (the wrapper never has a fixed height, so scrollHeight = content height)
  useEffect(() => {
    if (!codeWrapRef.current) return
    const ro = new ResizeObserver(() => {
      if (codeWrapRef.current) setCodeH(codeWrapRef.current.scrollHeight)
    })
    ro.observe(codeWrapRef.current)
    return () => ro.disconnect()
  }, [])

  // Reset to a modest placeholder height when the content or language changes
  const textContent = node.textContent
  useEffect(() => {
    if (tab !== 'code') setIframeHeight(160)
  }, [textContent, lang])

  // Revert to code tab when switching to a language that has no preview
  useEffect(() => {
    if (!canPreview) setTab('code')
  }, [canPreview])

  // When the tab switches between preview and split, the iframe viewport width changes
  // (full width vs half width). Ask the iframe to remeasure once the new layout has settled.
  useEffect(() => {
    if (tab === 'code') return
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => {
        iframeRef.current?.contentWindow?.postMessage({ type: 'canopy-remeasure' }, '*')
      })
    })
    return () => cancelAnimationFrame(raf)
  }, [tab])

  // In split mode: iframe height = max(code content height, iframe content height)
  const previewH = tab === 'split' ? Math.max(codeH || iframeHeight, iframeHeight) : iframeHeight

  return (
    <NodeViewWrapper style={{ margin: '8px 0' }}>
      <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: '#1b1b2e' }}>
        {/* Header */}
        <div contentEditable={false} style={{ display: 'flex', alignItems: 'center', padding: '5px 10px', background: 'rgba(0,0,0,0.25)', borderBottom: '1px solid rgba(255,255,255,0.06)', gap: 8, userSelect: 'none' }}>
          <select
            value={node.attrs.language || ''}
            onChange={e => updateAttributes({ language: e.target.value })}
            onMouseDown={e => e.stopPropagation()}
            style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: '#9ba3b0', borderRadius: 4, padding: '2px 6px', fontSize: 11, fontFamily: 'monospace', cursor: 'pointer', outline: 'none' }}>
            <option value="">plain text</option>
            {CODE_LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          {canPreview && (
            <div style={{ marginLeft: 'auto', display: 'flex', background: 'rgba(255,255,255,0.06)', borderRadius: 5, padding: 2, gap: 1 }}>
              {(['code', 'preview', 'split'] as const).map(t => (
                <button key={t}
                  onMouseDown={e => { e.preventDefault(); e.stopPropagation(); setTab(t) }}
                  style={{ background: tab === t ? 'rgba(255,255,255,0.14)' : 'none', color: tab === t ? '#e2e8f0' : '#666', border: 'none', borderRadius: 4, padding: '2px 10px', cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font-sans)', transition: 'all 0.1s' }}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          )}
        </div>
        {/* Code + preview area */}
        <div style={{ display: tab === 'split' ? 'grid' : 'block', gridTemplateColumns: '1fr 1fr', alignItems: 'start' }}>
          <div ref={codeWrapRef} style={{ display: tab === 'preview' ? 'none' : 'block', borderRight: tab === 'split' ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
            <NodeViewContent as="pre" style={{ margin: 0, padding: '10px 16px 10px', color: '#c9d1d9', fontSize: 13, fontFamily: '"Fira Code","Cascadia Code",monospace', overflowX: 'auto', lineHeight: 1.6, whiteSpace: 'pre' }} />
          </div>
          {tab !== 'code' && (
            <iframe
              ref={iframeRef}
              srcDoc={previewSrcDoc(lang, node.textContent)}
              title={lang === 'mermaid' ? 'Mermaid diagram' : 'Preview'}
              style={{ width: '100%', height: previewH, border: 'none', background: '#fff', display: 'block' }}
              sandbox="allow-scripts allow-same-origin"
            />
          )}
        </div>
      </div>
    </NodeViewWrapper>
  )
}

const CustomCodeBlock = Node.create({
  name: 'codeBlock',
  group: 'block',
  content: 'text*',
  marks: '',
  code: true,
  defining: true,
  addAttributes() {
    return {
      language: {
        default: null,
        parseHTML: el => el.getAttribute('data-language') || el.querySelector('code')?.className?.replace('language-', '') || null,
      },
    }
  },
  parseHTML() { return [{ tag: 'pre', preserveWhitespace: 'full' }] },
  renderHTML({ HTMLAttributes }) {
    return ['pre', mergeAttributes(HTMLAttributes, { 'data-language': HTMLAttributes.language || '' }), ['code', 0]]
  },
  addCommands() {
    return {
      setCodeBlock: (attrs?: any) => ({ commands }: any) => commands.setNode('codeBlock', attrs),
      toggleCodeBlock: (attrs?: any) => ({ commands }: any) => commands.toggleNode('codeBlock', 'paragraph', attrs || {}),
    } as any
  },
  addKeyboardShortcuts() {
    return {
      'Mod-Alt-c': () => (this.editor as any).commands.toggleCodeBlock(),
      'Mod-Enter': ({ editor }: any) => {
        if (!editor.isActive('codeBlock')) return false
        return editor.commands.exitCode()
      },
      Tab: ({ editor }: any) => {
        if (!editor.isActive('codeBlock')) return false
        editor.commands.insertContent('  ')
        return true
      },
      Backspace: ({ editor }: any) => {
        if (!editor.isActive('codeBlock')) return false
        const { $from } = editor.state.selection
        if ($from.pos !== $from.start()) return false
        return editor.commands.clearNodes()
      },
    }
  },
  addNodeView() { return ReactNodeViewRenderer(CodeBlockComponent) },
})

type Props = {
  content: any
  editable: boolean
  onUpdate: (content: any) => void
  onEditorReady?: (editor: any) => void
  workspaceId?: string
}

function FBtn({ onClick, active, children, title, btnRef, disabled }: { onClick?: () => void; active: boolean; children: React.ReactNode; title?: string; btnRef?: React.RefObject<HTMLButtonElement | null>; disabled?: boolean }) {
  return (
    <button
      ref={btnRef as React.RefObject<HTMLButtonElement>}
      onClick={onClick}
      title={title}
      data-tip={title}
      disabled={disabled}
      className={`floating-btn ${active ? 'active' : ''}${disabled ? ' opacity-50' : ''}`}>
      {children}
    </button>
  )
}

export default function Editor({ content, editable, onUpdate, onEditorReady, workspaceId }: Props) {
  const [slashMenu, setSlashMenu] = useState<{ x: number; y: number; query: string; fromPos: number } | null>(null)
  const [slashIndex, setSlashIndex] = useState(0)
  const [atMenu, setAtMenu] = useState<{ x: number; y: number; query: string } | null>(null)
  const [atResults, setAtResults] = useState<{ id: string; title: string; icon: string }[]>([])
  const [atIndex, setAtIndex] = useState(0)
  const atQueryRef = useRef('')
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [showHighlightPicker, setShowHighlightPicker] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [showAiMenu, setShowAiMenu] = useState(false)
  const [aiMenuPos, setAiMenuPos] = useState<{ x: number; y: number } | null>(null)
  const [aiWritePos, setAiWritePos] = useState<{ x: number; y: number; insertAt: number } | null>(null)
  const [aiWritePrompt, setAiWritePrompt] = useState('')
  const aiBtnRef = useRef<HTMLButtonElement>(null)
  const savedSelection = useRef<{ from: number; to: number } | null>(null)
  const colorBtnRef = useRef<HTMLButtonElement>(null)
  const highlightBtnRef = useRef<HTMLButtonElement>(null)
  const [pickerPos, setPickerPos] = useState<{ x: number; y: number } | null>(null)
  const slashQueryRef = useRef('')
  const pendingImageInsert = useRef<((src: string) => void) | null>(null)
  const [blockCtxMenu, setBlockCtxMenu] = useState<{ x: number; y: number; pos: number } | null>(null)
  const [bubbleMenuEnabled, setBubbleMenuEnabled] = useState(true)
  const bubbleMenuEnabledRef = useRef(true)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, codeBlock: false }),
      CustomCodeBlock,
      Placeholder.configure({
        placeholder: ({ node }) => node.type.name === 'heading' ? 'Heading' : "Type '/' for commands…"
      }),
      Typography,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TaskList,
      TaskItem.extend({ content: 'paragraph' }),
      Table.configure({ resizable: true }),
      TableRow, TableCell, TableHeader,
      ResizableImage,
      VideoNode,
      FileNode,
      Link.configure({ openOnClick: true, autolink: true }),
      Youtube.configure({ controls: true, width: 640, height: 360 }),
      HorizontalRule,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Underline,
      CalloutExtension,
      TocExtension,
      SubpageExtension,
      DatabaseBlockExtension,
      PageMentionNode,
      ColumnNode,
      ColumnsNode,
      EmbedNode,
      BookmarkNode,
    ],
    content: content || '',
    editable,
    onUpdate: ({ editor }) => onUpdate(editor.getJSON()),
    onCreate: ({ editor }) => {
        if (onEditorReady) onEditorReady(editor)
        // Listen for image insert from picker
        function onInsert(e: any) {
          const src = e.detail?.src
          if (!src) return
          editor.chain().focus().setImage({ src }).run()
          setTimeout(() => {
            editor.commands.insertContent({ type: 'paragraph' })
          }, 50)
        }
        window.addEventListener('canopy:insertImage', onInsert)

        function onInsertVideo(e: any) {
          const src = e.detail?.src
          if (!src) return
          editor.chain().focus().insertContent([
            { type: 'video', attrs: { src } },
            { type: 'paragraph' },
          ]).run()
        }
        window.addEventListener('canopy:insertVideo', onInsertVideo)

        function onInsertFile(e: any) {
          const { src, name, size, mime } = e.detail || {}
          if (!src) return
          const attrs = { src, name: name || src.split('/').pop() || 'File', size: size || 0, mime: mime || '' }
          editor.chain().focus().insertContent([
            { type: 'fileAttachment', attrs },
            { type: 'paragraph' },
          ]).run()
        }
        window.addEventListener('canopy:insertFile', onInsertFile)
        // Store cleanup for later
        ;(editor as any)._imageCleanup = () => {
          window.removeEventListener('canopy:insertImage', onInsert)
          window.removeEventListener('canopy:insertVideo', onInsertVideo)
          window.removeEventListener('canopy:insertFile', onInsertFile)
        }
      },
      onDestroy: () => {
        ;(editor as any)._imageCleanup?.()
      },
    editorProps: {
      handleDOMEvents: {
        contextmenu: (view, event) => {
          if (!editable) return false
          event.preventDefault()
          const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })
          setBubbleMenuEnabled(false)
          bubbleMenuEnabledRef.current = false
          setBlockCtxMenu({ x: event.clientX, y: event.clientY, pos: pos?.pos ?? 0 })
          return true
        },
        dragover: (_view, event) => {
          const types = Array.from((event as DragEvent).dataTransfer?.types || [])
          if (types.includes('Files')) {
            event.preventDefault()
            return true
          }
          return false
        },
        drop: (_view, event) => {
          if (!_view.editable) return false
          const files = Array.from((event as DragEvent).dataTransfer?.files || [])
          if (!files.length) return false
          event.preventDefault()
          files.forEach(file => {
            window.dispatchEvent(new CustomEvent('canopy:uploadFile', { detail: { file } }))
          })
          return true
        },
        paste: (_view, event) => {
          if (!_view.editable) return false
          const files = Array.from((event as ClipboardEvent).clipboardData?.files || [])
          if (!files.length) return false
          event.preventDefault()
          files.forEach(file => {
            window.dispatchEvent(new CustomEvent('canopy:uploadFile', { detail: { file } }))
          })
          return true
        },
      },
      handlePaste(view, event) {
        if (!view.editable) return false
        const text = event.clipboardData?.getData('text/plain')?.trim() || ''
        if (/^https?:\/\/\S+$/.test(text)) {
          const { state } = view
          const { $from } = state.selection
          const isEmptyParagraph = $from.parent.type.name === 'paragraph' && $from.parent.textContent === ''
          if (isEmptyParagraph) {
            event.preventDefault()
            setTimeout(() => insertBookmark(text), 0)
            return true
          }
        }
        return false
      },
      handleKeyDown(view, event) {
        if (!view.editable) return false
        if (event.key === '@' && workspaceId) {
          const { from } = view.state.selection
          const coords = view.coordsAtPos(from)
          setAtMenu({ x: coords.left, y: coords.bottom + 8, query: '' })
          atQueryRef.current = ''
          setAtIndex(0)
          return false
        }
        if (atMenu) {
          if (event.key === 'Escape') { setAtMenu(null); return true }
          if (event.key === 'ArrowDown') { setAtIndex(i => (i + 1) % Math.max(1, atResults.length)); return true }
          if (event.key === 'ArrowUp') { setAtIndex(i => (i - 1 + Math.max(1, atResults.length)) % Math.max(1, atResults.length)); return true }
          if (event.key === 'Enter') {
            if (atResults[atIndex]) { runMention(atResults[atIndex]); return true }
            return false
          }
          if (event.key === 'Backspace') {
            if (atQueryRef.current.length === 0) { setAtMenu(null); return false }
            atQueryRef.current = atQueryRef.current.slice(0, -1)
            setAtMenu(m => m ? { ...m, query: atQueryRef.current } : null)
            return false
          }
          if (event.key === ' ') { setAtMenu(null); return false }
          if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
            atQueryRef.current += event.key
            setAtMenu(m => m ? { ...m, query: atQueryRef.current } : null)
            setAtIndex(0)
            return false
          }
        }
        if (event.key === '/') {
          const { from } = view.state.selection
          const coords = view.coordsAtPos(from)
          setSlashMenu({ x: coords.left, y: coords.bottom + 8, query: '', fromPos: from })
          slashQueryRef.current = ''
          setSlashIndex(0)
          return false
        }
        if (slashMenu) {
          if (event.key === 'Escape') { setSlashMenu(null); return true }
          if (event.key === 'ArrowDown') { setSlashIndex(i => (i + 1) % getItems(slashQueryRef.current).length); return true }
          if (event.key === 'ArrowUp') { setSlashIndex(i => (i - 1 + getItems(slashQueryRef.current).length) % getItems(slashQueryRef.current).length); return true }
          if (event.key === 'Enter') {
            const items = getItems(slashQueryRef.current)
            if (items[slashIndex]) { runCmd(items[slashIndex].id, slashMenu.fromPos, slashQueryRef.current); return true }
          }
          if (event.key === 'Backspace') {
            if (slashQueryRef.current.length === 0) setSlashMenu(null)
            else { slashQueryRef.current = slashQueryRef.current.slice(0, -1); setSlashMenu(m => m ? { ...m, query: slashQueryRef.current } : null); setSlashIndex(0) }
            return false
          }
          if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
            slashQueryRef.current += event.key
            setSlashMenu(m => m ? { ...m, query: slashQueryRef.current } : null)
            setSlashIndex(0)
            return false
          }
        }
        return false
      },
    },
  })

  useEffect(() => {
    if (!editor) return
    editor.setEditable(editable)
  }, [editor, editable])

  useEffect(() => {
    if (!atMenu || !workspaceId) return
    const q = atMenu.query
    const timer = setTimeout(async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('pages')
        .select('id, title, icon')
        .eq('workspace_id', workspaceId)
        .ilike('title', `%${q}%`)
        .limit(10)
      setAtResults(data || [])
    }, 150)
    return () => clearTimeout(timer)
  }, [atMenu?.query, workspaceId])

  function runMention(page: { id: string; title: string; icon: string }) {
    if (!editor) return
    setAtMenu(null)
    const curPos = editor.state.selection.from
    const q = atQueryRef.current
    const deleteFrom = curPos - q.length - 1
    editor.chain()
      .focus()
      .deleteRange({ from: deleteFrom, to: curPos })
      .insertContentAt(deleteFrom, { type: 'pageMention', attrs: { pageId: page.id, label: page.title || 'Untitled' } })
      .run()
    atQueryRef.current = ''
  }

  function getItems(q: string) {
    if (!q) return SLASH_ITEMS
    return SLASH_ITEMS.filter(i => i.label.toLowerCase().includes(q.toLowerCase()))
  }

  function runCmd(id: string, fromPos: number, query: string) {
    if (!editor) return
    setSlashMenu(null)
    const curPos = editor.state.selection.from
    editor.chain().focus().deleteRange({ from: curPos - query.length - 1, to: curPos }).run()

    switch (id) {
      case 'h1': editor.chain().focus().toggleHeading({ level: 1 }).run(); break
      case 'h2': editor.chain().focus().toggleHeading({ level: 2 }).run(); break
      case 'h3': editor.chain().focus().toggleHeading({ level: 3 }).run(); break
      case 'bullet': editor.chain().focus().toggleBulletList().run(); break
      case 'numbered': editor.chain().focus().toggleOrderedList().run(); break
      case 'todo':
        editor.chain().focus().toggleTaskList().run()
        setTimeout(() => editor.commands.focus(), 0)
        break
      case 'quote': editor.chain().focus().toggleBlockquote().run(); break
      case 'callout': editor.chain().focus().insertContent({ type: 'callout', content: [{ type: 'text', text: ' ' }] }).run(); break
      case 'code': editor.chain().focus().toggleCodeBlock().run(); break
      case 'divider': editor.chain().focus().setHorizontalRule().run(); break
      case 'toc': editor.chain().focus().insertContent({ type: 'toc' }).run(); break
      case 'table':
        editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
        // Add paragraph after table so user can continue writing
        setTimeout(() => {
          const { state } = editor
          const end = state.doc.content.size - 1
          editor.chain().insertContentAt(end, { type: 'paragraph' }).focus(end + 2).run()
        }, 50)
        break
      case 'image': {
        const insertFn = (src: string) => {
          editor.chain().focus().setImage({ src }).run()
          setTimeout(() => {
            try {
              const pos = editor.state.selection.to
              if (pos < editor.state.doc.content.size) {
                editor.chain().focus().insertContentAt(pos + 1, { type: 'paragraph' }).run()
              } else {
                editor.commands.insertContent({ type: 'paragraph' })
              }
            } catch {}
          }, 50)
        }
        window.dispatchEvent(new CustomEvent('canopy:showImagePicker', { detail: { onUrl: insertFn, onFile: insertFn } }))
        break
      }
      case 'video': {
        const insertVideoFn = (src: string) => {
          editor.chain().focus().insertContent({ type: 'video', attrs: { src } }).run()
          setTimeout(() => {
            try {
              const pos = editor.state.selection.to
              if (pos < editor.state.doc.content.size) {
                editor.chain().focus().insertContentAt(pos + 1, { type: 'paragraph' }).run()
              } else {
                editor.commands.insertContent({ type: 'paragraph' })
              }
            } catch {}
          }, 50)
        }
        window.dispatchEvent(new CustomEvent('canopy:showImagePicker', { detail: { tab: 'video', onUrl: insertVideoFn, onFile: insertVideoFn } }))
        break
      }
      case 'file': {
        const insertFileFn = (src: string, name?: string, size?: number, mime?: string) => {
          const attrs = { src, name: name || src.split('/').pop() || 'File', size: size || 0, mime: mime || '' }
          editor.chain().focus().insertContent([
            { type: 'fileAttachment', attrs },
            { type: 'paragraph' },
          ]).run()
        }
        window.dispatchEvent(new CustomEvent('canopy:showImagePicker', { detail: { tab: 'file', onUrl: insertFileFn, onFile: insertFileFn } }))
        break
      }
      case 'subpage': {
        const event = new CustomEvent('canopy:showSubpagePicker', { detail: { onSelect: (input: string) => {
          // Accept URL like /app/page/UUID or just UUID
          const match = input.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
          const pageId = match ? match[0] : input.trim()
          if (pageId) editor.chain().focus().insertContent({ type: 'subpage', attrs: { pageId, expanded: true } }).run()
        }}})
        window.dispatchEvent(event)
        break
      }
      case 'database': {
        const pageId = window.prompt('Database page ID (copy from the URL):')
        if (pageId) editor.chain().focus().insertContent({ type: 'databaseBlock', attrs: { pageId: pageId.trim(), view: 'table', collapsed: false } }).run()
        break
      }
      case 'columns2':
        editor.chain().focus().insertContent({
          type: 'columns',
          content: [
            { type: 'column', content: [{ type: 'paragraph' }] },
            { type: 'column', content: [{ type: 'paragraph' }] },
          ],
        }).run()
        break
      case 'columns3':
        editor.chain().focus().insertContent({
          type: 'columns',
          content: [
            { type: 'column', content: [{ type: 'paragraph' }] },
            { type: 'column', content: [{ type: 'paragraph' }] },
            { type: 'column', content: [{ type: 'paragraph' }] },
          ],
        }).run()
        break
      case 'embed':
        editor.chain().focus().insertContent({ type: 'embed', attrs: { url: '', height: '400px' } }).run()
        break
      case 'ai-write': {
        const curPos = editor.state.selection.from
        const coords = editor.view.coordsAtPos(curPos)
        setAiWritePos({ x: coords.left, y: coords.bottom + 8, insertAt: curPos })
        setAiWritePrompt('')
        break
      }
      case 'bookmark': {
        const bookmarkUrl = window.prompt('Paste a URL to create a bookmark:')
        if (bookmarkUrl?.trim()) insertBookmark(bookmarkUrl.trim())
        break
      }
    }
  }

  async function runAiWrite() {
    if (!editor || !aiWritePos || !aiWritePrompt.trim()) return
    const prompt = aiWritePrompt.trim()
    setAiWritePos(null)
    setAiLoading(true)
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: prompt, action: 'write' }),
      })
      const { result, error } = await res.json()
      if (error || !result) throw new Error(error || 'No result')
      editor.chain().focus().insertContentAt(aiWritePos.insertAt, result).run()
    } catch {}
    setAiLoading(false)
  }

  async function insertBookmark(url: string) {
    if (!editor) return
    try {
      const res = await fetch(`/api/bookmark?url=${encodeURIComponent(url)}`)
      const meta = await res.json()
      editor.chain().focus().insertContent({ type: 'bookmark', attrs: { url, ...meta } }).run()
    } catch {
      editor.chain().focus().insertContent({ type: 'bookmark', attrs: { url, title: url, description: '', image: '', favicon: '', hostname: new URL(url).hostname } }).run()
    }
  }

  async function runAI(action: string) {
    if (!editor || aiLoading) return
    const { from, to } = savedSelection.current || editor.state.selection
    const text = editor.state.doc.textBetween(from, to, '\n')
    if (!text.trim()) return
    setAiLoading(true)
    setAiError(null)
    setShowAiMenu(false)
    try {
      const res = await fetch('/api/ai', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, action }) })
      const { result, error } = await res.json()
      if (error || !result) throw new Error(error || 'No result')
      editor.chain().focus().setTextSelection({ from, to }).insertContent(result).run()
    } catch (err: any) {
      setAiError(err?.message || 'AI error')
      setTimeout(() => setAiError(null), 3000)
    }
    setAiLoading(false)
  }

  if (!editor) return null

  const items = getItems(slashMenu?.query || '')
  let lastSection = ''
  const inHeading = editor.isActive('heading')
  const inCodeBlock = editor.isActive('codeBlock')
  const inBlockquote = editor.isActive('blockquote')

  const main = (
    <div style={{ position: 'relative' }}>
      {/* Floating bubble menu on selection */}
      <BubbleMenu editor={editor} tippyOptions={{ duration: 100, placement: 'top', interactive: true, hideOnClick: false, maxWidth: 'calc(100vw - 32px)' }}
        shouldShow={({ editor }) => {
          if (!bubbleMenuEnabledRef.current) return false
          if (!editor.isFocused) return false
          return editor.isActive('image') || (!editor.state.selection.empty)
        }}>
        <div className="floating-toolbar" style={{ overflowX: 'auto', maxWidth: 'calc(100vw - 32px)', flexWrap: 'nowrap' }} onMouseDown={e => e.preventDefault()}>
          {/* Image-only controls */}
          {editor.isActive('image') && <>
            <FBtn title="Align left" onClick={() => editor.chain().focus().updateAttributes('image', { align: 'left' }).run()}
              active={editor.getAttributes('image').align === 'left' || !editor.getAttributes('image').align}>⬅</FBtn>
            <FBtn title="Center" onClick={() => editor.chain().focus().updateAttributes('image', { align: 'center' }).run()}
              active={editor.getAttributes('image').align === 'center'}>↔</FBtn>
            <FBtn title="Align right" onClick={() => editor.chain().focus().updateAttributes('image', { align: 'right' }).run()}
              active={editor.getAttributes('image').align === 'right'}>➡</FBtn>
          </>}
          {/* All other controls — hidden for images */}
          {!editor.isActive('image') && <>
          {/* Inline formatting — always shown; in code block, converts block to paragraph first */}
          <>
            <FBtn onClick={() => {
              if (inCodeBlock) editor.chain().focus().clearNodes().toggleBold().run()
              else editor.chain().focus().toggleBold().run()
            }} active={editor.isActive('bold')} title='Bold'><b>B</b></FBtn>
            <FBtn onClick={() => {
              if (inCodeBlock) editor.chain().focus().clearNodes().toggleItalic().run()
              else editor.chain().focus().toggleItalic().run()
            }} active={editor.isActive('italic')} title='Italic'><i>I</i></FBtn>
            <FBtn onClick={() => {
              if (inCodeBlock) editor.chain().focus().clearNodes().toggleUnderline().run()
              else editor.chain().focus().toggleUnderline().run()
            }} active={editor.isActive('underline')} title='Underline'><u>U</u></FBtn>
            <FBtn onClick={() => {
              if (inCodeBlock) editor.chain().focus().clearNodes().toggleStrike().run()
              else editor.chain().focus().toggleStrike().run()
            }} active={editor.isActive('strike')} title='Strikethrough'><s>S</s></FBtn>
            <FBtn onClick={() => {
              if (inCodeBlock) editor.chain().focus().clearNodes().toggleCode().run()
              else editor.chain().focus().toggleCode().run()
            }} active={editor.isActive('code')} title='Inline code'>{'`'}</FBtn>
            <div className="floating-sep" />
            <FBtn btnRef={colorBtnRef} onClick={() => {
              const { from, to } = editor.state.selection
              savedSelection.current = { from, to }
              if (!showColorPicker) {
                const r = colorBtnRef.current?.getBoundingClientRect()
                if (r) setPickerPos({ x: r.left, y: r.bottom + 6 })
              }
              setShowColorPicker(o => !o); setShowHighlightPicker(false)
            }} active={showColorPicker} title='Text color'>
              <span style={{ borderBottom: `3px solid ${editor.getAttributes('textStyle').color || '#fff'}` }}>A</span>
            </FBtn>
            <FBtn btnRef={highlightBtnRef} onClick={() => {
              const { from, to } = editor.state.selection
              savedSelection.current = { from, to }
              if (!showHighlightPicker) {
                const r = highlightBtnRef.current?.getBoundingClientRect()
                if (r) setPickerPos({ x: r.left, y: r.bottom + 6 })
              }
              setShowHighlightPicker(o => !o); setShowColorPicker(false)
            }} active={showHighlightPicker} title='Highlight'>
              <span style={{ background: editor.getAttributes('highlight').color || '#fdf3a7', padding: '0 3px', borderRadius: '2px', color: '#37352f' }}>H</span>
            </FBtn>
            <div className="floating-sep" />
          </>
          {/* Block types — always shown; click handlers enforce mutual exclusivity */}
          <FBtn onClick={() => {
            if (inBlockquote) editor.chain().focus().toggleBlockquote().toggleHeading({ level: 1 }).run()
            else if (inCodeBlock) editor.chain().focus().clearNodes().toggleHeading({ level: 1 }).run()
            else editor.chain().focus().toggleHeading({ level: 1 }).run()
          }} active={editor.isActive('heading', { level: 1 })} title='Heading 1'>H1</FBtn>
          <FBtn onClick={() => {
            if (inBlockquote) editor.chain().focus().toggleBlockquote().toggleHeading({ level: 2 }).run()
            else if (inCodeBlock) editor.chain().focus().clearNodes().toggleHeading({ level: 2 }).run()
            else editor.chain().focus().toggleHeading({ level: 2 }).run()
          }} active={editor.isActive('heading', { level: 2 })} title='Heading 2'>H2</FBtn>
          <FBtn onClick={() => {
            if (inBlockquote) editor.chain().focus().toggleBlockquote().toggleHeading({ level: 3 }).run()
            else if (inCodeBlock) editor.chain().focus().clearNodes().toggleHeading({ level: 3 }).run()
            else editor.chain().focus().toggleHeading({ level: 3 }).run()
          }} active={editor.isActive('heading', { level: 3 })} title='Heading 3'>H3</FBtn>
          <FBtn onClick={() => {
            if (inHeading || inCodeBlock) editor.chain().focus().clearNodes().toggleBulletList().run()
            else if (inBlockquote) editor.chain().focus().toggleBlockquote().toggleBulletList().run()
            else editor.chain().focus().toggleBulletList().run()
          }} active={editor.isActive('bulletList')} title='Bullet list'>•</FBtn>
          <FBtn onClick={() => {
            if (inHeading || inCodeBlock) editor.chain().focus().clearNodes().toggleOrderedList().run()
            else if (inBlockquote) editor.chain().focus().toggleBlockquote().toggleOrderedList().run()
            else editor.chain().focus().toggleOrderedList().run()
          }} active={editor.isActive('orderedList')} title='Numbered list'>1.</FBtn>
          <FBtn onClick={() => {
            if (inHeading || inCodeBlock) editor.chain().focus().clearNodes().toggleTaskList().run()
            else if (inBlockquote) editor.chain().focus().toggleBlockquote().toggleTaskList().run()
            else editor.chain().focus().toggleTaskList().run()
            setTimeout(() => editor.commands.focus(), 0)
          }} active={editor.isActive('taskList')} title='To-do list'>☑</FBtn>
          <FBtn onClick={() => {
            if (inHeading || inCodeBlock) editor.chain().focus().clearNodes().toggleBlockquote().run()
            else editor.chain().focus().toggleBlockquote().run()
          }} active={editor.isActive('blockquote')} title='Quote'>❝</FBtn>
          <FBtn onClick={() => {
            const { from, to } = editor.state.selection
            const text = from !== to ? editor.state.doc.textBetween(from, to) : ''
            editor.chain().focus()
              .deleteSelection()
              .insertContent({ type: 'callout', attrs: { emoji: '💡' }, content: text ? [{ type: 'text', text }] : [] })
              .run()
          }} active={false} title='Callout'>💡</FBtn>
          <FBtn onClick={() => {
            if (inHeading) editor.chain().focus().clearNodes().toggleCodeBlock().run()
            else if (inBlockquote) editor.chain().focus().toggleBlockquote().toggleCodeBlock().run()
            else editor.chain().focus().toggleCodeBlock().run()
          }} active={editor.isActive('codeBlock')} title='Code block'>{'<>'}</FBtn>
          {/* Link and alignment — always shown */}
          <>
            <div className="floating-sep" />
            <FBtn onClick={() => {
              const prev = editor.getAttributes('link').href
              const url = window.prompt('URL:', prev || 'https://')
              if (url === null) return
              url === '' ? editor.chain().focus().unsetLink().run() : editor.chain().focus().setLink({ href: url }).run()
            }} active={editor.isActive('link')} title='Link'>🔗</FBtn>
            <div className="floating-sep" />
            <FBtn onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} title='Align left'>⬅</FBtn>
            <FBtn onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} title='Center'>↔</FBtn>
            <FBtn onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} title='Align right'>➡</FBtn>
            <div className="floating-sep" />
            <FBtn btnRef={aiBtnRef} onClick={() => {
                const { from, to } = editor.state.selection
                savedSelection.current = { from, to }
                if (!showAiMenu) {
                  const r = aiBtnRef.current?.getBoundingClientRect()
                  if (r) setAiMenuPos({ x: r.left, y: r.bottom + 6 })
                }
                setShowAiMenu(o => !o)
              }} active={showAiMenu} title='AI rewrite' disabled={aiLoading}>
                {aiLoading ? '…' : '✨ AI'}
              </FBtn>
          </>
          </>}
        </div>
      </BubbleMenu>

      {/* Table toolbar */}
      <BubbleMenu
        editor={editor}
        tippyOptions={{ duration: 100, placement: 'top', interactive: true }}
        shouldShow={({ editor: ed }) => ed.isActive('tableCell') || ed.isActive('tableHeader')}
      >
        {(() => {
          const btnStyle: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px 7px', borderRadius: '4px', fontSize: '12px', fontFamily: 'var(--font-sans)', display: 'flex', alignItems: 'center', gap: '3px', whiteSpace: 'nowrap' }
          const hoverIn = (e: React.MouseEvent) => { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)' }
          const hoverOut = (e: React.MouseEvent) => { (e.currentTarget as HTMLElement).style.background = 'none' }
          return (
            <div style={{ display: 'flex', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '3px', boxShadow: 'var(--shadow-lg)', gap: '1px' }} onMouseDown={e => e.preventDefault()}>
              <button style={btnStyle} onMouseEnter={hoverIn} onMouseLeave={hoverOut} onClick={() => editor.chain().focus().addRowBefore().run()} title="Add row above">↑ Row</button>
              <button style={btnStyle} onMouseEnter={hoverIn} onMouseLeave={hoverOut} onClick={() => editor.chain().focus().addRowAfter().run()} title="Add row below">↓ Row</button>
              <button style={btnStyle} onMouseEnter={hoverIn} onMouseLeave={hoverOut} onClick={() => editor.chain().focus().deleteRow().run()} title="Delete row" >✕ Row</button>
              <div style={{ width: 1, background: 'var(--border)', margin: '2px 2px' }} />
              <button style={btnStyle} onMouseEnter={hoverIn} onMouseLeave={hoverOut} onClick={() => editor.chain().focus().addColumnBefore().run()} title="Add column left">← Col</button>
              <button style={btnStyle} onMouseEnter={hoverIn} onMouseLeave={hoverOut} onClick={() => editor.chain().focus().addColumnAfter().run()} title="Add column right">→ Col</button>
              <button style={btnStyle} onMouseEnter={hoverIn} onMouseLeave={hoverOut} onClick={() => editor.chain().focus().deleteColumn().run()} title="Delete column">✕ Col</button>
              <div style={{ width: 1, background: 'var(--border)', margin: '2px 2px' }} />
              <button style={{ ...btnStyle, color: '#eb5757' }} onMouseEnter={hoverIn} onMouseLeave={hoverOut} onClick={() => editor.chain().focus().deleteTable().run()} title="Delete table">🗑 Table</button>
            </div>
          )
        })()}
      </BubbleMenu>

      <EditorContent editor={editor} />

      {/* Clickable area below editor — lets user place cursor after the last block */}
      {editable && (
        <div
          style={{ height: '60px', cursor: 'text' }}
          onClick={() => {
            const { doc } = editor.state
            const lastNode = doc.lastChild
            if (lastNode && lastNode.type.name !== 'paragraph') {
              editor.chain().insertContentAt(doc.content.size, { type: 'paragraph' }).focus('end').run()
            } else {
              editor.commands.focus('end')
            }
          }}
        />
      )}

      {/* AI Write prompt */}
      {aiWritePos && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 998 }} onClick={() => setAiWritePos(null)} />
          <div style={{ position: 'fixed', left: Math.min(aiWritePos.x, window.innerWidth - 340), top: Math.min(aiWritePos.y, window.innerHeight - 100), zIndex: 999, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 10, boxShadow: 'var(--shadow-lg)', width: 320 }} className="scale-in">
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>✨ Write with AI</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                autoFocus
                value={aiWritePrompt}
                onChange={e => setAiWritePrompt(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); runAiWrite() }
                  if (e.key === 'Escape') setAiWritePos(null)
                }}
                placeholder="Describe what to write…"
                style={{ flex: 1, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, fontFamily: 'var(--font-sans)', outline: 'none', background: 'var(--sidebar-bg)', color: 'var(--text)' }}
              />
              <button onClick={runAiWrite} disabled={!aiWritePrompt.trim()}
                style={{ background: aiWritePrompt.trim() ? 'var(--accent)' : 'var(--border)', color: aiWritePrompt.trim() ? '#fff' : 'var(--text-tertiary)', border: 'none', borderRadius: 6, padding: '6px 12px', cursor: aiWritePrompt.trim() ? 'pointer' : 'not-allowed', fontFamily: 'var(--font-sans)', fontWeight: 500, fontSize: 13 }}>
                Generate
              </button>
            </div>
          </div>
        </>
      )}

      {/* Slash menu */}
      {slashMenu && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 998 }} onClick={() => setSlashMenu(null)} />
          <div className="slash-menu fade-in"
            style={{ position: 'fixed', left: Math.min(slashMenu.x, window.innerWidth - 260), top: Math.min(slashMenu.y, window.innerHeight - 360), zIndex: 999 }}>
            {items.length === 0
              ? <div style={{ padding: '10px 12px', color: 'var(--text-tertiary)', fontSize: '13px' }}>No results</div>
              : items.map((item, i) => {
                  const showSec = item.section !== lastSection
                  lastSection = item.section
                  return (
                    <div key={item.id}>
                      {showSec && <div className="slash-menu-section">{item.section}</div>}
                      <div className={`slash-menu-item ${i === slashIndex ? 'active' : ''}`}
                        onMouseEnter={() => setSlashIndex(i)}
                        onClick={() => runCmd(item.id, slashMenu.fromPos, slashMenu.query)}>
                        <div className="icon">{item.icon}</div>
                        <div>
                          <div className="label">{item.label}</div>
                          <div className="hint">{item.hint}</div>
                        </div>
                      </div>
                    </div>
                  )
                })
            }
          </div>
        </>
      )}
      {/* @ mention menu */}
      {atMenu && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 998 }} onClick={() => setAtMenu(null)} />
          <div className="slash-menu fade-in"
            style={{ position: 'fixed', left: Math.min(atMenu.x, window.innerWidth - 240), top: Math.min(atMenu.y, window.innerHeight - 280), zIndex: 999, minWidth: 220 }}>
            {atResults.length === 0
              ? <div style={{ padding: '10px 12px', color: 'var(--text-tertiary)', fontSize: '13px' }}>
                  {atMenu.query ? 'No pages found' : 'Type to search…'}
                </div>
              : atResults.map((page, i) => (
                <div key={page.id}
                  className={`slash-menu-item ${i === atIndex ? 'active' : ''}`}
                  onMouseEnter={() => setAtIndex(i)}
                  onClick={() => runMention(page)}>
                  <div className="icon" style={{ fontSize: 16 }}>{page.icon || '📄'}</div>
                  <div>
                    <div className="label">{page.title || 'Untitled'}</div>
                  </div>
                </div>
              ))
            }
          </div>
        </>
      )}

    {/* Block context menu */}
    {blockCtxMenu && (
      <>
        <div style={{ position: 'fixed', inset: 0, zIndex: 998 }} onClick={() => { setBlockCtxMenu(null); setTimeout(() => { setBubbleMenuEnabled(true); bubbleMenuEnabledRef.current = true }, 100) }} />
        <div style={{ position: 'fixed', left: Math.min(blockCtxMenu.x, window.innerWidth - 210), top: Math.min(blockCtxMenu.y, window.innerHeight - 320), maxHeight: '320px', overflowY: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px', boxShadow: 'var(--shadow-lg)', zIndex: 999, minWidth: '190px' }} className="scale-in">
          <CtxItem onClick={() => { document.execCommand('copy'); setBlockCtxMenu(null) }}>📋 Copy</CtxItem>
          <CtxItem onClick={() => { document.execCommand('paste'); setBlockCtxMenu(null) }}>📄 Paste</CtxItem>
          <CtxItem onClick={() => { document.execCommand('cut'); setBlockCtxMenu(null) }}>✂️ Cut</CtxItem>
          <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
          <CtxItem onClick={() => { editor?.chain().focus().clearNodes().unsetAllMarks().run(); setBlockCtxMenu(null) }}>🧹 Clear formatting</CtxItem>
          <CtxItem danger onClick={() => {
            if (!editor) return
            const { from, to } = editor.state.selection
            if (from !== to) editor.chain().focus().deleteSelection().run()
            else {
              // Delete current block
              const pos = blockCtxMenu.pos
              const node = editor.state.doc.nodeAt(pos)
              if (node) editor.chain().focus().deleteRange({ from: pos, to: pos + node.nodeSize }).run()
            }
            setBlockCtxMenu(null)
          }}>🗑 Delete block</CtxItem>
        </div>
      </>
    )}
    </div>
  )

  // Fixed-position color pickers — rendered outside BubbleMenu/Tippy
  const colorPicker = showColorPicker && pickerPos ? (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={() => setShowColorPicker(false)} />
      <div style={{ position: 'fixed', left: pickerPos.x, top: pickerPos.y, background: 'white', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px', boxShadow: '0 4px 20px rgba(0,0,0,0.15)', zIndex: 9999 }}>
        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '8px', fontWeight: 500 }}>Text color</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', width: '156px' }}>
          {COLORS.map(col => (
            <button key={col.value || 'default'} title={col.label}
              onClick={() => { const sel = savedSelection.current; if (sel) { editor.chain().focus().setTextSelection(sel).run(); col.value ? editor.chain().setColor(col.value).run() : editor.chain().unsetColor().run() } setShowColorPicker(false); savedSelection.current = null }}
              style={{ width: '28px', height: '28px', borderRadius: '6px', background: col.value || '#37352f', border: '2px solid rgba(0,0,0,0.08)', cursor: 'pointer' }} />
          ))}
        </div>
      </div>
    </>
  ) : null

  const highlightPicker = showHighlightPicker && pickerPos ? (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={() => setShowHighlightPicker(false)} />
      <div style={{ position: 'fixed', left: pickerPos.x, top: pickerPos.y, background: 'white', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px', boxShadow: '0 4px 20px rgba(0,0,0,0.15)', zIndex: 9999 }}>
        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '8px', fontWeight: 500 }}>Highlight color</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', width: '156px' }}>
          {HIGHLIGHTS.map(h => (
            <button key={h.value || 'none'} title={h.label}
              onClick={() => { const sel = savedSelection.current; if (sel) { editor.chain().focus().setTextSelection(sel).run(); h.value ? editor.chain().setHighlight({ color: h.value }).run() : editor.chain().unsetHighlight().run() } setShowHighlightPicker(false); savedSelection.current = null }}
              style={{ width: '28px', height: '28px', borderRadius: '6px', background: h.value || '#e9e9e7', border: '2px solid rgba(0,0,0,0.08)', cursor: 'pointer' }} />
          ))}
        </div>
      </div>
    </>
  ) : null

  const aiMenu = showAiMenu && aiMenuPos ? (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 10000 }} onMouseDown={() => setShowAiMenu(false)} />
      <div style={{ position: 'fixed', left: aiMenuPos.x, top: aiMenuPos.y, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: 'var(--shadow-lg)', zIndex: 10001, minWidth: 160, padding: 4, whiteSpace: 'nowrap' }}>
        {[
          { id: 'improve',   label: '✍️ Improve writing' },
          { id: 'shorten',   label: '✂️ Make shorter' },
          { id: 'lengthen',  label: '📝 Make longer' },
          { id: 'formal',    label: '👔 More formal' },
          { id: 'casual',    label: '😊 More casual' },
          { id: 'translate', label: '🌐 Translate' },
        ].map(item => (
          <div key={item.id}
            onMouseDown={e => { e.preventDefault(); setShowAiMenu(false); runAI(item.id) }}
            style={{ padding: '6px 10px', borderRadius: 5, cursor: 'pointer', fontSize: 12, color: 'var(--text)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--accent-light)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
            {item.label}
          </div>
        ))}
      </div>
    </>
  ) : null

  const aiErrorToast = aiError ? (
    <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#2d1a1a', color: '#f87171', border: '1px solid #7f1d1d', borderRadius: 8, padding: '8px 16px', fontSize: 13, zIndex: 10002, boxShadow: 'var(--shadow-lg)', whiteSpace: 'nowrap' }}>
      ⚠️ {aiError}
    </div>
  ) : null

  return (
    <>
      {main}
      {colorPicker}
      {highlightPicker}
      {aiMenu}
      {aiErrorToast}
    </>
  )
}

function CtxItem({ onClick, children, danger }: { onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <div onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', borderRadius: '5px', cursor: 'pointer', fontSize: '13px', color: danger ? 'var(--red)' : 'var(--text)' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = danger ? '#fff0f0' : 'var(--sidebar-hover)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}>
      {children}
    </div>
  )
}
'use client'
import { useRef, useState, useCallback, useEffect } from 'react'
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
import SubpageBlock from './SubpageBlock'
import DatabaseBlock from './DatabaseBlock'
import Link from '@tiptap/extension-link'
import Youtube from '@tiptap/extension-youtube'
import HorizontalRule from '@tiptap/extension-horizontal-rule'
import TextAlign from '@tiptap/extension-text-align'
import Underline from '@tiptap/extension-underline'

// ── RESIZABLE IMAGE EXTENSION ──────────────────────────────────────────
function ResizableImageView({ node, updateAttributes }: any) {
  const [resizing, setResizing] = useState(false)
  const [startX, setStartX] = useState(0)
  const [startW, setStartW] = useState(0)
  const imgRef = useRef<HTMLImageElement>(null)
  const width = node.attrs.width || '100%'

  function onMouseDown(e: React.MouseEvent, side: 'left' | 'right') {
    e.preventDefault()
    setResizing(true)
    setStartX(e.clientX)
    setStartW(imgRef.current?.offsetWidth || 400)
    const onMove = (ev: MouseEvent) => {
      const diff = side === 'right' ? ev.clientX - e.clientX : e.clientX - ev.clientX
      const newW = Math.max(80, startW + diff)
      updateAttributes({ width: newW + 'px' })
    }
    const onUp = () => {
      setResizing(false)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <NodeViewWrapper style={{ display: 'inline-block', position: 'relative', maxWidth: '100%', lineHeight: 0 }}>
      <div style={{ position: 'relative', display: 'inline-block', width }}>
        <img
          ref={imgRef}
          src={node.attrs.src}
          alt={node.attrs.alt || ''}
          style={{ width: '100%', borderRadius: '6px', display: 'block', userSelect: 'none' }}
          draggable={false}
        />
        {/* Resize handles */}
        <div onMouseDown={e => onMouseDown(e, 'left')}
          style={{ position: 'absolute', left: -4, top: '50%', transform: 'translateY(-50%)', width: 8, height: 32, background: 'rgba(255,255,255,0.9)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'ew-resize', zIndex: 10 }} />
        <div onMouseDown={e => onMouseDown(e, 'right')}
          style={{ position: 'absolute', right: -4, top: '50%', transform: 'translateY(-50%)', width: 8, height: 32, background: 'rgba(255,255,255,0.9)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'ew-resize', zIndex: 10 }} />
      </div>
    </NodeViewWrapper>
  )
}

const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: { default: '100%', renderHTML: attrs => ({ width: attrs.width }) },
    }
  },
  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView)
  },
})

// ── CALLOUT EXTENSION ──────────────────────────────────────────────────
function CalloutView({ node, updateAttributes }: any) {
  const CALLOUT_ICONS = ['💡', '⚠️', '✅', '❌', '📌', '🔥', '💬', '📝']
  const [showPicker, setShowPicker] = useState(false)
  return (
    <NodeViewWrapper>
      <div style={{ background: 'var(--sidebar-bg)', border: '1px solid var(--border)', borderRadius: '6px', padding: '12px 16px', margin: '4px 0', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <span onClick={() => setShowPicker(o => !o)} style={{ fontSize: '20px', cursor: 'pointer', userSelect: 'none', lineHeight: 1.4 }}>
            {node.attrs.emoji || '💡'}
          </span>
          {showPicker && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setShowPicker(false)} />
              <div style={{ position: 'absolute', top: '28px', left: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px', boxShadow: 'var(--shadow-lg)', zIndex: 100, display: 'flex', gap: '4px', flexWrap: 'wrap', width: '140px' }}>
                {CALLOUT_ICONS.map(ic => (
                  <span key={ic} onClick={() => { updateAttributes({ emoji: ic }); setShowPicker(false) }}
                    style={{ fontSize: '18px', cursor: 'pointer', padding: '3px', borderRadius: '4px' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}>
                    {ic}
                  </span>
                ))}
              </div>
            </>
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
          ? <div style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>No headings yet</div>
          : headings.map((h, i) => (
            <div key={i} style={{ fontSize: '13px', color: 'var(--text-secondary)', paddingLeft: `${(h.level - 1) * 12}px`, marginBottom: '3px', cursor: 'pointer' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--accent)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)' }}>
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
  { id: 'image', label: 'Image', hint: 'Upload or embed URL', icon: '🖼', section: 'Media' },
  { id: 'video', label: 'YouTube', hint: 'Embed a video', icon: '▶', section: 'Media' },
  { id: 'subpage', label: 'Sub-page', hint: 'Embed a linked page', icon: '📄', section: 'Advanced' },
  { id: 'database', label: 'Database', hint: 'Embed a database', icon: '🗄️', section: 'Advanced' },
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

type Props = {
  content: any
  editable: boolean
  onUpdate: (content: any) => void
  onEditorReady?: (editor: any) => void
}

export default function Editor({ content, editable, onUpdate, onEditorReady }: Props) {
  const [slashMenu, setSlashMenu] = useState<{ x: number; y: number; query: string; fromPos: number } | null>(null)
  const [slashIndex, setSlashIndex] = useState(0)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [showHighlightPicker, setShowHighlightPicker] = useState(false)
  const slashQueryRef = useRef('')

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Placeholder.configure({
        placeholder: ({ node }) => node.type.name === 'heading' ? 'Heading' : "Type '/' for commands…"
      }),
      Typography,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow, TableCell, TableHeader,
      ResizableImage,
      Link.configure({ openOnClick: true, autolink: true }),
      Youtube.configure({ controls: true, width: 640, height: 360 }),
      HorizontalRule,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Underline,
      CalloutExtension,
      TocExtension,
      SubpageExtension,
      DatabaseBlockExtension,
    ],
    content: content || '',
    editable,
    onUpdate: ({ editor }) => onUpdate(editor.getJSON()),
    onCreate: ({ editor }) => { if (onEditorReady) onEditorReady(editor) },
    editorProps: {
      handleKeyDown(view, event) {
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
      case 'todo': editor.chain().focus().toggleTaskList().run(); break
      case 'quote': editor.chain().focus().toggleBlockquote().run(); break
      case 'callout': editor.chain().focus().insertContent({ type: 'callout', content: [{ type: 'text', text: ' ' }] }).run(); break
      case 'code': editor.chain().focus().toggleCodeBlock().run(); break
      case 'divider': editor.chain().focus().setHorizontalRule().run(); break
      case 'toc': editor.chain().focus().insertContent({ type: 'toc' }).run(); break
      case 'table': editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(); break
      case 'image': {
        const url = window.prompt('Image URL:')
        if (url) editor.chain().focus().setImage({ src: url }).run()
        break
      }
      case 'video': {
        const url = window.prompt('YouTube URL:')
        if (url) editor.chain().focus().setYoutubeVideo({ src: url }).run()
        break
      }
      case 'subpage': {
        const pageId = window.prompt('Page ID (copy from the page URL):')
        if (pageId) editor.chain().focus().insertContent({ type: 'subpage', attrs: { pageId: pageId.trim(), expanded: true } }).run()
        break
      }
      case 'database': {
        const pageId = window.prompt('Database page ID (copy from the URL):')
        if (pageId) editor.chain().focus().insertContent({ type: 'databaseBlock', attrs: { pageId: pageId.trim(), view: 'table', collapsed: false } }).run()
        break
      }
    }
  }

  // Image drag & drop / paste
  const handleDrop = useCallback((e: React.DragEvent) => {
    if (!editable || !editor) return
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))
    if (!files.length) return
    e.preventDefault()
    files.forEach(file => {
      const reader = new FileReader()
      reader.onload = ev => { if (ev.target?.result) editor.chain().focus().setImage({ src: ev.target.result as string }).run() }
      reader.readAsDataURL(file)
    })
  }, [editor, editable])

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    if (!editable || !editor) return
    const files = Array.from(e.clipboardData.files).filter(f => f.type.startsWith('image/'))
    if (!files.length) return
    files.forEach(file => {
      const reader = new FileReader()
      reader.onload = ev => { if (ev.target?.result) editor.chain().focus().setImage({ src: ev.target.result as string }).run() }
      reader.readAsDataURL(file)
    })
  }, [editor, editable])

  if (!editor) return null

  const items = getItems(slashMenu?.query || '')
  let lastSection = ''

  return (
    <div style={{ position: 'relative' }} onDrop={handleDrop} onDragOver={e => e.preventDefault()} onPaste={handlePaste}>
      {/* Floating bubble menu on selection */}
      <BubbleMenu editor={editor} tippyOptions={{ duration: 100, placement: 'top' }}>
        <div className="floating-toolbar">
          <FBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')}><b>B</b></FBtn>
          <FBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')}><i>I</i></FBtn>
          <FBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')}><u>U</u></FBtn>
          <FBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')}><s>S</s></FBtn>
          <FBtn onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive('code')}>{'`'}</FBtn>
          <div className="floating-sep" />
          {/* Color */}
          <div style={{ position: 'relative' }}>
            <FBtn onClick={() => { setShowColorPicker(o => !o); setShowHighlightPicker(false) }} active={showColorPicker}>
              <span style={{ borderBottom: `2px solid ${editor.getAttributes('textStyle').color || '#37352f'}` }}>A</span>
            </FBtn>
            {showColorPicker && (
              <div style={{ position: 'absolute', bottom: '40px', left: '-40px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px', boxShadow: 'var(--shadow-lg)', zIndex: 200, display: 'flex', flexWrap: 'wrap', gap: '4px', width: '160px' }}>
                {COLORS.map(col => (
                  <button key={col.value} title={col.label}
                    onClick={() => { col.value ? editor.chain().focus().setColor(col.value).run() : editor.chain().focus().unsetColor().run(); setShowColorPicker(false) }}
                    style={{ width: '22px', height: '22px', borderRadius: '50%', background: col.value || '#37352f', border: `2px solid ${col.value === (editor.getAttributes('textStyle').color || '') ? 'var(--accent)' : 'var(--border)'}`, cursor: 'pointer' }} />
                ))}
              </div>
            )}
          </div>
          {/* Highlight */}
          <div style={{ position: 'relative' }}>
            <FBtn onClick={() => { setShowHighlightPicker(o => !o); setShowColorPicker(false) }} active={showHighlightPicker}>
              <span style={{ background: '#fdf3a7', padding: '0 2px', borderRadius: '2px' }}>H</span>
            </FBtn>
            {showHighlightPicker && (
              <div style={{ position: 'absolute', bottom: '40px', left: '-40px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px', boxShadow: 'var(--shadow-lg)', zIndex: 200, display: 'flex', flexWrap: 'wrap', gap: '4px', width: '160px' }}>
                {HIGHLIGHTS.map(h => (
                  <button key={h.value} title={h.label}
                    onClick={() => { h.value ? editor.chain().focus().setHighlight({ color: h.value }).run() : editor.chain().focus().unsetHighlight().run(); setShowHighlightPicker(false) }}
                    style={{ width: '22px', height: '22px', borderRadius: '4px', background: h.value || '#e9e9e7', border: '1px solid var(--border)', cursor: 'pointer' }} />
                ))}
              </div>
            )}
          </div>
          <div className="floating-sep" />
          <FBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })}>H1</FBtn>
          <FBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })}>H2</FBtn>
          <div className="floating-sep" />
          <FBtn onClick={() => {
            const prev = editor.getAttributes('link').href
            const url = window.prompt('URL:', prev || 'https://')
            if (url === null) return
            url === '' ? editor.chain().focus().unsetLink().run() : editor.chain().focus().setLink({ href: url }).run()
          }} active={editor.isActive('link')}>🔗</FBtn>
          <div className="floating-sep" />
          <FBtn onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })}>⬅</FBtn>
          <FBtn onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })}>↔</FBtn>
          <FBtn onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })}>➡</FBtn>
        </div>
      </BubbleMenu>

      <EditorContent editor={editor} />

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
    </div>
  )
}

function FBtn({ onClick, active, children }: { onClick: () => void; active: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`floating-btn ${active ? 'active' : ''}`}>
      {children}
    </button>
  )
}

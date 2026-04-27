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
function ResizableImageView({ node, updateAttributes, selected }: any) {
  const [loaded, setLoaded] = useState(false)
  const width = node.attrs.width || '100%'
  const align = node.attrs.align || 'left'

  const alignStyle: React.CSSProperties =
    align === 'center' ? { marginLeft: 'auto', marginRight: 'auto' } :
    align === 'right'  ? { marginLeft: 'auto' } : {}

  return (
    <NodeViewWrapper style={{ display: 'block', position: 'relative', maxWidth: '100%', lineHeight: 0, margin: '4px 0' }}>
      <div style={{ position: 'relative', display: 'block', width, ...alignStyle }}>
        {!loaded && <div style={{ width: '100%', height: '120px', background: 'var(--border)', borderRadius: '6px' }} />}
        <img
          src={node.attrs.src}
          alt={node.attrs.alt || ''}
          onLoad={() => setLoaded(true)}
          style={{ width: '100%', borderRadius: '6px', display: loaded ? 'block' : 'none', userSelect: 'none' }}
          draggable={false}
        />
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

function FBtn({ onClick, active, children, title, btnRef }: { onClick?: () => void; active: boolean; children: React.ReactNode; title?: string; btnRef?: React.RefObject<HTMLButtonElement | null> }) {
  return (
    <button
      ref={btnRef as React.RefObject<HTMLButtonElement>}
      onClick={onClick}
      data-tip={title}
      className={`floating-btn ${active ? 'active' : ''}`}>
      {children}
    </button>
  )
}

export default function Editor({ content, editable, onUpdate, onEditorReady }: Props) {
  const [slashMenu, setSlashMenu] = useState<{ x: number; y: number; query: string; fromPos: number } | null>(null)
  const [slashIndex, setSlashIndex] = useState(0)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [showHighlightPicker, setShowHighlightPicker] = useState(false)
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
        // Store cleanup for later
        ;(editor as any)._imageCleanup = () => window.removeEventListener('canopy:insertImage', onInsert)
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
        }
      },
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
        const url = window.prompt('YouTube URL:')
        if (url) editor.chain().focus().setYoutubeVideo({ src: url }).run()
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

  const main = (
    <div style={{ position: 'relative' }} onDrop={handleDrop} onDragOver={e => e.preventDefault()} onPaste={handlePaste}>
      {/* Floating bubble menu on selection */}
      <BubbleMenu editor={editor} tippyOptions={{ duration: 100, placement: 'top', interactive: true, hideOnClick: false }}
        shouldShow={({ editor }) => {
          if (!bubbleMenuEnabledRef.current) return false
          return editor.isActive('image') || (!editor.state.selection.empty)
        }}>
        <div className="floating-toolbar" style={{ overflowX: 'auto', maxWidth: 'calc(100vw - 32px)', flexWrap: 'nowrap' }}>
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
          {/* Text formatting */}
          <FBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title='Bold'><b>B</b></FBtn>
          <FBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title='Italic'><i>I</i></FBtn>
          <FBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title='Underline'><u>U</u></FBtn>
          <FBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title='Strikethrough'><s>S</s></FBtn>
          <FBtn onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive('code')} title='Inline code'>{'`'}</FBtn>
          <div className="floating-sep" />
          {/* Text color trigger */}
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
          {/* Highlight trigger */}
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
          {/* Block types */}
          <FBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} title='Heading 1'>H1</FBtn>
          <FBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title='Heading 2'>H2</FBtn>
          <FBtn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title='Heading 3'>H3</FBtn>
          <FBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title='Bullet list'>•</FBtn>
          <FBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title='Numbered list'>1.</FBtn>
          <FBtn onClick={() => editor.chain().focus().toggleTaskList().run()} active={editor.isActive('taskList')} title='To-do list'>☑</FBtn>
          <FBtn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title='Quote'>❝</FBtn>
          <FBtn onClick={() => editor.chain().focus().insertContent({ type: 'callout', content: [{ type: 'text', text: ' ' }] }).run()} active={false}>💡</FBtn>
          <FBtn onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive('codeBlock')} title='Code block'>{'<>'}</FBtn>
          <div className="floating-sep" />
          {/* Link */}
          <FBtn onClick={() => {
            const prev = editor.getAttributes('link').href
            const url = window.prompt('URL:', prev || 'https://')
            if (url === null) return
            url === '' ? editor.chain().focus().unsetLink().run() : editor.chain().focus().setLink({ href: url }).run()
          }} active={editor.isActive('link')} title='Link'>🔗</FBtn>
          <div className="floating-sep" />
          {/* Alignment */}
          <FBtn onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} title='Align left'>⬅</FBtn>
          <FBtn onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} title='Center'>↔</FBtn>
          <FBtn onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} title='Align right'>➡</FBtn>
          </>}
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
    {/* Block context menu */}
    {blockCtxMenu && (
      <>
        <div style={{ position: 'fixed', inset: 0, zIndex: 998 }} onClick={() => { setBlockCtxMenu(null); setTimeout(() => { setBubbleMenuEnabled(true); bubbleMenuEnabledRef.current = true }, 100) }} />
        <div style={{ position: 'fixed', left: Math.min(blockCtxMenu.x, window.innerWidth - 210), top: Math.min(blockCtxMenu.y, window.innerHeight - 320), maxHeight: '320px', overflowY: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px', boxShadow: 'var(--shadow-lg)', zIndex: 999, minWidth: '190px' }} className="scale-in">
          <CtxItem onClick={() => { document.execCommand('copy'); setBlockCtxMenu(null) }}>📋 Copy</CtxItem>
          <CtxItem onClick={() => { document.execCommand('paste'); setBlockCtxMenu(null) }}>📋 Paste</CtxItem>
          <CtxItem onClick={() => { document.execCommand('cut'); setBlockCtxMenu(null) }}>✂️ Cut</CtxItem>
          <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
          <CtxItem onClick={() => { editor?.chain().focus().clearNodes().unsetAllMarks().run(); setBlockCtxMenu(null) }}><span style={{fontSize:'15px', fontWeight:'bold'}}>✕</span> Clear formatting</CtxItem>
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

  return (
    <>
      {main}
      {colorPicker}
      {highlightPicker}
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
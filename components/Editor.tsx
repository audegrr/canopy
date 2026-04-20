'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useEditor, EditorContent, BubbleMenu } from '@tiptap/react'
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
import Link from '@tiptap/extension-link'
import Youtube from '@tiptap/extension-youtube'
import HorizontalRule from '@tiptap/extension-horizontal-rule'
import TextAlign from '@tiptap/extension-text-align'
import Underline from '@tiptap/extension-underline'

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

const SLASH_ITEMS = [
  { id: 'h1', label: 'Heading 1', hint: 'Big section heading', icon: 'H1', section: 'Basic blocks' },
  { id: 'h2', label: 'Heading 2', hint: 'Medium heading', icon: 'H2', section: 'Basic blocks' },
  { id: 'h3', label: 'Heading 3', hint: 'Small heading', icon: 'H3', section: 'Basic blocks' },
  { id: 'bullet', label: 'Bulleted list', hint: 'Simple bullet list', icon: '•', section: 'Basic blocks' },
  { id: 'numbered', label: 'Numbered list', hint: 'Numbered list', icon: '1.', section: 'Basic blocks' },
  { id: 'todo', label: 'To-do list', hint: 'Track tasks with checkboxes', icon: '☑', section: 'Basic blocks' },
  { id: 'quote', label: 'Quote', hint: 'Capture a quote', icon: '❝', section: 'Basic blocks' },
  { id: 'callout', label: 'Callout', hint: 'Make writing stand out', icon: '💡', section: 'Basic blocks' },
  { id: 'code', label: 'Code block', hint: 'Capture a code snippet', icon: '<>', section: 'Basic blocks' },
  { id: 'divider', label: 'Divider', hint: 'Visual divider', icon: '—', section: 'Basic blocks' },
  { id: 'toc', label: 'Table of contents', hint: 'Show page headings', icon: '≡', section: 'Advanced' },
  { id: 'table', label: 'Table', hint: 'Insert a table', icon: '⊞', section: 'Advanced' },
  { id: 'image', label: 'Image', hint: 'Upload or embed', icon: '🖼', section: 'Media' },
  { id: 'video', label: 'YouTube', hint: 'Embed a video', icon: '▶', section: 'Media' },
]

type Props = {
  content: any
  editable: boolean
  onUpdate: (content: any) => void
}

export default function Editor({ content, editable, onUpdate }: Props) {
  const [slashMenu, setSlashMenu] = useState<{ x: number; y: number; query: string; fromPos: number } | null>(null)
  const [slashIndex, setSlashIndex] = useState(0)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [showHighlightPicker, setShowHighlightPicker] = useState(false)
  const [toc, setToc] = useState<{ level: number; text: string; id: string }[]>([])
  const slashQueryRef = useRef('')
  const menuRef = useRef<HTMLDivElement>(null)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Placeholder.configure({
        placeholder: ({ node }) => {
          if (node.type.name === 'heading') return 'Heading'
          return "Type '/' for commands…"
        }
      }),
      Typography,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow, TableCell, TableHeader,
      Image.configure({ inline: false, allowBase64: true }),
      Link.configure({ openOnClick: true, autolink: true }),
      Youtube.configure({ controls: true, width: 640, height: 360 }),
      HorizontalRule,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Underline,
    ],
    content: content || '',
    editable,
    onUpdate: ({ editor }) => {
      onUpdate(editor.getJSON())
      // Update TOC
      const headings: typeof toc = []
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'heading') {
          headings.push({ level: node.attrs.level, text: node.textContent, id: `h-${pos}` })
        }
      })
      setToc(headings)
    },
    editorProps: {
      handleKeyDown(view, event) {
        if (event.key === '/') {
          const { from } = view.state.selection
          const domPos = view.coordsAtPos(from)
          setSlashMenu({ x: domPos.left, y: domPos.bottom + 8, query: '', fromPos: from })
          slashQueryRef.current = ''
          setSlashIndex(0)
          return false
        }
        if (slashMenu) {
          if (event.key === 'Escape') { setSlashMenu(null); return true }
          if (event.key === 'ArrowDown') {
            setSlashIndex(i => (i + 1) % getFilteredItems(slashQueryRef.current).length)
            return true
          }
          if (event.key === 'ArrowUp') {
            setSlashIndex(i => (i - 1 + getFilteredItems(slashQueryRef.current).length) % getFilteredItems(slashQueryRef.current).length)
            return true
          }
          if (event.key === 'Enter') {
            const items = getFilteredItems(slashQueryRef.current)
            if (items[slashIndex]) {
              executeCommand(items[slashIndex].id, slashMenu.fromPos, slashQueryRef.current)
              return true
            }
          }
          if (event.key === 'Backspace') {
            if (slashQueryRef.current.length === 0) {
              setSlashMenu(null)
            } else {
              slashQueryRef.current = slashQueryRef.current.slice(0, -1)
              setSlashMenu(m => m ? { ...m, query: slashQueryRef.current } : null)
              setSlashIndex(0)
            }
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

  // Handle image upload by drag & drop onto editor
  const handleEditorDrop = useCallback((e: React.DragEvent) => {
    if (!editable || !editor) return
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))
    if (!files.length) return
    e.preventDefault()
    files.forEach(file => {
      const reader = new FileReader()
      reader.onload = ev => {
        if (ev.target?.result) {
          editor.chain().focus().setImage({ src: ev.target.result as string }).run()
        }
      }
      reader.readAsDataURL(file)
    })
  }, [editor, editable])

  // Handle paste images
  const handleEditorPaste = useCallback((e: React.ClipboardEvent) => {
    if (!editable || !editor) return
    const files = Array.from(e.clipboardData.files).filter(f => f.type.startsWith('image/'))
    if (!files.length) return
    files.forEach(file => {
      const reader = new FileReader()
      reader.onload = ev => {
        if (ev.target?.result) {
          editor.chain().focus().setImage({ src: ev.target.result as string }).run()
        }
      }
      reader.readAsDataURL(file)
    })
  }, [editor, editable])

  function getFilteredItems(query: string) {
    if (!query) return SLASH_ITEMS
    return SLASH_ITEMS.filter(i => i.label.toLowerCase().includes(query.toLowerCase()))
  }

  function executeCommand(id: string, fromPos: number, query: string) {
    if (!editor) return
    setSlashMenu(null)
    // Delete the /query text
    const deleteFrom = fromPos - query.length - 1
    const deleteTo = fromPos + query.length
    editor.chain().focus().deleteRange({ from: deleteFrom, to: editor.state.selection.from }).run()

    switch (id) {
      case 'h1': editor.chain().focus().toggleHeading({ level: 1 }).run(); break
      case 'h2': editor.chain().focus().toggleHeading({ level: 2 }).run(); break
      case 'h3': editor.chain().focus().toggleHeading({ level: 3 }).run(); break
      case 'bullet': editor.chain().focus().toggleBulletList().run(); break
      case 'numbered': editor.chain().focus().toggleOrderedList().run(); break
      case 'todo': editor.chain().focus().toggleTaskList().run(); break
      case 'quote': editor.chain().focus().toggleBlockquote().run(); break
      case 'callout':
        editor.chain().focus().insertContent('<p>💡 </p>').run()
        break
      case 'code': editor.chain().focus().toggleCodeBlock().run(); break
      case 'divider': editor.chain().focus().setHorizontalRule().run(); break
      case 'toc':
        editor.chain().focus().insertContent('<p>≡ <em>Table of contents</em></p>').run()
        break
      case 'table':
        editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
        break
      case 'image': {
        const url = window.prompt('Image URL (or leave empty to upload):')
        if (url) editor.chain().focus().setImage({ src: url }).run()
        break
      }
      case 'video': {
        const url = window.prompt('YouTube URL:')
        if (url) editor.chain().focus().setYoutubeVideo({ src: url }).run()
        break
      }
    }
  }

  if (!editor) return null

  const filteredItems = getFilteredItems(slashMenu?.query || '')
  let lastSection = ''

  return (
    <div
      style={{ position: 'relative' }}
      onDrop={handleEditorDrop}
      onDragOver={e => e.preventDefault()}
      onPaste={handleEditorPaste}
    >
      {/* Bubble menu — appears on text selection */}
      <BubbleMenu editor={editor} tippyOptions={{ duration: 100, placement: 'top' }}>
        <div className="floating-toolbar">
          <FBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold"><b>B</b></FBtn>
          <FBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic"><i>I</i></FBtn>
          <FBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Underline"><u>U</u></FBtn>
          <FBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Strikethrough"><s>S</s></FBtn>
          <FBtn onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive('code')} title="Code">{'`'}</FBtn>
          <div className="floating-sep" />
          {/* Text color */}
          <div style={{ position: 'relative' }}>
            <FBtn onClick={() => { setShowColorPicker(o => !o); setShowHighlightPicker(false) }} active={showColorPicker} title="Text color">
              <span style={{ borderBottom: `2px solid ${editor.getAttributes('textStyle').color || '#37352f'}` }}>A</span>
            </FBtn>
            {showColorPicker && (
              <div style={{ position: 'absolute', bottom: '40px', left: '-40px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px', boxShadow: 'var(--shadow-lg)', zIndex: 200, display: 'flex', flexWrap: 'wrap', gap: '4px', width: '160px' }}>
                {COLORS.map(col => (
                  <button key={col.value} title={col.label}
                    onClick={() => { col.value ? editor.chain().focus().setColor(col.value).run() : editor.chain().focus().unsetColor().run(); setShowColorPicker(false) }}
                    style={{ width: '22px', height: '22px', borderRadius: '50%', background: col.value || '#37352f', border: col.value === (editor.getAttributes('textStyle').color || '') ? '2px solid var(--accent)' : '1px solid var(--border)', cursor: 'pointer' }} />
                ))}
              </div>
            )}
          </div>
          {/* Highlight */}
          <div style={{ position: 'relative' }}>
            <FBtn onClick={() => { setShowHighlightPicker(o => !o); setShowColorPicker(false) }} active={showHighlightPicker} title="Highlight">
              <span style={{ background: '#fdf3a7', padding: '0 2px' }}>H</span>
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
          <FBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} title="H1">H1</FBtn>
          <FBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="H2">H2</FBtn>
          <div className="floating-sep" />
          <FBtn onClick={() => {
            const prev = editor.getAttributes('link').href
            const url = window.prompt('URL:', prev || 'https://')
            if (url === null) return
            if (url === '') { editor.chain().focus().unsetLink().run(); return }
            editor.chain().focus().setLink({ href: url }).run()
          }} active={editor.isActive('link')} title="Link">🔗</FBtn>
          <div className="floating-sep" />
          <FBtn onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} title="Align left">⬅</FBtn>
          <FBtn onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} title="Center">↔</FBtn>
          <FBtn onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} title="Align right">➡</FBtn>
        </div>
      </BubbleMenu>

      <EditorContent editor={editor} />

      {/* Slash command menu */}
      {slashMenu && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 998 }} onClick={() => setSlashMenu(null)} />
          <div
            ref={menuRef}
            className="slash-menu fade-in"
            style={{
              position: 'fixed',
              left: Math.min(slashMenu.x, (typeof window !== 'undefined' ? window.innerWidth : 800) - 260),
              top: slashMenu.y,
              zIndex: 999
            }}
          >
            {filteredItems.length === 0 && (
              <div style={{ padding: '10px 12px', color: 'var(--text-tertiary)', fontSize: '13px' }}>No results</div>
            )}
            {filteredItems.map((item, i) => {
              const showSec = item.section !== lastSection
              lastSection = item.section
              return (
                <div key={item.id}>
                  {showSec && <div className="slash-menu-section">{item.section}</div>}
                  <div
                    className={`slash-menu-item ${i === slashIndex ? 'active' : ''}`}
                    onMouseEnter={() => setSlashIndex(i)}
                    onClick={() => executeCommand(item.id, slashMenu.fromPos, slashMenu.query)}
                  >
                    <div className="icon">{item.icon}</div>
                    <div>
                      <div className="label">{item.label}</div>
                      <div className="hint">{item.hint}</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

function FBtn({ onClick, active, title, children }: { onClick: () => void; active: boolean; title: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={title} className={`floating-btn ${active ? 'active' : ''}`}>
      {children}
    </button>
  )
}

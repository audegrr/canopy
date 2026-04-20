'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useEditor, EditorContent, BubbleMenu, FloatingMenu } from '@tiptap/react'
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
  { label: 'Default', value: 'inherit' },
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
}

export default function Editor({ content, editable, onUpdate }: Props) {
  const [slashMenu, setSlashMenu] = useState<{ x: number; y: number; query: string } | null>(null)
  const [slashIndex, setSlashIndex] = useState(0)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const slashRef = useRef<string>('')

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Placeholder.configure({ placeholder: "Type '/' for commands…" }),
      Typography,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      Image.configure({ inline: false, allowBase64: true }),
      Link.configure({ openOnClick: true, autolink: true }),
      Youtube.configure({ controls: true }),
      HorizontalRule,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Underline,
    ],
    content: content || '',
    editable,
    onUpdate: ({ editor }) => {
      onUpdate(editor.getJSON())
    },
    editorProps: {
      handleKeyDown(view, event) {
        if (event.key === '/') {
          const { from } = view.state.selection
          const coords = view.coordsAtPos(from)
          setSlashMenu({ x: coords.left, y: coords.bottom + 8, query: '' })
          slashRef.current = ''
          return false
        }
        if (slashMenu) {
          if (event.key === 'Escape') { setSlashMenu(null); return true }
          if (event.key === 'ArrowDown') { setSlashIndex(i => (i + 1) % getSlashItems(slashMenu.query).length); return true }
          if (event.key === 'ArrowUp') { setSlashIndex(i => (i - 1 + getSlashItems(slashMenu.query).length) % getSlashItems(slashMenu.query).length); return true }
          if (event.key === 'Enter') {
            const items = getSlashItems(slashMenu.query)
            if (items[slashIndex]) { executeSlashCommand(items[slashIndex].id); return true }
          }
          if (event.key.length === 1) {
            slashRef.current += event.key
            setSlashMenu(m => m ? { ...m, query: slashRef.current } : null)
          }
          if (event.key === 'Backspace') {
            if (slashRef.current.length === 0) setSlashMenu(null)
            else { slashRef.current = slashRef.current.slice(0, -1); setSlashMenu(m => m ? { ...m, query: slashRef.current } : null) }
          }
        }
        return false
      },
    },
  })

  function getSlashItems(query: string) {
    const items = [
      { id: 'h1', label: 'Heading 1', hint: 'Big section heading', icon: 'H1', section: 'Basic blocks' },
      { id: 'h2', label: 'Heading 2', hint: 'Medium section heading', icon: 'H2', section: 'Basic blocks' },
      { id: 'h3', label: 'Heading 3', hint: 'Small section heading', icon: 'H3', section: 'Basic blocks' },
      { id: 'bullet', label: 'Bulleted list', hint: 'Simple bullet list', icon: '•', section: 'Basic blocks' },
      { id: 'numbered', label: 'Numbered list', hint: 'Numbered list', icon: '1.', section: 'Basic blocks' },
      { id: 'todo', label: 'To-do list', hint: 'Track tasks', icon: '☑', section: 'Basic blocks' },
      { id: 'quote', label: 'Quote', hint: 'Blockquote', icon: '❝', section: 'Basic blocks' },
      { id: 'code', label: 'Code block', hint: 'Code snippet', icon: '<>', section: 'Basic blocks' },
      { id: 'divider', label: 'Divider', hint: 'Horizontal rule', icon: '—', section: 'Basic blocks' },
      { id: 'table', label: 'Table', hint: 'Insert a table', icon: '⊞', section: 'Advanced' },
      { id: 'image', label: 'Image', hint: 'Insert from URL', icon: '🖼', section: 'Media' },
      { id: 'video', label: 'YouTube', hint: 'Embed a video', icon: '▶', section: 'Media' },
    ]
    if (!query) return items
    return items.filter(i => i.label.toLowerCase().includes(query.toLowerCase()))
  }

  function executeSlashCommand(id: string) {
    if (!editor) return
    setSlashMenu(null)
    // Delete the slash character
    editor.commands.deleteRange({ from: editor.state.selection.from - slashRef.current.length - 1, to: editor.state.selection.from })
    switch (id) {
      case 'h1': editor.chain().focus().toggleHeading({ level: 1 }).run(); break
      case 'h2': editor.chain().focus().toggleHeading({ level: 2 }).run(); break
      case 'h3': editor.chain().focus().toggleHeading({ level: 3 }).run(); break
      case 'bullet': editor.chain().focus().toggleBulletList().run(); break
      case 'numbered': editor.chain().focus().toggleOrderedList().run(); break
      case 'todo': editor.chain().focus().toggleTaskList().run(); break
      case 'quote': editor.chain().focus().toggleBlockquote().run(); break
      case 'code': editor.chain().focus().toggleCodeBlock().run(); break
      case 'divider': editor.chain().focus().setHorizontalRule().run(); break
      case 'table': editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(); break
      case 'image': {
        const url = prompt('Image URL:')
        if (url) editor.chain().focus().setImage({ src: url }).run()
        break
      }
      case 'video': {
        const url = prompt('YouTube URL:')
        if (url) editor.chain().focus().setYoutubeVideo({ src: url }).run()
        break
      }
    }
  }

  if (!editor) return null

  return (
    <div style={{ position: 'relative' }}>
      {/* Bubble menu (selection toolbar) */}
      <BubbleMenu editor={editor} tippyOptions={{ duration: 100 }}>
        <div className="floating-toolbar">
          <FBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold"><b>B</b></FBtn>
          <FBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic"><i>I</i></FBtn>
          <FBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Strike"><s>S</s></FBtn>
          <FBtn onClick={() => editor.chain().focus().toggleUnderline?.().run()} active={editor.isActive('underline')} title="Underline"><u>U</u></FBtn>
          <FBtn onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive('code')} title="Code">{'<>'}</FBtn>
          <div className="floating-sep" />
          <FBtn onClick={() => editor.chain().focus().toggleHighlight({ color: '#fdf3a7' }).run()} active={editor.isActive('highlight')} title="Highlight">A</FBtn>
          <div style={{ position: 'relative' }}>
            <FBtn onClick={() => setShowColorPicker(o => !o)} title="Text color" active={showColorPicker}>A</FBtn>
            {showColorPicker && (
              <div style={{ position: 'absolute', bottom: '36px', left: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px', boxShadow: 'var(--shadow-lg)', zIndex: 100, display: 'flex', flexWrap: 'wrap', gap: '4px', width: '140px' }}>
                {COLORS.map(c => (
                  <div key={c.value} onClick={() => { editor.chain().focus().setColor(c.value).run(); setShowColorPicker(false) }}
                    style={{ width: '20px', height: '20px', borderRadius: '50%', background: c.value === 'inherit' ? '#37352f' : c.value, cursor: 'pointer', border: '1px solid var(--border)' }}
                    title={c.label} />
                ))}
              </div>
            )}
          </div>
          <div className="floating-sep" />
          <FBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} title="H1">H1</FBtn>
          <FBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="H2">H2</FBtn>
          <div className="floating-sep" />
          <FBtn onClick={() => { const url = prompt('URL:'); if (url) editor.chain().focus().setLink({ href: url }).run() }} active={editor.isActive('link')} title="Link">🔗</FBtn>
        </div>
      </BubbleMenu>

      <EditorContent editor={editor} />

      {/* Slash command menu */}
      {slashMenu && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setSlashMenu(null)} />
          <div className="slash-menu fade-in"
            style={{ position: 'fixed', left: Math.min(slashMenu.x, window.innerWidth - 260), top: slashMenu.y, zIndex: 1000 }}>
            {(() => {
              const items = getSlashItems(slashMenu.query)
              let lastSection = ''
              return items.map((item, i) => {
                const showSection = item.section !== lastSection
                lastSection = item.section
                return (
                  <div key={item.id}>
                    {showSection && <div className="slash-menu-section">{item.section}</div>}
                    <div className={`slash-menu-item ${i === slashIndex ? 'active' : ''}`}
                      onClick={() => executeSlashCommand(item.id)}>
                      <div className="icon">{item.icon}</div>
                      <div>
                        <div className="label">{item.label}</div>
                        <div className="hint">{item.hint}</div>
                      </div>
                    </div>
                  </div>
                )
              })
            })()}
          </div>
        </>
      )}
    </div>
  )
}

function FBtn({ onClick, active, title, children }: any) {
  return (
    <button onClick={onClick} title={title} className={`floating-btn ${active ? 'active' : ''}`}>
      {children}
    </button>
  )
}

'use client'
import { useEffect, useState, useRef } from 'react'

const COMMANDS = [
  { id: 'h1', icon: 'H1', label: 'Heading 1', desc: 'Big section heading' },
  { id: 'h2', icon: 'H2', label: 'Heading 2', desc: 'Medium section heading' },
  { id: 'h3', icon: 'H3', label: 'Heading 3', desc: 'Small section heading' },
  { id: 'bullet', icon: '•', label: 'Bulleted list', desc: 'Simple bullet list' },
  { id: 'numbered', icon: '1.', label: 'Numbered list', desc: 'Ordered list' },
  { id: 'todo', icon: '☑', label: 'To-do list', desc: 'Checkboxes' },
  { id: 'quote', icon: '❝', label: 'Quote', desc: 'Blockquote' },
  { id: 'divider', icon: '—', label: 'Divider', desc: 'Horizontal line' },
  { id: 'table', icon: '⊞', label: 'Table', desc: '3×3 table' },
  { id: 'code', icon: '</>', label: 'Code block', desc: 'Code with syntax highlighting' },
  { id: 'image', icon: '⬚', label: 'Image', desc: 'Insert an image by URL' },
]

export default function SlashMenu({ query, position, onSelect, onClose }: {
  query: string
  position: { x: number; y: number }
  onSelect: (cmd: string) => void
  onClose: () => void
}) {
  const [active, setActive] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  const filtered = COMMANDS.filter(c =>
    !query || c.label.toLowerCase().includes(query.toLowerCase())
  )

  useEffect(() => { setActive(0) }, [query])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, filtered.length - 1)) }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
      if (e.key === 'Enter') { e.preventDefault(); if (filtered[active]) onSelect(filtered[active].id) }
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [filtered, active])

  if (!filtered.length) return null

  // Position: try to stay within viewport
  const x = Math.min(position.x, window.innerWidth - 240)
  const y = Math.min(position.y, window.innerHeight - 340)

  return (
    <div ref={ref} className="slash-menu fade-in" style={{ position: 'fixed', left: x, top: y }}>
      <div style={{ padding: '4px 8px 6px', fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 500 }}>
        {query ? `"${query}"` : 'Basic blocks'}
      </div>
      {filtered.map((cmd, i) => (
        <div key={cmd.id} className={`slash-menu-item ${i === active ? 'active' : ''}`}
          onClick={() => onSelect(cmd.id)}
          onMouseEnter={() => setActive(i)}>
          <div className="icon">{cmd.icon}</div>
          <div>
            <div className="label">{cmd.label}</div>
            <div className="desc">{cmd.desc}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

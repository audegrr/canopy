'use client'
import { useEffect, useState } from 'react'

const TIPS = [
  { icon: '/', text: "Type '/' in any page to open the command menu" },
  { icon: '⌘B', text: 'Select text and press Cmd+B for bold' },
  { icon: '⌘I', text: 'Select text and press Cmd+I for italic' },
  { icon: '⠿', text: 'Hover over a block to see the drag handle' },
  { icon: '😀', text: 'Click the icon area to add an emoji to your page' },
  { icon: '🖼', text: 'Drag & drop or paste images directly into the editor' },
  { icon: '↗', text: "Use '/subpage' to embed a linked page inline" },
  { icon: '🗄️', text: "Use '/database' to embed a database in a page" },
]

const SHORTCUTS = [
  ['⌘B', 'Bold text'],
  ['⌘I', 'Italic text'],
  ['⌘U', 'Underline text'],
  ['⌘Z', 'Undo last action'],
  ['⌘F', 'Search pages and commands'],
  ['⌘K', 'Insert a link'],
  ['/', 'Open the commands menu'],
  ['Tab', 'Indent a list item'],
]

export default function AppHome() {
  const [tipIndex, setTipIndex] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setTipIndex(i => (i + 1) % TIPS.length), 3500)
    return () => clearInterval(t)
  }, [])

  return (
    <div style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', gap: '24px', padding: '40px 60px',
      background: 'var(--bg)', overflowY: 'auto'
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center' }}>
        <img src='/favicon.ico' alt='Canopy' style={{ width: 64, height: 64, marginBottom: '16px', borderRadius: '12px' }} />
        <h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--text)', marginBottom: '8px', fontFamily: 'var(--font-sans)' }}>
          Welcome to Canopy
        </h2>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', maxWidth: '320px', lineHeight: 1.6 }}>
          Select a page from the sidebar, or create a new one to get started.
        </p>
      </div>

      {/* Quick actions — same width buttons */}
      <div style={{ display: 'flex', gap: '10px' }}>
        <QuickAction icon="📄" label="New page" onClick={() => {
          (document.querySelector('[title="New page"]') as HTMLButtonElement)?.click()
        }} />
        <QuickAction icon="🗄️" label="New database" onClick={() => {
          (document.querySelector('[title="New database"]') as HTMLButtonElement)?.click()
        }} />
      </div>

      {/* Rotating tip */}
      <div style={{
        background: 'var(--sidebar-bg)', border: '1px solid var(--border)',
        borderRadius: '10px', padding: '14px 20px', width: '360px',
        textAlign: 'center', minHeight: '80px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
      }}>
        <div style={{ fontSize: '22px', marginBottom: '6px' }}>{TIPS[tipIndex].icon}</div>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          {TIPS[tipIndex].text}
        </p>
      </div>

      {/* Keyboard shortcuts — expands downward, full text */}
      <details style={{ width: '360px' }}>
        <summary style={{
          fontSize: '12px', color: 'var(--text-tertiary)', cursor: 'pointer',
          listStyle: 'none', display: 'flex', alignItems: 'center', gap: '4px',
          userSelect: 'none'
        }}>
          ⌨ Keyboard shortcuts
        </summary>
        <div style={{
          marginTop: '8px', background: 'var(--sidebar-bg)',
          border: '1px solid var(--border)', borderRadius: '8px',
          padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px'
        }}>
          {SHORTCUTS.map(([key, label]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <kbd style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: '4px', padding: '2px 8px', fontSize: '11px',
                fontFamily: 'var(--font-sans)', color: 'var(--text-secondary)',
                whiteSpace: 'nowrap', flexShrink: 0, width: '64px',
                textAlign: 'center', boxShadow: '0 1px 0 var(--border)'
              }}>{key}</kbd>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                {label}
              </span>
            </div>
          ))}
        </div>
      </details>
    </div>
  )
}

function QuickAction({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: '8px', padding: '10px 0',
        // Fixed width large enough for "New database"
        width: '180px',
        background: hovered ? 'var(--sidebar-bg)' : 'var(--surface)',
        border: `1px solid ${hovered ? 'var(--text-tertiary)' : 'var(--border)'}`,
        borderRadius: '8px', cursor: 'pointer',
        fontFamily: 'var(--font-sans)', fontSize: '13px',
        color: 'var(--text)', fontWeight: 500, transition: 'all 0.15s'
      }}>
      <span style={{ fontSize: '16px' }}>{icon}</span>
      {label}
    </button>
  )
}

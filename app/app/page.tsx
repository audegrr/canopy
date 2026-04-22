'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

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

export default function AppHome() {
  const router = useRouter()
  const [tipIndex, setTipIndex] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setTipIndex(i => (i + 1) % TIPS.length), 3500)
    return () => clearInterval(t)
  }, [])

  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '24px', padding: '40px', background: 'var(--bg)' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '56px', marginBottom: '16px', opacity: 0.15 }}>🌿</div>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--text)', marginBottom: '8px', fontFamily: 'var(--font-sans)' }}>
          Welcome to Canopy
        </h2>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', maxWidth: '320px', lineHeight: 1.6 }}>
          Select a page from the sidebar, or create a new one to get started.
        </p>
      </div>

      {/* Quick actions */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
        <QuickAction icon="📄" label="New page" onClick={() => {
          const btn = document.querySelector('[title="New page"]') as HTMLButtonElement
          btn?.click()
        }} />
        <QuickAction icon="🗄️" label="New database" onClick={() => {
          const btn = document.querySelector('[title="New database"]') as HTMLButtonElement
          btn?.click()
        }} />
      </div>

      {/* Rotating tip */}
      <div style={{ background: 'var(--sidebar-bg)', border: '1px solid var(--border)', borderRadius: '10px', padding: '14px 20px', maxWidth: '340px', textAlign: 'center', minHeight: '80px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: '22px', marginBottom: '6px' }}>{TIPS[tipIndex].icon}</div>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '280px' }}>{TIPS[tipIndex].text}</p>
      </div>

      {/* Keyboard shortcuts */}
      <details style={{ cursor: 'pointer' }}>
        <summary style={{ fontSize: '12px', color: 'var(--text-tertiary)', listStyle: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span>⌨</span> Keyboard shortcuts
        </summary>
        <div style={{ marginTop: '10px', background: 'var(--sidebar-bg)', border: '1px solid var(--border)', borderRadius: '8px', padding: '14px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 24px', overflow: 'visible' }}>
          {[
            ['⌘ + B', 'Bold text'],
            ['⌘ + I', 'Italic text'],
            ['⌘ + U', 'Underline text'],
            ['⌘ + Z', 'Undo last action'],
            ['⌘ + F', 'Search & commands'],
            ['⌘ + K', 'Insert a link'],
            ['/', 'Open commands menu'],
            ['Tab', 'Indent a list item'],
          ].map(([key, label]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <kbd style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px', padding: '3px 7px', fontSize: '11px', fontFamily: 'var(--font-sans)', color: 'var(--text-secondary)', whiteSpace: 'nowrap', flexShrink: 0, boxShadow: '0 1px 0 var(--border)' }}>{key}</kbd>
              <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.5, wordBreak: 'break-word' }}>{label}</span>
            </div>
          ))}
        </div>
      </details>
    </div>
  )
}

function QuickAction({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px 18px', width: '160px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--text)', fontWeight: 500, transition: 'all 0.15s' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-bg)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--text-tertiary)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}>
      <span style={{ fontSize: '16px' }}>{icon}</span>
      {label}
    </button>
  )
}

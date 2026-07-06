'use client'

const SHORTCUTS = [
  { section: 'Navigation', items: [
    { keys: ['⌘', 'K'], label: 'Search all pages' },
    { keys: ['⌘', 'F'], label: 'Find in this page' },
    { keys: ['⌘', '['], label: 'Navigate back' },
    { keys: ['⌘', ']'], label: 'Navigate forward' },
    { keys: ['?'], label: 'Open this shortcuts panel' },
    { keys: ['Esc'], label: 'Close any panel or modal' },
  ]},
  { section: 'Pages', items: [
    { keys: ['⌘', 'N'], label: 'New page' },
    { keys: ['⌘', 'D'], label: 'Duplicate page' },
    { keys: ['⌘', '⇧', 'F'], label: 'Toggle focus mode' },
  ]},
  { section: 'Formatting', items: [
    { keys: ['⌘', 'B'], label: 'Bold' },
    { keys: ['⌘', 'I'], label: 'Italic' },
    { keys: ['⌘', 'U'], label: 'Underline' },
    { keys: ['⌘', '⇧', 'S'], label: 'Strikethrough' },
    { keys: ['⌘', 'E'], label: 'Inline code' },
    { keys: ['⌘', 'K'], label: 'Insert / edit link' },
    { keys: ['⌘', '⇧', 'H'], label: 'Highlight' },
  ]},
  { section: 'Editing', items: [
    { keys: ['⌘', 'Z'], label: 'Undo' },
    { keys: ['⌘', '⇧', 'Z'], label: 'Redo' },
    { keys: ['/'], label: 'Insert block (slash command)' },
    { keys: ['@'], label: 'Mention a page' },
    { keys: ['Tab'], label: 'Indent list item' },
    { keys: ['⇧', 'Tab'], label: 'Outdent list item' },
    { keys: ['⌘', 'A'], label: 'Select all' },
    { keys: ['⌘', 'C'], label: 'Copy' },
    { keys: ['⌘', 'X'], label: 'Cut' },
    { keys: ['⌘', 'V'], label: 'Paste' },
  ]},
  { section: 'Text alignment', items: [
    { keys: ['⌘', '⇧', 'L'], label: 'Align left' },
    { keys: ['⌘', '⇧', 'E'], label: 'Align center' },
    { keys: ['⌘', '⇧', 'R'], label: 'Align right' },
  ]},
  { section: 'Blocks (type / then…)', items: [
    { keys: ['/h1'], label: 'Heading 1' },
    { keys: ['/h2'], label: 'Heading 2' },
    { keys: ['/h3'], label: 'Heading 3' },
    { keys: ['/bullet'], label: 'Bulleted list' },
    { keys: ['/numbered'], label: 'Numbered list' },
    { keys: ['/todo'], label: 'To-do list' },
    { keys: ['/callout'], label: 'Callout block' },
    { keys: ['/quote'], label: 'Quote' },
    { keys: ['/code'], label: 'Code block' },
    { keys: ['/divider'], label: 'Divider' },
    { keys: ['/table'], label: 'Table' },
    { keys: ['/image'], label: 'Image' },
    { keys: ['/video'], label: 'Video' },
    { keys: ['/embed'], label: 'Embed (iframe)' },
    { keys: ['/2 columns'], label: '2-column layout' },
    { keys: ['/3 columns'], label: '3-column layout' },
    { keys: ['/toc'], label: 'Table of contents' },
    { keys: ['/subpage'], label: 'Embed a sub-page' },
    { keys: ['/database'], label: 'Embed a database' },
  ]},
  { section: 'Table (when cursor is in a cell)', items: [
    { keys: ['Tab'], label: 'Move to next cell' },
    { keys: ['⇧', 'Tab'], label: 'Move to previous cell' },
    { keys: ['↑↓←→'], label: 'Navigate cells' },
  ]},
]

export default function ShortcutsModal({ onClose }: { onClose: () => void }) {
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,0.35)' }} onClick={onClose} />
      <div style={{ position: 'fixed', top: '5%', left: '50%', transform: 'translateX(-50%)', width: 'min(90vw, 620px)', maxHeight: '88vh', background: 'var(--surface)', borderRadius: 12, boxShadow: '0 12px 48px rgba(0,0,0,0.2)', zIndex: 1000, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)' }}>Keyboard shortcuts</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ overflowY: 'auto', padding: '12px 20px 20px', columnCount: 1 }}>
          {SHORTCUTS.map(section => (
            <div key={section.section} style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 8 }}>
                {section.section}
              </div>
              {section.items.map(item => (
                <div key={item.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 13, color: 'var(--text)' }}>{item.label}</span>
                  <div style={{ display: 'flex', gap: 3, flexShrink: 0, marginLeft: 12 }}>
                    {item.keys.map((k, i) => (
                      <kbd key={i} style={{ fontSize: 11, background: 'var(--sidebar-bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 6px', color: 'var(--text-secondary)', fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap' }}>{k}</kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

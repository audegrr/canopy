'use client'

import { useState } from 'react'
import { Icon } from './Icons'

// ── PAGE ROW COMPONENT ───────────────────────────────────────
type PageRowProps = {
  page: { id: string; icon: string; title: string; is_database?: boolean }
  depth: number
  isActive: boolean
  isDragOver: boolean
  hasChildren: boolean
  isExpanded: boolean
  isRenaming: boolean
  renameVal: string
  onRenameChange: (val: string) => void
  onRenameSubmit: () => void
  onRenameCancel: () => void
  onToggle: () => void
  onClick: () => void
  onDragStart: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: () => void
  onDrop: (e: React.DragEvent) => void
  onDragEnd: () => void
  onContextMenu: (e: React.MouseEvent) => void
  onAddSubpage?: () => void
  onMoreMenu: (e: React.MouseEvent) => void
  isDragging: boolean
  badge?: string
  onRemove?: () => void
  onHover?: () => void
  dropIndicator?: 'above' | 'below' | 'inside' | null
  isShared?: boolean
  isKeyFocused?: boolean
  isFavorite?: boolean
  onToggleFavorite?: () => void
}

export default function PageRow({ page, depth, isActive, isDragOver, hasChildren, isExpanded, isRenaming, renameVal, onRenameChange, onRenameSubmit, onRenameCancel, onToggle, onClick, onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd, onContextMenu, onAddSubpage, onMoreMenu, isDragging, badge, onRemove, onHover, dropIndicator, isKeyFocused, isFavorite, onToggleFavorite }: PageRowProps) {
  const [hovered, setHovered] = useState(false)
  return (
    <div style={{ position: 'relative' }} data-page-id={page.id}>
    {dropIndicator === 'above' && (
      <div style={{ position: 'absolute', top: 0, left: 6, right: 6, height: 2, background: 'var(--accent)', borderRadius: 1, zIndex: 5, pointerEvents: 'none' }} />
    )}
    <div
      draggable={!isRenaming}
      onDragStart={onDragStart} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} onDragEnd={onDragEnd}
      onContextMenu={onContextMenu}
      onClick={onClick}
      onMouseEnter={() => { setHovered(true); onHover?.() }}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        display: 'flex', alignItems: 'center', gap: '5px',
        paddingLeft: `${8 + depth * 16}px`, paddingRight: '8px',
        paddingTop: '5px', paddingBottom: '5px',
        borderRadius: 'var(--radius-sm)', cursor: 'pointer',
        background: isActive ? 'var(--side-active)' : isDragOver ? 'var(--accent-light)' : isKeyFocused ? 'var(--side-hover)' : hovered ? 'var(--side-hover)' : 'transparent',
        outline: isKeyFocused ? '2px solid var(--accent)' : 'none',
        outlineOffset: '-2px',
        opacity: isDragging ? 0.4 : 1,
        margin: '1px 6px',
        userSelect: 'none',
        fontWeight: isActive ? 500 : 400,
        color: 'var(--side-text)',
        transition: 'background 0.12s',
      }}
    >
      {/* Active accent bar — inside the pill, at its left edge */}
      {isActive && (
        <div style={{ position: 'absolute', left: 0, top: '20%', bottom: '20%', width: 3, borderRadius: '0 3px 3px 0', background: 'var(--side-accent)', pointerEvents: 'none', zIndex: 1 }} />
      )}
      {/* Expand toggle — chevron SVG */}
      <span
        onClick={e => { e.stopPropagation(); if (hasChildren) onToggle() }}
        style={{
          width: '17px', height: '17px', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: '4px',
          color: hasChildren ? 'var(--side-text-2)' : 'transparent',
          transition: 'transform 0.16s, background 0.12s',
          transform: isExpanded ? 'rotate(90deg)' : 'none',
          cursor: hasChildren ? 'pointer' : 'default',
        }}
        onMouseEnter={e => { if (hasChildren) (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-active)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}
        title={hasChildren ? (isExpanded ? 'Collapse' : 'Expand') : ''}
      >
        {hasChildren && <Icon name="chev-right" size={12} />}
      </span>

      {/* Page icon — emoji if set, else emoji fallback */}
      <span style={{ fontSize: '14px', flexShrink: 0, width: '17px', textAlign: 'center', lineHeight: 1 }}>
        {page.icon || (page.is_database ? '🗄️' : '📄')}
      </span>

      {/* Title or rename input */}
      {isRenaming ? (
        <input autoFocus value={renameVal} onChange={e => onRenameChange(e.target.value)}
          onBlur={onRenameSubmit}
          onKeyDown={e => { if (e.key === 'Enter') onRenameSubmit(); if (e.key === 'Escape') onRenameCancel() }}
          onClick={e => e.stopPropagation()}
          style={{ flex: 1, border: 'none', borderBottom: '1px solid var(--accent)', background: 'transparent', fontFamily: 'var(--font-sans)', fontSize: '13.5px', color: 'var(--text)', outline: 'none', padding: '0 2px' }} />
      ) : (
        <span style={{ flex: 1, fontSize: '13.5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: hovered ? '72px' : '0', transition: 'padding-right 0.1s' }}>
          {page.title || 'Untitled'}
        </span>
      )}

      {/* Badge (shared pages) — small grey text, same style as action buttons */}
      {badge && (
        <span style={{
          fontSize: '10px', color: 'var(--text-tertiary)', flexShrink: 0,
          background: 'var(--sidebar-active)', borderRadius: '3px',
          padding: '1px 5px', fontWeight: 500, letterSpacing: '0.3px',
          marginRight: '2px'
        }}>{badge}</span>
      )}

      {/* Actions overlay — absolute, fades in on hover, never causes layout shift */}
      {!isRenaming && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)',
            display: 'flex', alignItems: 'center', gap: '2px',
            opacity: (hovered || isFavorite) ? 1 : 0,
            pointerEvents: (hovered || isFavorite) ? 'auto' : 'none',
            transition: 'opacity .12s',
            paddingLeft: 26,
            background: 'linear-gradient(90deg, transparent, var(--side-fade) 38%)',
          }}>
          {onRemove ? (
            <SbBtn onClick={onRemove} title="Remove"><span style={{ fontSize: '12px', lineHeight: 1 }}>✕</span></SbBtn>
          ) : (
            <>
              {onToggleFavorite && (
                <SbBtn onClick={onToggleFavorite} title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}>
                  <Icon name={isFavorite ? 'star-fill' : 'star'} size={14} style={{ color: isFavorite ? '#f59e0b' : undefined }} />
                </SbBtn>
              )}
              {onAddSubpage && <SbBtn onClick={onAddSubpage} title="New sub-page"><Icon name="plus" size={14} /></SbBtn>}
              {onMoreMenu && <SbBtn onClick={onMoreMenu} title="More options"><Icon name="more" size={14} /></SbBtn>}
            </>
          )}
        </div>
      )}
    </div>
    {dropIndicator === 'below' && (
      <div style={{ position: 'absolute', bottom: 0, left: 6, right: 6, height: 2, background: 'var(--accent)', borderRadius: 1, zIndex: 5, pointerEvents: 'none' }} />
    )}
    </div>
  )
}

// ── SMALL COMPONENTS ─────────────────────────────────────────
function SbBtn({ onClick, title, children }: { onClick?: (e: React.MouseEvent) => void; title: string; children: React.ReactNode }) {
  return (
    <button type="button" onClick={e => { e.stopPropagation(); onClick?.(e) }} title={title} aria-label={title}
      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--side-text-2)', padding: '3px', borderRadius: '5px', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '22px', height: '22px', flexShrink: 0 }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-active)'; (e.currentTarget as HTMLElement).style.color = 'var(--side-text)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; (e.currentTarget as HTMLElement).style.color = 'var(--side-text-2)' }}>
      {children}
    </button>
  )
}


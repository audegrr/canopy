'use client'
import { useState, useEffect, useRef, useCallback } from 'react'

type Props = {
  containerRef: React.RefObject<HTMLElement | null>
  onClose: () => void
}

type Loc = { node: Text; start: number; end: number }

const HL_ALL = 'canopy-find'
const HL_ACTIVE = 'canopy-find-active'

function supportsHighlight() {
  return typeof window !== 'undefined' && 'Highlight' in window && !!(window as any).CSS?.highlights
}

function buildTextMap(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node: Node) {
      const parent = (node as Text).parentElement
      if (!parent) return NodeFilter.FILTER_REJECT
      if (parent.closest('[data-type="toc"]')) return NodeFilter.FILTER_REJECT
      const style = window.getComputedStyle(parent)
      if (style.display === 'none' || style.visibility === 'hidden') return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    },
  })
  let text = ''
  const map: Loc[] = []
  let n: Node | null
  while ((n = walker.nextNode())) {
    const t = (n as Text).textContent || ''
    if (!t) continue
    map.push({ node: n as Text, start: text.length, end: text.length + t.length })
    text += t
  }
  return { text, map }
}

function offsetToNode(map: Loc[], offset: number) {
  for (const m of map) {
    if (offset >= m.start && offset <= m.end) return { node: m.node, offset: offset - m.start }
  }
  return null
}

function findRanges(root: HTMLElement, query: string): Range[] {
  const { text, map } = buildTextMap(root)
  const q = query.toLowerCase()
  const lower = text.toLowerCase()
  const ranges: Range[] = []
  let from = 0
  while (true) {
    const found = lower.indexOf(q, from)
    if (found === -1) break
    const startPos = offsetToNode(map, found)
    const endPos = offsetToNode(map, found + q.length)
    if (startPos && endPos) {
      const range = document.createRange()
      range.setStart(startPos.node, startPos.offset)
      range.setEnd(endPos.node, endPos.offset)
      ranges.push(range)
    }
    from = found + q.length
  }
  return ranges
}

function scrollToRange(range: Range) {
  const el = range.startContainer.nodeType === Node.TEXT_NODE
    ? range.startContainer.parentElement
    : (range.startContainer as Element)
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

export default function FindInPage({ containerRef, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [matchCount, setMatchCount] = useState(0)
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const rangesRef = useRef<Range[]>([])
  const queryRef = useRef('')
  const activeIndexRef = useRef(0)
  const hlSupported = useRef(supportsHighlight())

  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select() }, [])

  const applyHighlights = useCallback((ranges: Range[], active: number) => {
    if (!hlSupported.current) return
    const CSSAny = (window as any).CSS
    const HighlightCtor = (window as any).Highlight
    if (ranges.length === 0) {
      CSSAny.highlights.delete(HL_ALL)
      CSSAny.highlights.delete(HL_ACTIVE)
      return
    }
    CSSAny.highlights.set(HL_ALL, new HighlightCtor(...ranges))
    CSSAny.highlights.set(HL_ACTIVE, new HighlightCtor(ranges[active]))
  }, [])

  const runSearch = useCallback((q: string, preferActive?: number) => {
    const container = containerRef.current
    if (!container || !q.trim()) {
      rangesRef.current = []
      setMatchCount(0)
      setActiveIndex(0)
      if (hlSupported.current) {
        (window as any).CSS?.highlights.delete(HL_ALL)
        ;(window as any).CSS?.highlights.delete(HL_ACTIVE)
      }
      return
    }
    const ranges = findRanges(container, q.trim())
    rangesRef.current = ranges
    setMatchCount(ranges.length)
    const active = ranges.length === 0 ? 0 : ((preferActive ?? 0) % ranges.length + ranges.length) % ranges.length
    setActiveIndex(active)
    activeIndexRef.current = active
    applyHighlights(ranges, active)
    if (ranges.length > 0) scrollToRange(ranges[active])
  }, [containerRef, applyHighlights])

  useEffect(() => { queryRef.current = query; runSearch(query) }, [query, runSearch])

  // Re-run the search if the page content changes while find is open, so
  // highlights/ranges don't go stale mid-edit (Ranges can't self-heal across
  // DOM mutations from ProseMirror re-rendering nodes).
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let raf = 0
    const obs = new MutationObserver(() => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => runSearch(queryRef.current, activeIndexRef.current))
    })
    obs.observe(container, { childList: true, subtree: true, characterData: true })
    return () => { obs.disconnect(); cancelAnimationFrame(raf) }
  }, [containerRef, runSearch])

  useEffect(() => {
    return () => {
      if (hlSupported.current) {
        (window as any).CSS?.highlights.delete(HL_ALL)
        ;(window as any).CSS?.highlights.delete(HL_ACTIVE)
      }
    }
  }, [])

  function goTo(delta: number) {
    const ranges = rangesRef.current
    if (ranges.length === 0) return
    const next = (activeIndexRef.current + delta + ranges.length) % ranges.length
    activeIndexRef.current = next
    setActiveIndex(next)
    applyHighlights(ranges, next)
    scrollToRange(ranges[next])
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); goTo(e.shiftKey ? -1 : 1) }
    else if (e.key === 'ArrowDown') { e.preventDefault(); goTo(1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); goTo(-1) }
    else if (e.key === 'Escape') { e.preventDefault(); onClose() }
  }

  const btnStyle: React.CSSProperties = {
    background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)',
    fontSize: 13, padding: '3px 7px', borderRadius: 4, lineHeight: 1,
  }

  return (
    <div style={{
      position: 'fixed', top: 16, right: 16, zIndex: 500,
      display: 'flex', alignItems: 'center', gap: 4,
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
      boxShadow: '0 6px 24px rgba(0,0,0,0.18)', padding: '6px 6px 6px 12px',
    }}>
      <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>🔍</span>
      <input
        ref={inputRef}
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Find in page…"
        style={{ border: 'none', outline: 'none', fontSize: 13, width: 170, background: 'transparent', color: 'var(--text)', fontFamily: 'var(--font-sans)', marginLeft: 4 }}
      />
      <span style={{ fontSize: 11, color: 'var(--text-tertiary)', minWidth: 40, textAlign: 'center' }}>
        {query.trim() ? `${matchCount > 0 ? activeIndex + 1 : 0}/${matchCount}` : ''}
      </span>
      <button onClick={() => goTo(-1)} disabled={matchCount === 0} title="Previous match (⇧⏎)" style={btnStyle}>↑</button>
      <button onClick={() => goTo(1)} disabled={matchCount === 0} title="Next match (⏎)" style={btnStyle}>↓</button>
      <button onClick={onClose} title="Close (Esc)" style={btnStyle}>✕</button>
    </div>
  )
}

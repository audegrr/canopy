'use client'

import { useEffect, useRef, useState } from 'react'
import { Node, mergeAttributes } from '@tiptap/core'
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { createLowlight, all as allLangs } from 'lowlight'

const lowlight = createLowlight(allLangs)

function flattenHast(node: any, inherited: string[] = []): { text: string; classes: string[] }[] {
  const out: { text: string; classes: string[] }[] = []
  for (const child of node.children ?? []) {
    const cls = [...inherited, ...(child.properties?.className ?? [])]
    if (child.type === 'text') out.push({ text: child.value, classes: cls })
    else out.push(...flattenHast(child, cls))
  }
  return out
}

function buildDecorations(doc: any): DecorationSet {
  const decos: Decoration[] = []
  doc.descendants((node: any, pos: number) => {
    if (node.type.name !== 'codeBlock') return
    const lang = node.attrs.language || ''
    const code = node.textContent
    if (!code) return
    let result: any
    try { result = lang ? lowlight.highlight(lang, code) : lowlight.highlightAuto(code) }
    catch { return }
    let offset = pos + 1
    for (const token of flattenHast(result)) {
      const to = offset + token.text.length
      if (token.classes.length) decos.push(Decoration.inline(offset, to, { class: token.classes.join(' ') }))
      offset = to
    }
  })
  return DecorationSet.create(doc, decos)
}

const lowlightKey = new PluginKey('lowlight')
const lowlightPlugin = new Plugin({
  key: lowlightKey,
  state: {
    init(_, { doc }) { return buildDecorations(doc) },
    apply(tr, old) { return tr.docChanged ? buildDecorations(tr.doc) : old },
  },
  props: { decorations(state) { return this.getState(state) } },
})

// ── MATH NODES ───────────────────────────────────────────────────────────────

const CODE_LANGUAGES = ['bash','css','go','html','java','javascript','json','markdown','mermaid','python','rust','sql','svg','typescript','xml','yaml']

// Reports body scroll-height to parent via postMessage.
// Uses ResizeObserver for live tracking + fallback timeouts for lazy content.
// Also listens for 'canopy-remeasure' so the parent can trigger a fresh
// measurement whenever the iframe viewport width changes (preview ↔ split).
// NOTE: window.resize is intentionally NOT used — changing the iframe height
// also changes the iframe viewport, which would trigger resize → remeasure →
// height change → resize → infinite loop.
const HEIGHT_REPORTER = `<script>(function(){
  var s=document.createElement('style');
  s.textContent='html,body{height:auto!important;min-height:0!important}';
  (document.head||document.documentElement).appendChild(s);
  var tm;
  function r(){
    var b=document.body;if(!b)return;
    var cs=window.getComputedStyle(b);
    var mt=parseFloat(cs.marginTop)||0,mb=parseFloat(cs.marginBottom)||0;
    var h=b.scrollHeight+mt+mb;
    window.parent.postMessage({type:'canopy-height',h:Math.max(40,h)},'*');
  }
  function d(){clearTimeout(tm);tm=setTimeout(r,50);}
  window.addEventListener('load',r);
  setTimeout(r,150);setTimeout(r,600);
  if(typeof ResizeObserver!=='undefined')new ResizeObserver(d).observe(document.body);
  window.addEventListener('message',function(e){if(e.data&&e.data.type==='canopy-remeasure')d();});
})()</script>`

function previewSrcDoc(lang: string, code: string): string {
  if (lang === 'mermaid') {
    const escaped = code.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    // Use requestAnimationFrame to wait for SVG layout after mermaid.run(),
    // then ResizeObserver + remeasure listener to catch any reflows (including
    // viewport-width changes when the parent switches between preview and split).
    return `<!DOCTYPE html><html><head><style>
body{margin:0;padding:16px 20px;background:#fff;font-family:sans-serif}
pre{margin:0;padding:0;overflow:visible}
svg{max-width:100%!important;height:auto;display:block}
html,body{height:auto!important;min-height:0!important}
</style></head><body><pre class="mermaid">${escaped}</pre><script type="module">
import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
mermaid.initialize({startOnLoad:true,theme:'default',securityLevel:'loose',fontSize:14});
await mermaid.run().catch(()=>{});
// Clamp SVG to its natural width — mermaid sets width="100%" which would upscale
// small diagrams to fill the container and inflate the font proportionally.
// max-width:100%!important in CSS still prevents overflow in narrow containers.
var _svg=document.body.querySelector('svg');
if(_svg){var _mw=_svg.style.maxWidth;if(_mw)_svg.setAttribute('width',_mw);}
function r(){
  var svg=document.body.querySelector('svg');
  var h=svg?svg.getBoundingClientRect().bottom+16:document.body.scrollHeight;
  window.parent.postMessage({type:'canopy-height',h:Math.max(40,Math.ceil(h))},'*');
}
requestAnimationFrame(()=>requestAnimationFrame(()=>{
  r();setTimeout(r,200);setTimeout(r,600);
  if(typeof ResizeObserver!=='undefined'){var tm;new ResizeObserver(()=>{clearTimeout(tm);tm=setTimeout(r,50);}).observe(document.body);}
  window.addEventListener('message',function(e){if(e.data&&e.data.type==='canopy-remeasure'){if(typeof tm!=='undefined')clearTimeout(tm);tm=setTimeout(r,50);}});
}));
</script></body></html>`
  }
  if (lang === 'svg') {
    return `<!DOCTYPE html><html><head><style>body{margin:0;padding:8px;background:#fff;display:flex;justify-content:center}svg{max-width:100%;height:auto}</style></head><body>${code}${HEIGHT_REPORTER}</body></html>`
  }
  // HTML: inject reporter before </body> if present, otherwise wrap
  if (/<\/body\s*>/i.test(code)) return code.replace(/<\/body\s*>/i, `${HEIGHT_REPORTER}</body>`)
  if (/<html/i.test(code)) return code + HEIGHT_REPORTER
  return `<!DOCTYPE html><html><head><style>body{margin:0;padding:8px;background:#fff}</style></head><body>${code}${HEIGHT_REPORTER}</body></html>`
}

function CodeBlockComponent({ node, updateAttributes }: any) {
  const [tab, setTab] = useState<'code' | 'preview' | 'split'>('code')
  const lang = (node.attrs.language || '').toLowerCase()
  const canPreview = lang === 'html' || lang === 'svg' || lang === 'mermaid'
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const codeWrapRef = useRef<HTMLDivElement>(null)
  const [iframeHeight, setIframeHeight] = useState(160)
  const [codeH, setCodeH] = useState(0)

  // Receive height reports from the preview iframe; only update when value meaningfully changes
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (iframeRef.current && e.source === iframeRef.current.contentWindow) {
        if (e.data?.type === 'canopy-height' && typeof e.data.h === 'number') {
          const next = Math.max(60, Math.ceil(e.data.h) + 4)
          setIframeHeight(prev => Math.abs(next - prev) > 2 ? next : prev)
        }
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  // Measure natural code pane height (the wrapper never has a fixed height, so scrollHeight = content height)
  useEffect(() => {
    if (!codeWrapRef.current) return
    const ro = new ResizeObserver(() => {
      if (codeWrapRef.current) setCodeH(codeWrapRef.current.scrollHeight)
    })
    ro.observe(codeWrapRef.current)
    return () => ro.disconnect()
  }, [])

  // Reset to a modest placeholder height when the content or language changes
  const textContent = node.textContent
  useEffect(() => {
    if (tab !== 'code') setIframeHeight(160)
  }, [textContent, lang, tab])

  // Revert to code tab when switching to a language that has no preview
  useEffect(() => {
    if (!canPreview) setTab('code')
  }, [canPreview])

  // When the tab switches between preview and split, the iframe viewport width changes
  // (full width vs half width). Ask the iframe to remeasure once the new layout has settled.
  useEffect(() => {
    if (tab === 'code') return
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => {
        iframeRef.current?.contentWindow?.postMessage({ type: 'canopy-remeasure' }, '*')
      })
    })
    return () => cancelAnimationFrame(raf)
  }, [tab])

  // In split mode: iframe height = max(code content height, iframe content height)
  const previewH = tab === 'split' ? Math.max(codeH || iframeHeight, iframeHeight) : iframeHeight

  return (
    <NodeViewWrapper style={{ margin: '8px 0' }}>
      <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: '#1b1b2e' }}>
        {/* Header */}
        <div contentEditable={false} style={{ display: 'flex', alignItems: 'center', padding: '5px 10px', background: 'rgba(0,0,0,0.25)', borderBottom: '1px solid rgba(255,255,255,0.06)', gap: 8, userSelect: 'none' }}>
          <select
            value={node.attrs.language || ''}
            onChange={e => updateAttributes({ language: e.target.value })}
            onMouseDown={e => e.stopPropagation()}
            style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: '#9ba3b0', borderRadius: 4, padding: '2px 6px', fontSize: 11, fontFamily: 'monospace', cursor: 'pointer', outline: 'none' }}>
            <option value="">plain text</option>
            {CODE_LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          {canPreview && (
            <div style={{ marginLeft: 'auto', display: 'flex', background: 'rgba(255,255,255,0.06)', borderRadius: 5, padding: 2, gap: 1 }}>
              {(['code', 'preview', 'split'] as const).map(t => (
                <button key={t}
                  onMouseDown={e => { e.preventDefault(); e.stopPropagation(); setTab(t) }}
                  style={{ background: tab === t ? 'rgba(255,255,255,0.14)' : 'none', color: tab === t ? '#e2e8f0' : '#666', border: 'none', borderRadius: 4, padding: '2px 10px', cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font-sans)', transition: 'all 0.1s' }}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          )}
        </div>
        {/* Code + preview area */}
        <div style={{ display: tab === 'split' ? 'grid' : 'block', gridTemplateColumns: '1fr 1fr', alignItems: 'start' }}>
          <div ref={codeWrapRef} style={{ display: tab === 'preview' ? 'none' : 'block', borderRight: tab === 'split' ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
            <NodeViewContent as={'pre' as 'div'} style={{ margin: 0, padding: '10px 16px 10px', color: '#c9d1d9', fontSize: 13, fontFamily: '"Fira Code","Cascadia Code",monospace', overflowX: 'auto', lineHeight: 1.6, whiteSpace: 'pre' }} />
          </div>
          {tab !== 'code' && (
            <iframe
              ref={iframeRef}
              srcDoc={previewSrcDoc(lang, node.textContent)}
              title={lang === 'mermaid' ? 'Mermaid diagram' : 'Preview'}
              style={{ width: '100%', height: previewH, border: 'none', background: '#fff', display: 'block' }}
              sandbox="allow-scripts allow-same-origin"
            />
          )}
        </div>
      </div>
    </NodeViewWrapper>
  )
}

export const CustomCodeBlock = Node.create({
  name: 'codeBlock',
  group: 'block',
  content: 'text*',
  marks: '',
  code: true,
  defining: true,
  addAttributes() {
    return {
      language: {
        default: null,
        parseHTML: el => el.getAttribute('data-language') || el.querySelector('code')?.className?.replace('language-', '') || null,
      },
    }
  },
  parseHTML() { return [{ tag: 'pre', preserveWhitespace: 'full' }] },
  renderHTML({ HTMLAttributes }) {
    return ['pre', mergeAttributes(HTMLAttributes, { 'data-language': HTMLAttributes.language || '' }), ['code', 0]]
  },
  addCommands() {
    return {
      setCodeBlock: (attrs?: any) => ({ commands }: any) => commands.setNode('codeBlock', attrs),
      toggleCodeBlock: (attrs?: any) => ({ commands }: any) => commands.toggleNode('codeBlock', 'paragraph', attrs || {}),
    } as any
  },
  addKeyboardShortcuts() {
    return {
      'Mod-Alt-c': () => (this.editor as any).commands.toggleCodeBlock(),
      'Mod-Enter': ({ editor }: any) => {
        if (!editor.isActive('codeBlock')) return false
        return editor.commands.exitCode()
      },
      Tab: ({ editor }: any) => {
        if (!editor.isActive('codeBlock')) return false
        editor.commands.insertContent('  ')
        return true
      },
      Backspace: ({ editor }: any) => {
        if (!editor.isActive('codeBlock')) return false
        const { $from } = editor.state.selection
        if ($from.pos !== $from.start()) return false
        return editor.commands.clearNodes()
      },
    }
  },
  addProseMirrorPlugins() { return [lowlightPlugin] },
  addNodeView() { return ReactNodeViewRenderer(CodeBlockComponent) },
})


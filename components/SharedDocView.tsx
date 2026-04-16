'use client'
import { useEffect, useState } from 'react'

export default function SharedDocView({ doc }: { doc: any }) {
  const [preview, setPreview] = useState('')

  useEffect(() => {
    import('marked').then(({ marked }) => {
      let processed = (doc.content || '')
        .replace(/!video\[([^\]]*)\]\(([^)]+)\)/g, (_: any, t: string, url: string) => {
          const m = url.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/)
          if (m) return `<div class="video-embed"><iframe src="https://www.youtube.com/embed/${m[1]}" allowfullscreen title="${t}"></iframe></div>`
          return `<p><a href="${url}" target="_blank">${t}</a></p>`
        })
        .replace(/!\[([^|\]]+)\|(\d+)(?:x(\d+))?\]\(([^)]+)\)/g, (_: any, alt: string, w: string, h: string, url: string) => {
          const style = h ? `width:${w}px;height:${h}px;object-fit:cover` : `width:${w}px`
          return `<img src="${url}" alt="${alt}" style="${style};border-radius:8px;margin:0.5em 0;display:block">`
        })
      const html = (marked.parse(processed) as string).replace(/<a href=/g, '<a target="_blank" rel="noopener" href=')
      setPreview(html)
    })
  }, [doc.content])

  const created = new Date(doc.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: 'var(--font-sans)' }}>
      {/* Header */}
      <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ fontFamily: 'var(--font-serif)', fontSize: '1.1rem', fontWeight: 600, color: 'var(--accent)' }}>Canopy</span>
        <span style={{ color: 'var(--border)' }}>·</span>
        <span style={{ fontSize: '13px', color: 'var(--muted)' }}>Shared document</span>
        {doc.link_permission === 'view' && (
          <span style={{ background: '#fdf3e3', color: '#8b5e00', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 500 }}>View only</span>
        )}
        <div style={{ marginLeft: 'auto' }}>
          <a href="/login" style={{ background: 'var(--accent)', color: '#fff', padding: '6px 14px', borderRadius: '7px', fontSize: '13px', textDecoration: 'none', fontWeight: 500 }}>
            Sign in to Canopy
          </a>
        </div>
      </div>

      {/* Doc content */}
      <div style={{ maxWidth: '780px', margin: '0 auto', padding: '48px 32px' }}>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '2.2rem', fontWeight: 600, marginBottom: '8px', color: 'var(--text)' }}>{doc.title}</h1>
        <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '32px' }}>Created {created}</div>
        <div className="prose" dangerouslySetInnerHTML={{ __html: preview }} />
      </div>
    </div>
  )
}

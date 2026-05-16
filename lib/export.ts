import type { SupabaseClient } from '@supabase/supabase-js'

function renderNodes(nodes: any[]): string {
  if (!nodes) return ''
  return nodes.map(node => {
    switch (node.type) {
      case 'heading': return `<h${node.attrs?.level || 1}>${renderNodes(node.content || [])}</h${node.attrs?.level || 1}>`
      case 'paragraph': return `<p>${renderNodes(node.content || [])}</p>`
      case 'text': {
        let t = node.text || ''
        if (node.marks) node.marks.forEach((m: any) => {
          if (m.type === 'bold') t = `<strong>${t}</strong>`
          if (m.type === 'italic') t = `<em>${t}</em>`
          if (m.type === 'underline') t = `<u>${t}</u>`
          if (m.type === 'strike') t = `<s>${t}</s>`
          if (m.type === 'code') t = `<code>${t}</code>`
          if (m.type === 'link') t = `<a href="${m.attrs?.href}">${t}</a>`
        })
        return t
      }
      case 'bulletList': return `<ul>${renderNodes(node.content || [])}</ul>`
      case 'orderedList': return `<ol>${renderNodes(node.content || [])}</ol>`
      case 'listItem': return `<li>${renderNodes(node.content || [])}</li>`
      case 'blockquote': return `<blockquote>${renderNodes(node.content || [])}</blockquote>`
      case 'codeBlock': return `<pre><code>${renderNodes(node.content || [])}</code></pre>`
      case 'hardBreak': return '<br>'
      case 'horizontalRule': return '<hr>'
      case 'image': return `<img src="${node.attrs?.src}" style="max-width:100%">`
      case 'table': return `<table>${renderNodes(node.content || [])}</table>`
      case 'tableRow': return `<tr>${renderNodes(node.content || [])}</tr>`
      case 'tableCell': case 'tableHeader': return `<td>${renderNodes(node.content || [])}</td>`
      default: return renderNodes(node.content || [])
    }
  }).join('')
}

function extractContent(raw: any): any[] {
  return Array.isArray(raw) ? raw : (raw?.content || [])
}

export async function exportPageAsPDF(pageId: string, supabase: SupabaseClient, onDone: () => void) {
  const { data: p } = await supabase.from('pages').select('title, content').eq('id', pageId).single()
  if (!p) return
  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${p.title || 'Untitled'}</title>
  <style>body{font-family:Inter,-apple-system,sans-serif;max-width:800px;margin:40px auto;font-size:14px;line-height:1.6;color:#37352f;}
  h1{font-size:22pt;font-weight:700;margin-bottom:12pt;}h2{font-size:16pt;font-weight:600;}h3{font-size:13pt;font-weight:600;}
  p{margin:4pt 0;}ul,ol{padding-left:20pt;}table{border-collapse:collapse;width:100%;}td,th{border:1px solid #e9e9e7;padding:6px 10px;}
  blockquote{border-left:3px solid #ccc;padding:4px 16px;color:#787774;font-style:italic;}
  code{background:#f0f0f0;padding:2px 4px;border-radius:3px;font-family:monospace;}
  </style></head><body>`)
  win.document.write(`<h1>${p.title || 'Untitled'}</h1>`)
  win.document.write(renderNodes(extractContent(p.content)))
  win.document.write('</body></html>')
  win.document.close()
  win.focus()
  setTimeout(() => { win.print() }, 500)
  onDone()
}

export async function exportPageAsWord(pageId: string, supabase: SupabaseClient, onDone: () => void) {
  const { data: p } = await supabase.from('pages').select('title, content, icon').eq('id', pageId).single()
  if (!p) return
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${p.title}</title>
  <style>body{font-family:Arial,sans-serif;font-size:12pt;line-height:1.5;}h1{font-size:18pt;}h2{font-size:14pt;}table{border-collapse:collapse;}td,th{border:1px solid #ccc;padding:6px;}</style>
  </head><body><h1>${p.icon || ''} ${p.title || 'Untitled'}</h1>${renderNodes(extractContent(p.content))}</body></html>`
  const blob = new Blob([html], { type: 'application/msword' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = (p.title || 'page') + '.doc'
  a.click()
  URL.revokeObjectURL(url)
  onDone()
}

export async function exportPageAsCSV(pageId: string, supabase: SupabaseClient, onDone: () => void) {
  const [{ data: fields }, { data: records }, { data: p }] = await Promise.all([
    supabase.from('db_fields').select('*').eq('page_id', pageId).order('position'),
    supabase.from('db_records').select('*').eq('page_id', pageId).order('position'),
    supabase.from('pages').select('title').eq('id', pageId).single(),
  ])
  if (!fields) return
  const header = fields.map((f: any) => `"${f.name.replace(/"/g, '""')}"`).join(',')
  const rows = (records || []).map((rec: any) =>
    fields.map((f: any) => `"${String(rec.data?.[f.id] ?? '').replace(/"/g, '""')}"`)
      .join(',')
  )
  const csv = [header, ...rows].join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = (p?.title || 'database') + '.csv'
  a.click()
  URL.revokeObjectURL(url)
  onDone()
}

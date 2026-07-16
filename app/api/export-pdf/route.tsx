import type { ReactNode } from 'react'
import { NextRequest, NextResponse } from 'next/server'
import { Document, Page, View, Text, Link, StyleSheet, renderToBuffer } from '@react-pdf/renderer'

export const runtime = 'nodejs'

function buildStyles(zoom: number) {
  const z = (size: number) => size * zoom
  return StyleSheet.create({
    page: { padding: 48, fontFamily: 'Helvetica', fontSize: z(11), lineHeight: 1.5, color: '#1a1a1a' },
    title: { fontFamily: 'Helvetica-Bold', fontSize: z(24), marginBottom: 28 },
    h1: { fontFamily: 'Helvetica-Bold', fontSize: z(18), marginTop: 16, marginBottom: 8 },
    h2: { fontFamily: 'Helvetica-Bold', fontSize: z(15), marginTop: 14, marginBottom: 7 },
    h3: { fontFamily: 'Helvetica-Bold', fontSize: z(13), marginTop: 12, marginBottom: 6 },
    h4: { fontFamily: 'Helvetica-Bold', fontSize: z(11.5), marginTop: 10, marginBottom: 5 },
    paragraph: { marginBottom: 8 },
    listRow: { flexDirection: 'row', marginBottom: 0 },
    listMarker: { width: z(20), flexShrink: 0, lineHeight: 1 },
    listContent: { flex: 1, lineHeight: 1 },
    blockquote: { borderLeft: '2pt solid #aaaaaa', paddingLeft: 10, marginBottom: 8, fontStyle: 'italic', color: '#444444' },
    code: { fontFamily: 'Courier', fontSize: z(9), backgroundColor: '#f5f5f5', padding: 8, marginBottom: 8 },
    hr: { borderBottom: '1pt solid #d4d4d4', marginVertical: 10 },
    callout: { backgroundColor: '#fafafa', padding: 10, marginBottom: 8, flexDirection: 'row' },
    toc: { border: '1pt solid #d4d4d4', borderRadius: 4, padding: 12, marginBottom: 16 },
    tocTitle: { fontFamily: 'Helvetica-Bold', fontSize: z(8), letterSpacing: 1, color: '#888888', marginBottom: 6 },
    table: { marginBottom: 8 },
    tableRow: { flexDirection: 'row' },
    tableCell: { flex: 1, border: '0.5pt solid #d4d4d4', padding: 5, fontSize: z(10) },
    tableCellHeader: { flex: 1, border: '0.5pt solid #d4d4d4', padding: 5, fontSize: z(10), fontFamily: 'Helvetica-Bold', backgroundColor: '#f5f5f5' },
    link: { color: '#333333', textDecoration: 'underline' },
  })
}

type Styles = ReturnType<typeof buildStyles>

// ── Inline content (text + marks) → react-pdf <Text>/<Link> children ────────
function inlineToNodes(nodes: any[], keyPrefix: string, styles: Styles): ReactNode[] {
  return (nodes || []).map((node, i) => {
    const key = `${keyPrefix}-${i}`
    if (node.type === 'hardBreak') return <Text key={key}>{'\n'}</Text>
    if (node.type === 'pageMention' || node.type === 'mention') {
      return <Text key={key} style={{ fontStyle: 'italic' }}>@{node.attrs?.label || 'Page'}</Text>
    }
    if (node.type !== 'text') return null
    const marks = (node.marks || []).map((m: any) => m.type)
    const textStyle: any = {}
    if (marks.includes('bold')) textStyle.fontFamily = 'Helvetica-Bold'
    if (marks.includes('italic')) textStyle.fontStyle = 'italic'
    if (marks.includes('underline')) textStyle.textDecoration = 'underline'
    if (marks.includes('strike')) textStyle.textDecoration = 'line-through'
    if (marks.includes('code')) { textStyle.fontFamily = 'Courier'; textStyle.backgroundColor = '#f0f0f0' }
    const link = (node.marks || []).find((m: any) => m.type === 'link')
    if (link?.attrs?.href) {
      return <Link key={key} src={link.attrs.href} style={{ ...styles.link, ...textStyle }}>{node.text}</Link>
    }
    return <Text key={key} style={textStyle}>{node.text}</Text>
  })
}

// ── Collect all headings in the document tree (for the TOC block) ───────────
function collectHeadings(nodes: any[]): { title: string; level: number }[] {
  const out: { title: string; level: number }[] = []
  function walk(node: any) {
    if (node.type === 'heading') {
      const title = (node.content || []).map((c: any) => c.text || '').join('')
      if (title) out.push({ title, level: node.attrs?.level || 1 })
    }
    if (node.content) node.content.forEach(walk)
  }
  nodes.forEach(walk)
  return out
}

// ── Block content → react-pdf elements ───────────────────────────────────────
function blocksToPdf(nodes: any[], keyPrefix: string, allHeadings: { title: string; level: number }[], styles: Styles): ReactNode[] {
  const headingStyles = [styles.h1, styles.h2, styles.h3, styles.h4, styles.h4, styles.h4]
  const out: ReactNode[] = []
  ;(nodes || []).forEach((node, i) => {
    const key = `${keyPrefix}-${i}`
    switch (node.type) {
      case 'heading': {
        const level = Math.min(Math.max(node.attrs?.level || 1, 1), 6)
        out.push(<Text key={key} style={headingStyles[level - 1]}>{inlineToNodes(node.content, key, styles)}</Text>)
        break
      }
      case 'paragraph':
        out.push(<Text key={key} style={styles.paragraph}>{inlineToNodes(node.content, key, styles)}</Text>)
        break
      case 'bulletList':
        out.push(...listToPdf(node.content, key, 'bullet', 0, styles))
        break
      case 'orderedList':
        out.push(...listToPdf(node.content, key, 'ordered', 0, styles))
        break
      case 'taskList':
        out.push(...taskListToPdf(node.content, key, 0, styles))
        break
      case 'blockquote':
        (node.content || []).forEach((child: any, j: number) => {
          if (child.type === 'paragraph') {
            out.push(<Text key={`${key}-${j}`} style={styles.blockquote}>{inlineToNodes(child.content, `${key}-${j}`, styles)}</Text>)
          } else out.push(...blocksToPdf([child], `${key}-${j}`, allHeadings, styles))
        })
        break
      case 'codeBlock': {
        const code = (node.content || []).map((c: any) => c.text || '').join('')
        out.push(<Text key={key} style={styles.code}>{code}</Text>)
        break
      }
      case 'horizontalRule':
        out.push(<View key={key} style={styles.hr} />)
        break
      case 'callout': {
        // Helvetica (the base PDF font used here) has no emoji glyphs, so
        // node.attrs.emoji is intentionally not rendered — it would overlap
        // with the following text as a broken/notdef glyph.
        out.push(
          <View key={key} style={styles.callout}>
            <Text>{inlineToNodes(node.content, key, styles)}</Text>
          </View>
        )
        break
      }
      case 'toc':
        out.push(
          <View key={key} style={styles.toc}>
            <Text style={styles.tocTitle}>TABLE OF CONTENTS</Text>
            {allHeadings.map((h, j) => (
              <Text key={`${key}-${j}`} style={{ marginBottom: 2, marginLeft: (h.level - 1) * 12 }}>{h.title}</Text>
            ))}
          </View>
        )
        break
      case 'subpage':
        out.push(<Text key={key} style={{ fontStyle: 'italic', marginBottom: 8 }}>📄 Linked page</Text>)
        break
      case 'image':
        if (node.attrs?.alt) out.push(<Text key={key} style={{ fontStyle: 'italic', marginBottom: 8 }}>[Image: {node.attrs.alt}]</Text>)
        break
      case 'table':
        out.push(tableToPdf(node, key, styles))
        break
      case 'columns':
        (node.content || []).forEach((col: any, j: number) => out.push(...blocksToPdf(col.content || [], `${key}-${j}`, allHeadings, styles)))
        break
      default:
        out.push(...blocksToPdf(node.content || [], key, allHeadings, styles))
    }
  })
  return out
}

function listToPdf(items: any[], keyPrefix: string, kind: 'bullet' | 'ordered', depth: number, styles: Styles): ReactNode[] {
  const out: ReactNode[] = []
  ;(items || []).forEach((li, i) => {
    const key = `${keyPrefix}-${i}`
    ;(li.content || []).forEach((child: any, j: number) => {
      const childKey = `${key}-${j}`
      if (child.type === 'paragraph') {
        const marker = kind === 'bullet' ? '•' : `${i + 1}.`
        out.push(
          <View key={childKey} style={[styles.listRow, { marginLeft: depth * 16 }]}>
            <Text style={styles.listMarker}>{marker}</Text>
            <Text style={styles.listContent}>{inlineToNodes(child.content, childKey, styles)}</Text>
          </View>
        )
      } else if (child.type === 'bulletList' || child.type === 'orderedList') {
        out.push(...listToPdf(child.content, childKey, child.type === 'bulletList' ? 'bullet' : 'ordered', depth + 1, styles))
      }
    })
  })
  return out
}

function taskListToPdf(items: any[], keyPrefix: string, depth: number, styles: Styles): ReactNode[] {
  const out: ReactNode[] = []
  ;(items || []).forEach((li, i) => {
    const key = `${keyPrefix}-${i}`
    const checked = li.attrs?.checked ? '☑' : '☐'
    ;(li.content || []).forEach((child: any, j: number) => {
      const childKey = `${key}-${j}`
      if (child.type === 'paragraph') {
        out.push(
          <View key={childKey} style={[styles.listRow, { marginLeft: depth * 16 }]}>
            <Text style={styles.listMarker}>{checked}</Text>
            <Text style={styles.listContent}>{inlineToNodes(child.content, childKey, styles)}</Text>
          </View>
        )
      } else if (child.type === 'taskList') {
        out.push(...taskListToPdf(child.content, childKey, depth + 1, styles))
      }
    })
  })
  return out
}

function tableToPdf(table: any, key: string, styles: Styles): ReactNode {
  return (
    <View key={key} style={styles.table}>
      {(table.content || []).map((row: any, i: number) => (
        <View key={`${key}-${i}`} style={styles.tableRow}>
          {(row.content || []).map((cell: any, j: number) => {
            const isHeader = cell.type === 'tableHeader'
            const cellKey = `${key}-${i}-${j}`
            const text = (cell.content || []).map((p: any) => (p.content || []).map((c: any) => c.text || '').join('')).join(' ')
            return <Text key={cellKey} style={isHeader ? styles.tableCellHeader : styles.tableCell}>{text}</Text>
          })}
        </View>
      ))}
    </View>
  )
}

function extractContent(raw: unknown): any[] {
  if (Array.isArray(raw)) return raw
  if (raw && typeof raw === 'object' && 'content' in (raw as any)) return (raw as any).content || []
  return []
}

export async function POST(req: NextRequest) {
  // The client also sends `icon` (an emoji), but Helvetica — the base font
  // used here — has no emoji glyphs, so it's intentionally not rendered.
  const { title, content, zoom } = await req.json()
  const nodes = extractContent(content)
  const allHeadings = collectHeadings(nodes)
  const styles = buildStyles(typeof zoom === 'number' && zoom > 0 ? zoom : 1)

  const doc = (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        {/* icon is an emoji; Helvetica has no emoji glyphs so it's omitted here to avoid overlapping/broken glyphs */}
        <Text style={styles.title}>{title || 'Untitled'}</Text>
        {blocksToPdf(nodes, 'b', allHeadings, styles)}
      </Page>
    </Document>
  )

  const buf = await renderToBuffer(doc)
  const safe = (title || 'page').replace(/[^a-z0-9]/gi, '_').slice(0, 60) || 'page'
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${safe}.pdf"`,
    },
  })
}

import { NextRequest, NextResponse } from 'next/server'
import {
  Document, Packer, Paragraph, TextRun, ExternalHyperlink, HeadingLevel,
  Table, TableRow, TableCell, TableOfContents, ShadingType, BorderStyle,
  AlignmentType, LevelFormat, WidthType,
} from 'docx'

export const runtime = 'nodejs'

const HEADING_LEVELS = [
  HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6,
]

// ── Inline content (text + marks) → docx runs ────────────────────────────────
function inlineToRuns(nodes: any[], forceBold = false): (TextRun | ExternalHyperlink)[] {
  const runs: (TextRun | ExternalHyperlink)[] = []
  for (const node of nodes || []) {
    if (node.type === 'hardBreak') { runs.push(new TextRun({ text: '', break: 1 })); continue }
    if (node.type === 'pageMention' || node.type === 'mention') {
      runs.push(new TextRun({ text: `@${node.attrs?.label || 'Page'}`, italics: true, bold: forceBold }))
      continue
    }
    if (node.type !== 'text') continue
    const marks = (node.marks || []).map((m: any) => m.type)
    const opts = {
      text: node.text || '',
      bold: forceBold || marks.includes('bold'),
      italics: marks.includes('italic'),
      underline: marks.includes('underline') ? {} : undefined,
      strike: marks.includes('strike'),
      font: marks.includes('code') ? 'Courier New' : undefined,
      shading: marks.includes('code') ? { type: ShadingType.CLEAR, fill: 'F0F0F0' } : undefined,
    }
    const link = (node.marks || []).find((m: any) => m.type === 'link')
    if (link?.attrs?.href) {
      runs.push(new ExternalHyperlink({ link: link.attrs.href, children: [new TextRun({ ...opts, style: 'Hyperlink' })] }))
    } else {
      runs.push(new TextRun(opts))
    }
  }
  return runs.length ? runs : [new TextRun('')]
}

// ── Collect all headings in the document tree (for the TOC field's cached fallback) ──
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

// ── Block content → docx document children (Paragraph | Table | TableOfContents) ──
function blocksToDocx(nodes: any[], listDepth = 0, allHeadings: { title: string; level: number }[] = []): any[] {
  const out: any[] = []
  for (const node of nodes || []) {
    switch (node.type) {
      case 'heading': {
        const level = Math.min(Math.max(node.attrs?.level || 1, 1), 6)
        out.push(new Paragraph({ heading: HEADING_LEVELS[level - 1], children: inlineToRuns(node.content) }))
        break
      }
      case 'paragraph':
        out.push(new Paragraph({ children: inlineToRuns(node.content), spacing: { after: 160 } }))
        break
      case 'bulletList':
        for (const li of node.content || []) out.push(...listItemToDocx(li, listDepth, 'bullet'))
        break
      case 'orderedList':
        for (const li of node.content || []) out.push(...listItemToDocx(li, listDepth, 'ordered'))
        break
      case 'taskList':
        for (const li of node.content || []) out.push(...taskItemToDocx(li, listDepth))
        break
      case 'blockquote':
        for (const child of node.content || []) {
          if (child.type === 'paragraph') {
            out.push(new Paragraph({
              children: inlineToRuns(child.content),
              indent: { left: 480 },
              border: { left: { style: BorderStyle.SINGLE, size: 12, color: 'AAAAAA', space: 8 } },
              spacing: { after: 160 },
            }))
          } else out.push(...blocksToDocx([child], listDepth, allHeadings))
        }
        break
      case 'codeBlock': {
        const code = (node.content || []).map((c: any) => c.text || '').join('')
        for (const line of code.split('\n')) {
          out.push(new Paragraph({
            children: [new TextRun({ text: line || ' ', font: 'Courier New', size: 20 })],
            shading: { type: ShadingType.CLEAR, fill: 'F5F5F5' },
            spacing: { after: 0 },
          }))
        }
        break
      }
      case 'horizontalRule':
        out.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'D4D4D4', space: 4 } } }))
        break
      case 'callout': {
        const emoji = node.attrs?.emoji ? `${node.attrs.emoji}  ` : ''
        const runs = inlineToRuns(node.content)
        out.push(new Paragraph({
          children: emoji ? [new TextRun(emoji), ...runs] : runs,
          shading: { type: ShadingType.CLEAR, fill: 'FAFAFA' },
          spacing: { before: 80, after: 160 },
          indent: { left: 120, right: 120 },
        }))
        break
      }
      case 'toc':
        out.push(new TableOfContents('Table of Contents', {
          hyperlink: true,
          headingStyleRange: '1-3',
          cachedEntries: allHeadings,
          beginDirty: true,
        }))
        break
      case 'subpage':
        out.push(new Paragraph({ children: [new TextRun({ text: '📄 Linked page', italics: true })], spacing: { after: 160 } }))
        break
      case 'image':
        // Skipping embedded image bytes — would require fetching each image server-side.
        if (node.attrs?.alt) out.push(new Paragraph({ children: [new TextRun({ text: `[Image: ${node.attrs.alt}]`, italics: true })] }))
        break
      case 'table':
        out.push(tableToDocx(node))
        break
      case 'columns':
        for (const col of node.content || []) out.push(...blocksToDocx(col.content || [], listDepth, allHeadings))
        break
      default:
        out.push(...blocksToDocx(node.content || [], listDepth, allHeadings))
    }
  }
  return out
}

function listItemToDocx(li: any, depth: number, kind: 'bullet' | 'ordered'): Paragraph[] {
  const out: Paragraph[] = []
  for (const child of li.content || []) {
    if (child.type === 'paragraph') {
      out.push(new Paragraph({
        children: inlineToRuns(child.content),
        bullet: kind === 'bullet' ? { level: depth } : undefined,
        numbering: kind === 'ordered' ? { reference: 'ordered-list', level: depth } : undefined,
      }))
    } else if (child.type === 'bulletList' || child.type === 'orderedList') {
      const nestedKind = child.type === 'bulletList' ? 'bullet' : 'ordered'
      for (const nestedLi of child.content || []) out.push(...listItemToDocx(nestedLi, depth + 1, nestedKind))
    } else {
      out.push(...(blocksToDocx([child], depth) as Paragraph[]))
    }
  }
  return out
}

function taskItemToDocx(li: any, depth: number): Paragraph[] {
  const checked = li.attrs?.checked ? '☑' : '☐'
  const out: Paragraph[] = []
  for (const child of li.content || []) {
    if (child.type === 'paragraph') {
      out.push(new Paragraph({ children: [new TextRun(`${checked} `), ...inlineToRuns(child.content)], indent: { left: depth * 360 } }))
    } else if (child.type === 'taskList') {
      for (const nestedLi of child.content || []) out.push(...taskItemToDocx(nestedLi, depth + 1))
    }
  }
  return out
}

const PAGE_CONTENT_WIDTH_TWIPS = 9360 // Letter width minus 1in margins each side

function tableToDocx(table: any): Table {
  const numCols = Math.max(1, ...(table.content || []).map((row: any) => (row.content || []).length))
  const colWidth = Math.floor(PAGE_CONTENT_WIDTH_TWIPS / numCols)

  const rows = (table.content || []).map((row: any) => new TableRow({
    children: (row.content || []).map((cell: any) => {
      const isHeader = cell.type === 'tableHeader'
      const cellParagraphs = isHeader
        ? (cell.content || []).map((child: any) => new Paragraph({ children: inlineToRuns(child.content, true) }))
        : (blocksToDocx(cell.content || []).filter((n: any) => n instanceof Paragraph) as Paragraph[])
      return new TableCell({
        width: { size: colWidth, type: WidthType.DXA },
        shading: isHeader ? { type: ShadingType.CLEAR, fill: 'F5F5F5' } : undefined,
        children: cellParagraphs.length ? cellParagraphs : [new Paragraph('')],
      })
    }),
  }))
  return new Table({
    rows,
    width: { size: PAGE_CONTENT_WIDTH_TWIPS, type: WidthType.DXA },
    columnWidths: Array(numCols).fill(colWidth),
  })
}

function extractContent(raw: unknown): any[] {
  if (Array.isArray(raw)) return raw
  if (raw && typeof raw === 'object' && 'content' in (raw as any)) return (raw as any).content || []
  return []
}

export async function POST(req: NextRequest) {
  const { title, icon, content } = await req.json()
  const nodes = extractContent(content)
  const allHeadings = collectHeadings(nodes)

  const doc = new Document({
    numbering: {
      config: [{
        reference: 'ordered-list',
        levels: [0, 1, 2, 3].map(level => ({
          level, format: LevelFormat.DECIMAL, text: `%${level + 1}.`, alignment: AlignmentType.START,
        })),
      }],
    },
    sections: [{
      children: [
        new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(`${icon ? icon + ' ' : ''}${title || 'Untitled'}`)] }),
        ...blocksToDocx(nodes, 0, allHeadings),
      ],
    }],
  })

  const buf = await Packer.toBuffer(doc)
  const safe = (title || 'page').replace(/[^a-z0-9]/gi, '_').slice(0, 60) || 'page'
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${safe}.docx"`,
    },
  })
}

import { NextRequest, NextResponse } from 'next/server'
import pptxgen from 'pptxgenjs'

const THEMES = {
  minimal: {
    bg: 'FFFFFF', titleColor: '111827', textColor: '374151',
    accentColor: '6366F1', accentLight: 'EEF2FF',
    titleSlide: { bg: '111827', titleColor: 'FFFFFF', subtitleColor: 'A5B4FC' },
    sectionBg: '6366F1', sectionText: 'FFFFFF',
    font: 'Calibri', statColor: '6366F1',
  },
  corporate: {
    bg: 'FFFFFF', titleColor: '1E3A5F', textColor: '2D3748',
    accentColor: '1E3A5F', accentLight: 'E8F0F8',
    titleSlide: { bg: '1E3A5F', titleColor: 'FFFFFF', subtitleColor: 'A0BDD8' },
    sectionBg: '1E3A5F', sectionText: 'FFFFFF',
    font: 'Calibri', statColor: '1E3A5F',
  },
  dark: {
    bg: '1E1E2E', titleColor: 'CDD6F4', textColor: 'BAC2DE',
    accentColor: '89B4FA', accentLight: '313244',
    titleSlide: { bg: '11111B', titleColor: 'CDD6F4', subtitleColor: '89B4FA' },
    sectionBg: '313244', sectionText: '89B4FA',
    font: 'Calibri', statColor: 'A6E3A1',
  },
  colorful: {
    bg: 'FDFCFF', titleColor: '4C1D95', textColor: '1F2937',
    accentColor: '7C3AED', accentLight: 'EDE9FE',
    titleSlide: { bg: '7C3AED', titleColor: 'FFFFFF', subtitleColor: 'DDD6FE' },
    sectionBg: 'F59E0B', sectionText: 'FFFFFF',
    font: 'Calibri', statColor: '7C3AED',
  },
} as const

type ThemeKey = keyof typeof THEMES

function tiptapToText(node: any): string {
  if (!node) return ''
  if (node.type === 'text') return node.text || ''
  const children = (node.content || []).map((c: any) => tiptapToText(c)).join('')
  switch (node.type) {
    case 'heading': return `${'#'.repeat(node.attrs?.level || 1)} ${children}\n`
    case 'paragraph': return children ? `${children}\n` : '\n'
    case 'bulletList':
    case 'orderedList': return children
    case 'listItem': return `• ${children.trim()}\n`
    case 'blockquote': return `"${children.trim()}"\n`
    case 'codeBlock': return `[Code: ${(children || '').slice(0, 80)}]\n`
    case 'table': return `[Table]\n`
    default: return children
  }
}

// Draw a colored circle with a number inside (for numbered bullets)
function addNumberedBullets(s: pptxgen.Slide, items: string[], x: number, y: number, w: number, t: typeof THEMES[ThemeKey]) {
  items.forEach((item, i) => {
    const cy = y + i * 0.72
    // Circle background
    s.addShape('ellipse' as any, {
      x, y: cy, w: 0.32, h: 0.32,
      fill: { color: t.accentColor },
      line: { color: t.accentColor },
    })
    // Number in circle
    s.addText(String(i + 1), {
      x, y: cy + 0.01, w: 0.32, h: 0.32,
      fontSize: 11, bold: true, color: 'FFFFFF',
      fontFace: t.font, align: 'center', valign: 'middle',
    })
    // Bullet text
    s.addText(item, {
      x: x + 0.42, y: cy, w: w - 0.42, h: 0.34,
      fontSize: 16, color: t.textColor,
      fontFace: t.font, valign: 'middle',
    })
  })
}

// Rounded content card with subtle background
function addCard(s: pptxgen.Slide, x: number, y: number, w: number, h: number, t: typeof THEMES[ThemeKey]) {
  s.addShape(pptxgen.ShapeType.roundRect, {
    x, y, w, h,
    fill: { color: t.accentLight },
    line: { color: t.accentLight },
    rectRadius: 0.12,
  })
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'GROQ_API_KEY not configured' }, { status: 500 })

  const { content, title, theme = 'minimal' } = await req.json()
  const t = THEMES[(theme as ThemeKey) in THEMES ? (theme as ThemeKey) : 'minimal']
  const pageText = typeof content === 'string' ? content : tiptapToText(content)

  // 1. Groq generates rich slide structure
  const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 3000,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are an expert presentation designer. Transform document content into a rich, varied slide deck with different layouts.

Return ONLY a JSON object:
{
  "slides": [ ... ]
}

Available slide types — use a good mix of them:

1. Title slide (always first):
{ "type": "title", "title": "...", "subtitle": "One compelling sentence summarizing the document" }

2. Section divider:
{ "type": "section", "title": "Section name", "subtitle": "Optional short description" }

3. Bullets (numbered, 3-5 items, each item should be a FULL SENTENCE, at least 10 words):
{ "type": "bullets", "title": "...", "bullets": ["Complete sentence explaining the first point in detail.", "Another full sentence with specific information."] }

4. Two columns (compare or contrast two aspects, 2-3 points each):
{ "type": "two-col", "title": "...", "col1": { "heading": "Left heading", "points": ["Point with details.", "Another point."] }, "col2": { "heading": "Right heading", "points": ["Point with details.", "Another point."] } }

5. Large quote:
{ "type": "quote", "quote": "A memorable or important sentence from the document, at least 15 words long.", "source": "Context or author" }

6. Key stats / numbers (2-3 stats):
{ "type": "stats", "title": "...", "stats": [{ "value": "42%", "label": "Short explanation" }, { "value": "3x", "label": "Short explanation" }] }

Rules:
- 7 to 12 slides total
- Use AT LEAST one two-col slide and one stats or quote slide
- Bullets must be FULL SENTENCES (not just keywords)
- Keep the original document's language (French if French, English if English)
- Notes field (optional): one sentence of speaker notes on any slide type`,
        },
        {
          role: 'user',
          content: `Title: ${title || 'Untitled'}\n\n${pageText.slice(0, 5000)}`,
        },
      ],
    }),
  })

  if (!groqRes.ok) {
    const err = await groqRes.text()
    return NextResponse.json({ error: `AI error: ${err}` }, { status: 500 })
  }

  const groqData = await groqRes.json()
  let slides: any[]
  try {
    const parsed = JSON.parse(groqData.choices[0].message.content)
    slides = Array.isArray(parsed.slides) ? parsed.slides : []
    if (!slides.length) throw new Error('No slides')
  } catch {
    return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 })
  }

  // 2. Build .pptx
  const prs = new pptxgen()
  prs.layout = 'LAYOUT_WIDE' // 10 x 5.625 inches

  for (const slide of slides) {
    const s = prs.addSlide()

    // ── TITLE SLIDE ──────────────────────────────────────────────
    if (slide.type === 'title') {
      s.background = { color: t.titleSlide.bg }
      // Left accent bar (full height)
      s.addShape(pptxgen.ShapeType.rect, { x: 0, y: 0, w: 0.18, h: '100%', fill: { color: t.accentColor }, line: { color: t.accentColor } })
      // Decorative circle top-right
      s.addShape('ellipse' as any, { x: 8.2, y: -0.8, w: 2.8, h: 2.8, fill: { color: t.accentColor }, line: { color: t.accentColor } })
      s.addShape('ellipse' as any, { x: 8.6, y: -0.4, w: 2.2, h: 2.2, fill: { color: t.titleSlide.bg }, line: { color: t.titleSlide.bg } })

      s.addText(slide.title || '', {
        x: 0.55, y: 1.4, w: 8.0, h: 1.8,
        fontSize: 42, bold: true, color: t.titleSlide.titleColor,
        fontFace: t.font, align: 'left', valign: 'middle',
      })
      if (slide.subtitle) {
        s.addShape(pptxgen.ShapeType.rect, { x: 0.55, y: 3.35, w: 1.2, h: 0.06, fill: { color: t.accentColor }, line: { color: t.accentColor } })
        s.addText(slide.subtitle, {
          x: 0.55, y: 3.55, w: 7.5, h: 1.2,
          fontSize: 19, color: t.titleSlide.subtitleColor,
          fontFace: t.font, align: 'left',
        })
      }

    // ── SECTION ──────────────────────────────────────────────────
    } else if (slide.type === 'section') {
      s.background = { color: t.sectionBg }
      // Decorative large number / circle
      s.addShape('ellipse' as any, { x: 6.5, y: 0.3, w: 4.5, h: 4.5, fill: { color: 'FFFFFF' }, line: { color: 'FFFFFF' } })
      // Clip with another circle to make a crescent-like shape
      s.addShape('ellipse' as any, { x: 7.2, y: -0.2, w: 4.5, h: 4.5, fill: { color: t.sectionBg }, line: { color: t.sectionBg } })

      s.addText(slide.title || '', {
        x: 0.6, y: 1.5, w: 6.5, h: 1.6,
        fontSize: 36, bold: true, color: t.sectionText,
        fontFace: t.font, align: 'left', valign: 'middle',
      })
      if (slide.subtitle) {
        s.addText(slide.subtitle, {
          x: 0.6, y: 3.3, w: 6.0, h: 1.0,
          fontSize: 17, color: t.sectionText, fontFace: t.font, align: 'left',
        })
      }

    // ── BULLETS (numbered) ───────────────────────────────────────
    } else if (slide.type === 'bullets') {
      s.background = { color: t.bg }
      // Title bar
      s.addShape(pptxgen.ShapeType.rect, { x: 0, y: 0, w: '100%', h: 1.1, fill: { color: t.accentColor }, line: { color: t.accentColor } })
      s.addText(slide.title || '', {
        x: 0.5, y: 0.1, w: 9.0, h: 0.9,
        fontSize: 26, bold: true, color: 'FFFFFF',
        fontFace: t.font, align: 'left', valign: 'middle',
      })
      const bullets: string[] = slide.bullets || []
      addNumberedBullets(s, bullets, 0.5, 1.3, 9.2, t)

    // ── TWO COLUMNS ──────────────────────────────────────────────
    } else if (slide.type === 'two-col') {
      s.background = { color: t.bg }
      // Slide title
      s.addText(slide.title || '', {
        x: 0.4, y: 0.2, w: 9.2, h: 0.7,
        fontSize: 24, bold: true, color: t.titleColor,
        fontFace: t.font, align: 'left',
      })
      s.addShape(pptxgen.ShapeType.rect, { x: 0.4, y: 0.95, w: 9.2, h: 0.04, fill: { color: t.accentColor }, line: { color: t.accentColor } })

      const col1 = slide.col1 || {}
      const col2 = slide.col2 || {}

      // Left card
      addCard(s, 0.3, 1.1, 4.5, 4.2, t)
      s.addShape(pptxgen.ShapeType.rect, { x: 0.3, y: 1.1, w: 4.5, h: 0.52, fill: { color: t.accentColor }, line: { color: t.accentColor }, rectRadius: 0.12 } as any)
      s.addText(col1.heading || '', {
        x: 0.45, y: 1.1, w: 4.2, h: 0.52,
        fontSize: 15, bold: true, color: 'FFFFFF',
        fontFace: t.font, align: 'left', valign: 'middle',
      })
      const points1: string[] = col1.points || []
      points1.forEach((pt: string, i: number) => {
        s.addText(`• ${pt}`, {
          x: 0.45, y: 1.75 + i * 0.85, w: 4.1, h: 0.75,
          fontSize: 14, color: t.textColor, fontFace: t.font,
          valign: 'top', wrap: true,
        })
      })

      // Right card
      addCard(s, 5.2, 1.1, 4.5, 4.2, t)
      s.addShape(pptxgen.ShapeType.rect, { x: 5.2, y: 1.1, w: 4.5, h: 0.52, fill: { color: t.accentColor }, line: { color: t.accentColor }, rectRadius: 0.12 } as any)
      s.addText(col2.heading || '', {
        x: 5.35, y: 1.1, w: 4.2, h: 0.52,
        fontSize: 15, bold: true, color: 'FFFFFF',
        fontFace: t.font, align: 'left', valign: 'middle',
      })
      const points2: string[] = col2.points || []
      points2.forEach((pt: string, i: number) => {
        s.addText(`• ${pt}`, {
          x: 5.35, y: 1.75 + i * 0.85, w: 4.1, h: 0.75,
          fontSize: 14, color: t.textColor, fontFace: t.font,
          valign: 'top', wrap: true,
        })
      })

    // ── QUOTE ────────────────────────────────────────────────────
    } else if (slide.type === 'quote') {
      s.background = { color: t.bg }
      // Big decorative quotation mark
      s.addText('“', {
        x: 0.3, y: -0.3, w: 2.5, h: 2.5,
        fontSize: 180, color: t.accentLight,
        fontFace: t.font, align: 'left',
      })
      // Accent left bar
      s.addShape(pptxgen.ShapeType.rect, { x: 0.55, y: 1.1, w: 0.1, h: 2.8, fill: { color: t.accentColor }, line: { color: t.accentColor } })
      s.addText(slide.quote || '', {
        x: 0.85, y: 1.0, w: 8.0, h: 3.0,
        fontSize: 22, italic: true, color: t.titleColor,
        fontFace: t.font, align: 'left', valign: 'middle',
      })
      if (slide.source) {
        s.addText(`— ${slide.source}`, {
          x: 0.85, y: 4.1, w: 8.0, h: 0.5,
          fontSize: 14, color: t.accentColor, bold: true,
          fontFace: t.font, align: 'left',
        })
      }

    // ── STATS ────────────────────────────────────────────────────
    } else if (slide.type === 'stats') {
      s.background = { color: t.bg }
      s.addText(slide.title || '', {
        x: 0.4, y: 0.2, w: 9.2, h: 0.7,
        fontSize: 26, bold: true, color: t.titleColor,
        fontFace: t.font, align: 'center',
      })
      s.addShape(pptxgen.ShapeType.rect, { x: 3.5, y: 0.95, w: 3.0, h: 0.04, fill: { color: t.accentColor }, line: { color: t.accentColor } })

      const stats: { value: string; label: string }[] = slide.stats || []
      const count = Math.min(stats.length, 3)
      const cardW = count === 2 ? 4.2 : 2.9
      const startX = count === 2 ? 0.75 : 0.35
      const gap = count === 2 ? 4.6 : 3.15

      stats.slice(0, count).forEach((st, i) => {
        const cx = startX + i * gap
        addCard(s, cx, 1.2, cardW, 3.5, t)
        // Big number
        s.addText(st.value, {
          x: cx + 0.1, y: 1.5, w: cardW - 0.2, h: 1.8,
          fontSize: 64, bold: true, color: t.statColor,
          fontFace: t.font, align: 'center', valign: 'middle',
        })
        // Label
        s.addShape(pptxgen.ShapeType.rect, { x: cx + cardW / 2 - 0.6, y: 3.3, w: 1.2, h: 0.05, fill: { color: t.accentColor }, line: { color: t.accentColor } })
        s.addText(st.label, {
          x: cx + 0.1, y: 3.45, w: cardW - 0.2, h: 0.9,
          fontSize: 14, color: t.textColor,
          fontFace: t.font, align: 'center', valign: 'top', wrap: true,
        })
      })
    }

    // Speaker notes on any slide
    if (slide.notes) s.addNotes(slide.notes)
  }

  const buffer = await prs.write({ outputType: 'nodebuffer' }) as Buffer
  const safeTitle = (title || 'presentation').replace(/[^a-z0-9]/gi, '_').slice(0, 40)
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'Content-Disposition': `attachment; filename="${safeTitle}.pptx"`,
    },
  })
}

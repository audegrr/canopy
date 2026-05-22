import { NextRequest, NextResponse } from 'next/server'
import pptxgen from 'pptxgenjs'

const THEMES = {
  minimal: {
    bg: 'FFFFFF',
    titleColor: '111827',
    textColor: '374151',
    accentColor: '6366F1',
    titleSlide: { bg: 'F9FAFB', titleColor: '111827', subtitleColor: '6B7280' },
    font: 'Calibri',
  },
  corporate: {
    bg: 'FFFFFF',
    titleColor: '1E3A5F',
    textColor: '2D3748',
    accentColor: '1E3A5F',
    titleSlide: { bg: '1E3A5F', titleColor: 'FFFFFF', subtitleColor: 'A0BDD8' },
    font: 'Calibri',
  },
  dark: {
    bg: '1E1E2E',
    titleColor: 'CDD6F4',
    textColor: 'BAC2DE',
    accentColor: '89B4FA',
    titleSlide: { bg: '11111B', titleColor: 'CDD6F4', subtitleColor: '89B4FA' },
    font: 'Calibri',
  },
  colorful: {
    bg: 'FFFFFF',
    titleColor: '7C3AED',
    textColor: '1F2937',
    accentColor: 'F59E0B',
    titleSlide: { bg: '7C3AED', titleColor: 'FFFFFF', subtitleColor: 'DDD6FE' },
    font: 'Calibri',
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
    case 'codeBlock': return `[Code block: ${(children || '').slice(0, 100)}]\n`
    case 'table': return `[Table]\n`
    default: return children
  }
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'GROQ_API_KEY not configured' }, { status: 500 })

  const { content, title, theme = 'minimal' } = await req.json()
  const t = THEMES[(theme as ThemeKey) in THEMES ? (theme as ThemeKey) : 'minimal']

  const pageText = typeof content === 'string' ? content : tiptapToText(content)

  // 1. Ask Groq to generate slide structure
  const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 2048,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are a presentation designer. Convert the document into a clear, well-structured slide deck.
Return ONLY a JSON object with this exact structure:
{
  "slides": [
    { "type": "title", "title": "...", "subtitle": "..." },
    { "type": "section", "title": "..." },
    { "type": "content", "title": "...", "bullets": ["...", "..."], "notes": "..." }
  ]
}
Rules:
- First slide must be type "title"
- 5 to 12 slides total
- Max 5 bullets per content slide, each under 80 characters
- Use "section" slides to separate major topics (no bullets)
- Keep the same language as the original document
- Notes are optional speaker notes (1 sentence max)`,
        },
        {
          role: 'user',
          content: `Title: ${title || 'Untitled'}\n\n${pageText.slice(0, 4000)}`,
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

  // 2. Build .pptx with pptxgenjs
  const prs = new pptxgen()
  prs.layout = 'LAYOUT_WIDE'

  for (const slide of slides) {
    const s = prs.addSlide()

    if (slide.type === 'title') {
      s.background = { color: t.titleSlide.bg }
      // Accent bar
      s.addShape(prs.ShapeType.rect, {
        x: 0, y: 3.15, w: '100%', h: 0.05,
        fill: { color: t.accentColor }, line: { color: t.accentColor },
      })
      s.addText(slide.title || '', {
        x: 0.8, y: 1.2, w: '85%', h: 1.5,
        fontSize: 40, bold: true,
        color: t.titleSlide.titleColor,
        fontFace: t.font, align: 'left', valign: 'middle',
      })
      if (slide.subtitle) {
        s.addText(slide.subtitle, {
          x: 0.8, y: 3.3, w: '85%', h: 0.9,
          fontSize: 20, color: t.titleSlide.subtitleColor,
          fontFace: t.font, align: 'left',
        })
      }
    } else if (slide.type === 'section') {
      s.background = { color: t.accentColor }
      s.addText(slide.title || '', {
        x: 0.8, y: 1.6, w: '85%', h: 2.0,
        fontSize: 34, bold: true,
        color: 'FFFFFF',
        fontFace: t.font, align: 'left', valign: 'middle',
      })
    } else {
      // content slide
      s.background = { color: t.bg }
      // Vertical accent bar beside title
      s.addShape(prs.ShapeType.rect, {
        x: 0.45, y: 0.5, w: 0.07, h: 0.6,
        fill: { color: t.accentColor }, line: { color: t.accentColor },
      })
      s.addText(slide.title || '', {
        x: 0.65, y: 0.48, w: '88%', h: 0.65,
        fontSize: 26, bold: true,
        color: t.titleColor,
        fontFace: t.font, align: 'left',
      })
      // Thin separator
      s.addShape(prs.ShapeType.rect, {
        x: 0.45, y: 1.25, w: '90%', h: 0.02,
        fill: { color: 'DDDDDD' }, line: { color: 'DDDDDD' },
      })

      if (slide.bullets?.length) {
        const bulletItems = (slide.bullets as string[]).map(b => ({
          text: b,
          options: {
            bullet: { type: 'bullet' as const },
            fontSize: 18,
            color: t.textColor,
            paraSpaceAfter: 10,
          },
        }))
        s.addText(bulletItems, {
          x: 0.6, y: 1.4, w: '88%', h: 4.0,
          fontFace: t.font, valign: 'top',
        })
      }

      if (slide.notes) {
        s.addNotes(slide.notes)
      }
    }
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

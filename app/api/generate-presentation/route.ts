import { NextRequest, NextResponse } from 'next/server'

// Slide is 13.33" × 7.5" (LAYOUT_WIDE)
const W = 13.33
const H = 7.5
const PAD = 0.55

const THEMES = {
  minimal: {
    bg: 'FFFFFF', titleColor: '111827', textColor: '374151',
    accentColor: '4F46E5', accentLight: 'EEF2FF', accentMid: 'C7D2FE',
    titleSlide: { bg: '111827', titleColor: 'FFFFFF', subtitleColor: 'A5B4FC' },
    sectionBg: '4F46E5', sectionText: 'FFFFFF',
    font: 'Calibri', statColor: '4F46E5',
    gradStop1: '1E1B4B', gradStop2: '111827',
  },
  corporate: {
    bg: 'FAFBFC', titleColor: '1A2E44', textColor: '334155',
    accentColor: '0369A1', accentLight: 'E0F2FE', accentMid: 'BAE6FD',
    titleSlide: { bg: '0C1A28', titleColor: 'FFFFFF', subtitleColor: '7DD3FC' },
    sectionBg: '0369A1', sectionText: 'FFFFFF',
    font: 'Calibri', statColor: '0369A1',
    gradStop1: '0C1A28', gradStop2: '0F2A42',
  },
  dark: {
    bg: '1E1E2E', titleColor: 'CDD6F4', textColor: 'BAC2DE',
    accentColor: '89B4FA', accentLight: '313244', accentMid: '45475A',
    titleSlide: { bg: '11111B', titleColor: 'CDD6F4', subtitleColor: '89B4FA' },
    sectionBg: '1E1E2E', sectionText: 'CDD6F4',
    font: 'Calibri', statColor: 'A6E3A1',
    gradStop1: '11111B', gradStop2: '1E1E2E',
  },
  colorful: {
    bg: 'FDFCFF', titleColor: '3B0764', textColor: '1F2937',
    accentColor: '7C3AED', accentLight: 'EDE9FE', accentMid: 'C4B5FD',
    titleSlide: { bg: '3B0764', titleColor: 'FFFFFF', subtitleColor: 'DDD6FE' },
    sectionBg: '7C3AED', sectionText: 'FFFFFF',
    font: 'Calibri', statColor: '7C3AED',
    gradStop1: '3B0764', gradStop2: '4C1D95',
  },
} as const

type ThemeKey = keyof typeof THEMES
type Theme = typeof THEMES[ThemeKey]

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

function gradientRect(s: any, x: number | string, y: number | string, w: number | string, h: number | string, c1: string, c2: string, angle = 135) {
  s.addShape('rect', { x, y, w, h, fill: { type: 'gradient', gradientType: 'linear', angle, stops: [{ position: 0, color: c1 }, { position: 100, color: c2 }] }, line: { color: c1 } })
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'GROQ_API_KEY not configured' }, { status: 500 })

  const { content, title, theme = 'minimal' } = await req.json()
  const t = THEMES[(theme as ThemeKey) in THEMES ? (theme as ThemeKey) : 'minimal']
  const pageText = typeof content === 'string' ? content : tiptapToText(content)

  const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 4096,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are a world-class presentation designer and communications strategist. Transform the document into a compelling, story-driven slide deck that educates and persuades.

Return ONLY a JSON object: { "slides": [...] }

Slide types — use a diverse mix, in this exact order of preference:

1. TITLE (always first):
{ "type": "title", "title": "Punchy title, max 8 words", "subtitle": "One compelling sentence that captures the core message and makes the audience want to keep reading" }

2. BIG-IDEA (1-2 times, for the most important insight):
{ "type": "big-idea", "statement": "A single bold, memorable insight or argument — direct, impactful, 10-20 words", "context": "One sentence providing the supporting evidence or explanation for this claim" }

3. SECTION (between major topics):
{ "type": "section", "title": "Section title — 3-5 words", "subtitle": "Brief teaser of what's in this section" }

4. BULLETS (for lists of points, 3-5 items):
{ "type": "bullets", "title": "Clear slide title", "bullets": ["Full sentence with specific detail and clear meaning (15+ words).", "Another complete thought that stands alone without context."] }

5. TWO-COL (compare, contrast, before/after, pros/cons):
{ "type": "two-col", "title": "Comparison title", "col1": { "heading": "Left label", "points": ["Specific point.", "Another point."] }, "col2": { "heading": "Right label", "points": ["Specific point.", "Another point."] } }

6. QUOTE (for a striking phrase or key statement):
{ "type": "quote", "quote": "A memorable, striking statement — direct speech or key finding, at least 15 words", "source": "Source, context, or chapter title" }

7. STATS (for 2-3 key numbers/metrics):
{ "type": "stats", "title": "What these numbers mean", "stats": [{ "value": "73%", "label": "Precise explanation of what this percentage represents" }, { "value": "2.4×", "label": "What this multiplier means in practice" }] }

8. CONCLUSION (always last):
{ "type": "conclusion", "title": "Key Takeaways", "points": ["The single most important thing to remember from this presentation.", "The key action the audience should take based on what they learned.", "The broader implication or consequence of this topic."] }

RULES:
- 9 to 13 slides total
- Start: title. End: conclusion.
- Use AT LEAST: one big-idea, one section, one two-col, one quote or stats
- Every text must be a COMPLETE SENTENCE — never isolated keywords
- Extract only real information from the document — do not invent facts
- Match the document's language exactly (French → French, English → English)
- notes (optional): one-sentence speaker note on any slide`,
        },
        { role: 'user', content: `Title: ${title || 'Untitled'}\n\n${pageText.slice(0, 6500)}` },
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

  const PptxGenJS = (await import('pptxgenjs')).default
  const prs = new PptxGenJS()
  prs.layout = 'LAYOUT_WIDE'

  for (const slide of slides) {
    const s = prs.addSlide()

    // ── TITLE ────────────────────────────────────────────────────────────────
    if (slide.type === 'title') {
      gradientRect(s, 0, 0, '100%', '100%', t.gradStop1, t.gradStop2, 135)
      // Left accent stripe
      s.addShape('rect', { x: 0, y: 0, w: 0.22, h: H, fill: { color: t.accentColor }, line: { color: t.accentColor } })
      // Decorative circles top-right
      s.addShape('ellipse', { x: 10.2, y: -1.6, w: 4.8, h: 4.8, fill: { color: t.accentColor }, line: { color: t.accentColor } })
      s.addShape('ellipse', { x: 10.9, y: -0.9, w: 3.8, h: 3.8, fill: { color: t.gradStop2 }, line: { color: t.gradStop2 } })
      // Small circle bottom-right
      s.addShape('ellipse', { x: 11.5, y: 5.4, w: 2.2, h: 2.2, fill: { color: t.accentColor }, line: { color: t.accentColor } })
      s.addShape('ellipse', { x: 11.8, y: 5.7, w: 1.6, h: 1.6, fill: { color: t.gradStop1 }, line: { color: t.gradStop1 } })
      // Title
      s.addText(slide.title || '', { x: PAD, y: 1.5, w: 9.5, h: 2.2, fontSize: 46, bold: true, color: t.titleSlide.titleColor, fontFace: t.font, align: 'left', valign: 'middle', charSpacing: -0.3 })
      // Accent bar
      s.addShape('rect', { x: PAD, y: 3.85, w: 2.2, h: 0.07, fill: { color: t.accentColor }, line: { color: t.accentColor } })
      if (slide.subtitle) {
        s.addText(slide.subtitle, { x: PAD, y: 4.05, w: 9.8, h: 1.4, fontSize: 18, color: t.titleSlide.subtitleColor, fontFace: t.font, align: 'left', lineSpacingMultiple: 1.3 })
      }

    // ── BIG-IDEA ─────────────────────────────────────────────────────────────
    } else if (slide.type === 'big-idea') {
      s.background = { color: t.bg }
      // Left accent panel
      s.addShape('rect', { x: 0, y: 0, w: 0.5, h: H, fill: { color: t.accentColor }, line: { color: t.accentColor } })
      // Subtle background circle
      s.addShape('ellipse', { x: 8.5, y: 1.0, w: 5.5, h: 5.5, fill: { color: t.accentLight }, line: { color: t.accentLight } })
      // "Key Insight" label
      s.addShape('roundRect', { x: PAD + 0.15, y: 1.1, w: 1.9, h: 0.38, fill: { color: t.accentColor }, line: { color: t.accentColor }, rectRadius: 0.06 })
      s.addText('KEY INSIGHT', { x: PAD + 0.15, y: 1.1, w: 1.9, h: 0.38, fontSize: 10, bold: true, color: 'FFFFFF', fontFace: t.font, align: 'center', valign: 'middle', charSpacing: 1.5 })
      // Main statement
      s.addText(slide.statement || '', { x: PAD + 0.15, y: 1.65, w: 10.5, h: 3.2, fontSize: 32, bold: true, color: t.titleColor, fontFace: t.font, align: 'left', valign: 'middle', lineSpacingMultiple: 1.2 })
      // Context
      if (slide.context) {
        s.addShape('rect', { x: PAD + 0.15, y: 5.0, w: 10.5, h: 0.04, fill: { color: t.accentMid }, line: { color: t.accentMid } })
        s.addText(slide.context, { x: PAD + 0.15, y: 5.15, w: 10.5, h: 1.0, fontSize: 16, color: t.textColor, fontFace: t.font, align: 'left', italic: true })
      }

    // ── SECTION ──────────────────────────────────────────────────────────────
    } else if (slide.type === 'section') {
      gradientRect(s, 0, 0, '100%', '100%', t.gradStop1, t.sectionBg, 145)
      // Decorative arc circles
      s.addShape('ellipse', { x: 9.0, y: -0.8, w: 6.5, h: 6.5, fill: { color: t.accentColor }, line: { color: t.accentColor } })
      s.addShape('ellipse', { x: 9.8, y: -0.1, w: 5.5, h: 5.5, fill: { color: t.gradStop1 }, line: { color: t.gradStop1 } })
      s.addShape('ellipse', { x: -1.5, y: 5.2, w: 4.5, h: 4.5, fill: { color: t.accentColor }, line: { color: t.accentColor } })
      // Thin horizontal line
      s.addShape('rect', { x: PAD, y: 3.1, w: 2.5, h: 0.06, fill: { color: t.accentColor }, line: { color: t.accentColor } })
      // Title
      s.addText(slide.title || '', { x: PAD, y: 1.4, w: 8.5, h: 1.7, fontSize: 44, bold: true, color: t.sectionText, fontFace: t.font, align: 'left', valign: 'bottom' })
      if (slide.subtitle) {
        s.addText(slide.subtitle, { x: PAD, y: 3.3, w: 8.2, h: 1.2, fontSize: 18, color: t.sectionText, fontFace: t.font, align: 'left' })
      }

    // ── BULLETS ──────────────────────────────────────────────────────────────
    } else if (slide.type === 'bullets') {
      s.background = { color: t.bg }
      // Full-width header
      gradientRect(s, 0, 0, '100%', 1.15, t.accentColor, t.gradStop1, 90)
      s.addText(slide.title || '', { x: PAD, y: 0.08, w: W - 1.1, h: 1.0, fontSize: 28, bold: true, color: 'FFFFFF', fontFace: t.font, align: 'left', valign: 'middle' })
      // Bullet rows
      const bullets: string[] = (slide.bullets || []).slice(0, 5)
      bullets.forEach((item: string, i: number) => {
        const y = 1.35 + i * 1.1
        // Row background (alternating)
        if (i % 2 === 0) s.addShape('rect', { x: PAD, y: y - 0.08, w: W - 1.1, h: 0.92, fill: { color: t.accentLight }, line: { color: t.accentLight } })
        // Accent circle
        s.addShape('ellipse', { x: PAD + 0.04, y: y + 0.16, w: 0.3, h: 0.3, fill: { color: t.accentColor }, line: { color: t.accentColor } })
        s.addText(String(i + 1), { x: PAD + 0.04, y: y + 0.16, w: 0.3, h: 0.3, fontSize: 12, bold: true, color: 'FFFFFF', fontFace: t.font, align: 'center', valign: 'middle' })
        s.addText(item, { x: PAD + 0.48, y: y, w: W - 1.7, h: 0.76, fontSize: 17, color: t.textColor, fontFace: t.font, valign: 'middle', wrap: true })
      })

    // ── TWO-COL ──────────────────────────────────────────────────────────────
    } else if (slide.type === 'two-col') {
      s.background = { color: t.bg }
      // Title area
      s.addText(slide.title || '', { x: PAD, y: 0.2, w: W - 1.1, h: 0.75, fontSize: 26, bold: true, color: t.titleColor, fontFace: t.font, align: 'left' })
      s.addShape('rect', { x: PAD, y: 1.0, w: W - 1.1, h: 0.05, fill: { color: t.accentColor }, line: { color: t.accentColor } })
      const col1 = slide.col1 || {}
      const col2 = slide.col2 || {}
      const colW = (W - 1.4) / 2
      const col1X = PAD
      const col2X = PAD + colW + 0.3
      // Left card
      s.addShape('roundRect', { x: col1X, y: 1.15, w: colW, h: H - 1.55, fill: { color: t.accentLight }, line: { color: t.accentMid }, rectRadius: 0.1 })
      gradientRect(s, col1X, 1.15, colW, 0.6, t.accentColor, t.gradStop1, 90)
      // Rounded top corners via shape on top
      s.addText(col1.heading || '', { x: col1X + 0.2, y: 1.15, w: colW - 0.4, h: 0.6, fontSize: 17, bold: true, color: 'FFFFFF', fontFace: t.font, align: 'left', valign: 'middle' });
      (col1.points || []).slice(0, 4).forEach((pt: string, i: number) => {
        s.addShape('ellipse', { x: col1X + 0.18, y: 1.93 + i * 1.1, w: 0.14, h: 0.14, fill: { color: t.accentColor }, line: { color: t.accentColor } })
        s.addText(pt, { x: col1X + 0.42, y: 1.85 + i * 1.1, w: colW - 0.55, h: 0.88, fontSize: 14, color: t.textColor, fontFace: t.font, valign: 'top', wrap: true })
      })
      // Right card
      s.addShape('roundRect', { x: col2X, y: 1.15, w: colW, h: H - 1.55, fill: { color: t.accentLight }, line: { color: t.accentMid }, rectRadius: 0.1 })
      gradientRect(s, col2X, 1.15, colW, 0.6, t.accentColor, t.gradStop1, 90)
      s.addText(col2.heading || '', { x: col2X + 0.2, y: 1.15, w: colW - 0.4, h: 0.6, fontSize: 17, bold: true, color: 'FFFFFF', fontFace: t.font, align: 'left', valign: 'middle' });
      (col2.points || []).slice(0, 4).forEach((pt: string, i: number) => {
        s.addShape('ellipse', { x: col2X + 0.18, y: 1.93 + i * 1.1, w: 0.14, h: 0.14, fill: { color: t.accentColor }, line: { color: t.accentColor } })
        s.addText(pt, { x: col2X + 0.42, y: 1.85 + i * 1.1, w: colW - 0.55, h: 0.88, fontSize: 14, color: t.textColor, fontFace: t.font, valign: 'top', wrap: true })
      })

    // ── QUOTE ────────────────────────────────────────────────────────────────
    } else if (slide.type === 'quote') {
      gradientRect(s, 0, 0, '100%', '100%', t.gradStop1, t.gradStop2, 160)
      // Giant decorative quote mark (background)
      s.addText('“', { x: -0.3, y: -1.2, w: 5.5, h: 5.5, fontSize: 240, color: t.accentColor, fontFace: t.font, align: 'left', valign: 'top' })
      // Vertical accent bar
      s.addShape('rect', { x: PAD, y: 1.2, w: 0.12, h: 4.5, fill: { color: t.accentColor }, line: { color: t.accentColor } })
      // Quote text
      s.addText(slide.quote || '', { x: PAD + 0.35, y: 1.0, w: W - 1.6, h: 4.5, fontSize: 26, italic: true, color: t.titleSlide.titleColor, fontFace: t.font, align: 'left', valign: 'middle', lineSpacingMultiple: 1.35 })
      if (slide.source) {
        s.addShape('rect', { x: PAD + 0.35, y: 5.65, w: 3.0, h: 0.06, fill: { color: t.accentColor }, line: { color: t.accentColor } })
        s.addText(`— ${slide.source}`, { x: PAD + 0.35, y: 5.85, w: W - 1.6, h: 0.5, fontSize: 15, color: t.titleSlide.subtitleColor, bold: true, fontFace: t.font, align: 'left' })
      }

    // ── STATS ────────────────────────────────────────────────────────────────
    } else if (slide.type === 'stats') {
      s.background = { color: t.bg }
      // Header
      gradientRect(s, 0, 0, '100%', 1.1, t.gradStop1, t.accentColor, 90)
      s.addText(slide.title || '', { x: PAD, y: 0.08, w: W - 1.1, h: 0.95, fontSize: 28, bold: true, color: 'FFFFFF', fontFace: t.font, align: 'center', valign: 'middle' })
      const stats: { value: string; label: string }[] = (slide.stats || []).slice(0, 3)
      const count = stats.length
      const cardW = count === 2 ? 5.5 : 3.7
      const totalW = count === 2 ? 11.0 : 11.1
      const startX = (W - totalW) / 2
      const gapX = count === 2 ? 0.0 : 0.0
      const spacing = count === 2 ? 5.8 : 3.9
      stats.forEach((st, i) => {
        const cx = startX + i * spacing
        // Card background
        s.addShape('roundRect', { x: cx, y: 1.3, w: cardW, h: H - 1.65, fill: { color: t.accentLight }, line: { color: t.accentMid }, rectRadius: 0.14 })
        // Top color strip on card
        gradientRect(s, cx, 1.3, cardW, 0.2, t.accentColor, t.accentColor, 90)
        // Big stat value
        s.addText(st.value, { x: cx + 0.1, y: 1.6, w: cardW - 0.2, h: 2.8, fontSize: 76, bold: true, color: t.statColor, fontFace: t.font, align: 'center', valign: 'middle' })
        // Separator
        s.addShape('rect', { x: cx + cardW / 2 - 1.2, y: 4.45, w: 2.4, h: 0.06, fill: { color: t.accentColor }, line: { color: t.accentColor } })
        // Label
        s.addText(st.label, { x: cx + 0.15, y: 4.6, w: cardW - 0.3, h: 1.1, fontSize: 15, color: t.textColor, fontFace: t.font, align: 'center', valign: 'top', wrap: true })
      })

    // ── CONCLUSION ───────────────────────────────────────────────────────────
    } else if (slide.type === 'conclusion') {
      gradientRect(s, 0, 0, '100%', '100%', t.gradStop1, t.gradStop2, 135)
      // Left accent stripe
      s.addShape('rect', { x: 0, y: 0, w: 0.22, h: H, fill: { color: t.accentColor }, line: { color: t.accentColor } })
      // Decorative circles
      s.addShape('ellipse', { x: 10.5, y: 3.8, w: 4.0, h: 4.0, fill: { color: t.accentColor }, line: { color: t.accentColor } })
      s.addShape('ellipse', { x: 11.2, y: 4.5, w: 3.0, h: 3.0, fill: { color: t.gradStop1 }, line: { color: t.gradStop1 } })
      // Header
      s.addText(slide.title || 'Key Takeaways', { x: PAD, y: 0.25, w: 9.5, h: 0.9, fontSize: 30, bold: true, color: t.titleSlide.titleColor, fontFace: t.font, align: 'left' })
      s.addShape('rect', { x: PAD, y: 1.2, w: 9.5, h: 0.05, fill: { color: t.accentColor }, line: { color: t.accentColor } })
      const pts: string[] = (slide.points || []).slice(0, 4)
      pts.forEach((pt: string, i: number) => {
        const y = 1.45 + i * 1.3
        // Row card
        s.addShape('roundRect', { x: PAD, y, w: 9.8, h: 1.05, fill: { color: t.accentColor + '22' }, line: { color: t.accentColor + '55' }, rectRadius: 0.08 })
        // Number circle
        s.addShape('ellipse', { x: PAD + 0.12, y: y + 0.2, w: 0.62, h: 0.62, fill: { color: t.accentColor }, line: { color: t.accentColor } })
        s.addText(String(i + 1), { x: PAD + 0.12, y: y + 0.2, w: 0.62, h: 0.62, fontSize: 20, bold: true, color: 'FFFFFF', fontFace: t.font, align: 'center', valign: 'middle' })
        s.addText(pt, { x: PAD + 0.9, y: y + 0.06, w: 8.8, h: 0.88, fontSize: 16, color: t.titleSlide.subtitleColor, fontFace: t.font, valign: 'middle', wrap: true })
      })
    }

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

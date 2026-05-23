import { NextRequest, NextResponse } from 'next/server'

// Slide canvas: 13.33" × 7.5" (LAYOUT_WIDE)
const W = 13.33
const H = 7.5
const PAD = 0.55

const THEMES = {
  minimal: {
    bg: 'FFFFFF',
    titleColor: '111827',
    textColor: '374151',
    accentColor: '4F46E5',   // indigo — dark enough for white text
    onAccent: 'FFFFFF',      // text color ON accentColor backgrounds
    accentLight: 'EEF2FF',   // very light, use dark text
    accentMid: 'C7D2FE',
    titleSlide: { bg: '111827', titleColor: 'FFFFFF', subtitleColor: 'A5B4FC' },
    sectionText: 'FFFFFF',
    font: 'Calibri',
    statColor: '4F46E5',
    gradStop1: '1E1B4B', gradStop2: '111827',
    headerGrad1: '1E1B4B', headerGrad2: '312E81', // always dark → safe with white text
  },
  corporate: {
    bg: 'F8FAFC',
    titleColor: '1A2E44',
    textColor: '334155',
    accentColor: '0369A1',
    onAccent: 'FFFFFF',
    accentLight: 'E0F2FE',
    accentMid: 'BAE6FD',
    titleSlide: { bg: '0C1A28', titleColor: 'FFFFFF', subtitleColor: '7DD3FC' },
    sectionText: 'FFFFFF',
    font: 'Calibri',
    statColor: '0369A1',
    gradStop1: '0C1A28', gradStop2: '0F2A42',
    headerGrad1: '0C1A28', headerGrad2: '075985',
  },
  dark: {
    bg: '1E1E2E',
    titleColor: 'CDD6F4',
    textColor: 'BAC2DE',
    accentColor: '89B4FA',   // LIGHT blue — cannot use white text on this
    onAccent: '11111B',      // dark text ON light-blue accent backgrounds
    accentLight: '313244',   // dark card bg — use light text
    accentMid: '45475A',
    titleSlide: { bg: '11111B', titleColor: 'CDD6F4', subtitleColor: '89B4FA' },
    sectionText: 'CDD6F4',
    font: 'Calibri',
    statColor: '89B4FA',
    gradStop1: '11111B', gradStop2: '1E1E2E',
    headerGrad1: '11111B', headerGrad2: '181825', // always dark → safe with white text
  },
  colorful: {
    bg: 'FDFCFF',
    titleColor: '3B0764',
    textColor: '1F2937',
    accentColor: '7C3AED',
    onAccent: 'FFFFFF',
    accentLight: 'EDE9FE',
    accentMid: 'C4B5FD',
    titleSlide: { bg: '3B0764', titleColor: 'FFFFFF', subtitleColor: 'DDD6FE' },
    sectionText: 'FFFFFF',
    font: 'Calibri',
    statColor: '7C3AED',
    gradStop1: '3B0764', gradStop2: '4C1D95',
    headerGrad1: '2E1065', headerGrad2: '4C1D95',
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

function gradRect(s: any, x: number | string, y: number | string, w: number | string, h: number | string, c1: string, c2: string, angle = 135) {
  s.addShape('rect', { x, y, w, h,
    fill: { type: 'gradient', gradientType: 'linear', angle, stops: [{ position: 0, color: c1 }, { position: 100, color: c2 }] },
    line: { color: c1 },
  })
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
      gradRect(s, 0, 0, '100%', '100%', t.gradStop1, t.gradStop2, 135)
      // Left accent stripe
      s.addShape('rect', { x: 0, y: 0, w: 0.22, h: H,
        fill: { color: t.accentColor }, line: { color: t.accentColor } })
      // Decorative circles top-right (semi-transparent)
      s.addShape('ellipse', { x: 10.1, y: -1.8, w: 5.2, h: 5.2,
        fill: { color: t.accentColor, transparency: 60 }, line: { color: t.accentColor, transparency: 80 } })
      s.addShape('ellipse', { x: 11.0, y: -0.9, w: 3.6, h: 3.6,
        fill: { color: t.gradStop2, transparency: 20 }, line: { color: t.gradStop2, transparency: 30 } })
      // Small circle bottom-right
      s.addShape('ellipse', { x: 11.4, y: 5.2, w: 2.4, h: 2.4,
        fill: { color: t.accentColor, transparency: 55 }, line: { color: t.accentColor, transparency: 70 } })
      // Title
      s.addText(slide.title || '', {
        x: PAD + 0.3, y: 1.5, w: 9.8, h: 2.3,
        fontSize: 48, bold: true,
        color: t.titleSlide.titleColor, fontFace: t.font,
        align: 'left', valign: 'middle', charSpacing: -0.5,
      })
      // Accent divider
      s.addShape('rect', { x: PAD + 0.3, y: 3.9, w: 2.5, h: 0.07,
        fill: { color: t.accentColor }, line: { color: t.accentColor } })
      if (slide.subtitle) {
        s.addText(slide.subtitle, {
          x: PAD + 0.3, y: 4.1, w: 9.8, h: 1.5,
          fontSize: 19, color: t.titleSlide.subtitleColor,
          fontFace: t.font, align: 'left', lineSpacingMultiple: 1.35,
        })
      }

    // ── BIG-IDEA ─────────────────────────────────────────────────────────────
    // Full dark gradient for maximum impact — text always on dark bg
    } else if (slide.type === 'big-idea') {
      gradRect(s, 0, 0, '100%', '100%', t.gradStop1, t.gradStop2, 145)
      // Large decorative arc right
      s.addShape('ellipse', { x: 9.2, y: 0.8, w: 5.8, h: 5.8,
        fill: { color: t.accentColor, transparency: 80 }, line: { color: t.accentColor, transparency: 85 } })
      s.addShape('ellipse', { x: 9.9, y: 1.5, w: 4.4, h: 4.4,
        fill: { color: t.gradStop1, transparency: 0 }, line: { color: t.gradStop1 } })
      // "KEY INSIGHT" pill — t.onAccent ensures readable text on accentColor bg
      s.addShape('roundRect', { x: PAD + 0.3, y: 1.2, w: 2.0, h: 0.38,
        fill: { color: t.accentColor }, line: { color: t.accentColor }, rectRadius: 0.19 })
      s.addText('KEY INSIGHT', {
        x: PAD + 0.3, y: 1.2, w: 2.0, h: 0.38,
        fontSize: 10, bold: true, color: t.onAccent,
        fontFace: t.font, align: 'center', valign: 'middle', charSpacing: 1.8,
      })
      // Main statement — titleSlide.titleColor is always readable on dark gradient
      s.addText(slide.statement || '', {
        x: PAD + 0.3, y: 1.75, w: 10.8, h: 3.5,
        fontSize: 34, bold: true,
        color: t.titleSlide.titleColor, fontFace: t.font,
        align: 'left', valign: 'middle', lineSpacingMultiple: 1.28,
      })
      // Separator + context
      s.addShape('rect', { x: PAD + 0.3, y: 5.45, w: 3.2, h: 0.06,
        fill: { color: t.accentColor }, line: { color: t.accentColor } })
      if (slide.context) {
        s.addText(slide.context, {
          x: PAD + 0.3, y: 5.62, w: 10.8, h: 1.0,
          fontSize: 16, italic: true,
          color: t.titleSlide.subtitleColor, fontFace: t.font, align: 'left',
        })
      }

    // ── SECTION ──────────────────────────────────────────────────────────────
    } else if (slide.type === 'section') {
      gradRect(s, 0, 0, '100%', '100%', t.gradStop1, t.gradStop2, 145)
      // Decorative geometry
      s.addShape('ellipse', { x: 8.8, y: -1.0, w: 7.0, h: 7.0,
        fill: { color: t.accentColor, transparency: 70 }, line: { color: t.accentColor, transparency: 80 } })
      s.addShape('ellipse', { x: 9.8, y: -0.2, w: 5.5, h: 5.5,
        fill: { color: t.gradStop1, transparency: 0 }, line: { color: t.gradStop1 } })
      s.addShape('ellipse', { x: -1.8, y: 5.0, w: 5.0, h: 5.0,
        fill: { color: t.accentColor, transparency: 70 }, line: { color: t.accentColor, transparency: 80 } })
      // Section number / label strip
      s.addShape('rect', { x: PAD, y: 1.3, w: 0.08, h: 1.9,
        fill: { color: t.accentColor }, line: { color: t.accentColor } })
      // Title — sectionText is always set for readability on dark bg
      s.addText(slide.title || '', {
        x: PAD + 0.28, y: 1.2, w: 8.8, h: 2.1,
        fontSize: 46, bold: true,
        color: t.sectionText, fontFace: t.font,
        align: 'left', valign: 'middle', charSpacing: -0.3,
      })
      // Separator
      s.addShape('rect', { x: PAD + 0.28, y: 3.45, w: 2.8, h: 0.07,
        fill: { color: t.accentColor }, line: { color: t.accentColor } })
      if (slide.subtitle) {
        s.addText(slide.subtitle, {
          x: PAD + 0.28, y: 3.65, w: 8.5, h: 1.2,
          fontSize: 19, color: t.titleSlide.subtitleColor,
          fontFace: t.font, align: 'left',
        })
      }

    // ── BULLETS ──────────────────────────────────────────────────────────────
    } else if (slide.type === 'bullets') {
      s.background = { color: t.bg }
      // Header — uses headerGrad (always dark) so white text is always safe
      gradRect(s, 0, 0, '100%', 1.18, t.headerGrad1, t.headerGrad2, 90)
      // Accent bar at header bottom
      s.addShape('rect', { x: 0, y: 1.18, w: '100%', h: 0.07,
        fill: { color: t.accentColor }, line: { color: t.accentColor } })
      s.addText(slide.title || '', {
        x: PAD, y: 0.1, w: W - 1.1, h: 1.0,
        fontSize: 28, bold: true, color: 'FFFFFF',
        fontFace: t.font, align: 'left', valign: 'middle',
      })
      // Bullets
      const bullets: string[] = (slide.bullets || []).slice(0, 5)
      bullets.forEach((item: string, i: number) => {
        const y = 1.42 + i * 1.1
        // Alternating row tint
        if (i % 2 === 0) {
          s.addShape('rect', { x: PAD, y: y - 0.08, w: W - 1.1, h: 0.96,
            fill: { color: t.accentLight }, line: { color: t.accentLight } })
        }
        // Left accent bar per row
        s.addShape('rect', { x: PAD, y: y + 0.02, w: 0.06, h: 0.72,
          fill: { color: t.accentColor }, line: { color: t.accentColor } })
        // Number badge — t.onAccent for text on accentColor background
        s.addShape('ellipse', { x: PAD + 0.14, y: y + 0.13, w: 0.36, h: 0.36,
          fill: { color: t.accentColor }, line: { color: t.accentColor } })
        s.addText(String(i + 1), {
          x: PAD + 0.14, y: y + 0.13, w: 0.36, h: 0.36,
          fontSize: 12, bold: true, color: t.onAccent,
          fontFace: t.font, align: 'center', valign: 'middle',
        })
        // Bullet text — textColor always contrasts with bg (dark on light, light on dark)
        s.addText(item, {
          x: PAD + 0.62, y: y, w: W - 1.82, h: 0.82,
          fontSize: 17, color: t.textColor,
          fontFace: t.font, valign: 'middle', wrap: true,
        })
      })

    // ── TWO-COL ──────────────────────────────────────────────────────────────
    } else if (slide.type === 'two-col') {
      s.background = { color: t.bg }
      // Slide title
      s.addText(slide.title || '', {
        x: PAD, y: 0.22, w: W - 1.1, h: 0.75,
        fontSize: 26, bold: true, color: t.titleColor,
        fontFace: t.font, align: 'left',
      })
      // Accent divider under title
      s.addShape('rect', { x: PAD, y: 1.02, w: W - 1.1, h: 0.05,
        fill: { color: t.accentColor }, line: { color: t.accentColor } })
      const col1 = slide.col1 || {}
      const col2 = slide.col2 || {}
      const colW = (W - 1.4) / 2
      const col1X = PAD
      const col2X = PAD + colW + 0.3
      const colH = H - 1.55
      const colY = 1.15

      // Left column card
      s.addShape('roundRect', { x: col1X, y: colY, w: colW, h: colH,
        fill: { color: t.accentLight }, line: { color: t.accentMid }, rectRadius: 0.1 })
      // Column header — headerGrad (always dark) → white text is safe
      gradRect(s, col1X, colY, colW, 0.68, t.headerGrad1, t.headerGrad2, 90)
      s.addText(col1.heading || '', {
        x: col1X + 0.22, y: colY, w: colW - 0.44, h: 0.68,
        fontSize: 16, bold: true, color: 'FFFFFF',
        fontFace: t.font, align: 'left', valign: 'middle',
      })
      // Left accent bar inside card
      s.addShape('rect', { x: col1X + 0.15, y: colY + 0.78, w: 0.06, h: colH - 0.9,
        fill: { color: t.accentColor }, line: { color: t.accentColor } })
      ;(col1.points || []).slice(0, 4).forEach((pt: string, i: number) => {
        s.addText(pt, {
          x: col1X + 0.32, y: colY + 0.8 + i * 1.08, w: colW - 0.48, h: 0.9,
          fontSize: 14, color: t.textColor,
          fontFace: t.font, valign: 'top', wrap: true,
        })
      })

      // Right column card
      s.addShape('roundRect', { x: col2X, y: colY, w: colW, h: colH,
        fill: { color: t.accentLight }, line: { color: t.accentMid }, rectRadius: 0.1 })
      gradRect(s, col2X, colY, colW, 0.68, t.headerGrad1, t.headerGrad2, 90)
      s.addText(col2.heading || '', {
        x: col2X + 0.22, y: colY, w: colW - 0.44, h: 0.68,
        fontSize: 16, bold: true, color: 'FFFFFF',
        fontFace: t.font, align: 'left', valign: 'middle',
      })
      s.addShape('rect', { x: col2X + 0.15, y: colY + 0.78, w: 0.06, h: colH - 0.9,
        fill: { color: t.accentColor }, line: { color: t.accentColor } })
      ;(col2.points || []).slice(0, 4).forEach((pt: string, i: number) => {
        s.addText(pt, {
          x: col2X + 0.32, y: colY + 0.8 + i * 1.08, w: colW - 0.48, h: 0.9,
          fontSize: 14, color: t.textColor,
          fontFace: t.font, valign: 'top', wrap: true,
        })
      })

    // ── QUOTE ────────────────────────────────────────────────────────────────
    } else if (slide.type === 'quote') {
      gradRect(s, 0, 0, '100%', '100%', t.gradStop1, t.gradStop2, 160)
      // Giant decorative quotation mark (background layer)
      s.addText('“', {
        x: -0.5, y: -1.5, w: 6.0, h: 6.0,
        fontSize: 260, color: t.accentColor,
        fontFace: t.font, align: 'left', valign: 'top',
        transparency: 70,
      })
      // Vertical accent bar
      s.addShape('rect', { x: PAD, y: 1.0, w: 0.14, h: 4.8,
        fill: { color: t.accentColor }, line: { color: t.accentColor } })
      // Quote text — titleSlide.titleColor always readable on dark gradient
      s.addText(slide.quote || '', {
        x: PAD + 0.4, y: 0.9, w: W - 1.65, h: 4.8,
        fontSize: 27, italic: true,
        color: t.titleSlide.titleColor, fontFace: t.font,
        align: 'left', valign: 'middle', lineSpacingMultiple: 1.4,
      })
      if (slide.source) {
        s.addShape('rect', { x: PAD + 0.4, y: 5.82, w: 3.2, h: 0.06,
          fill: { color: t.accentColor }, line: { color: t.accentColor } })
        s.addText(`— ${slide.source}`, {
          x: PAD + 0.4, y: 5.98, w: W - 1.65, h: 0.6,
          fontSize: 15, bold: true,
          color: t.titleSlide.subtitleColor, fontFace: t.font, align: 'left',
        })
      }

    // ── STATS ────────────────────────────────────────────────────────────────
    } else if (slide.type === 'stats') {
      s.background = { color: t.bg }
      // Header — headerGrad (always dark) → white text is safe
      gradRect(s, 0, 0, '100%', 1.12, t.headerGrad1, t.headerGrad2, 90)
      s.addShape('rect', { x: 0, y: 1.12, w: '100%', h: 0.07,
        fill: { color: t.accentColor }, line: { color: t.accentColor } })
      s.addText(slide.title || '', {
        x: PAD, y: 0.1, w: W - 1.1, h: 0.95,
        fontSize: 27, bold: true, color: 'FFFFFF',
        fontFace: t.font, align: 'center', valign: 'middle',
      })
      const stats: { value: string; label: string }[] = (slide.stats || []).slice(0, 3)
      const count = stats.length
      const cardW = count === 2 ? 5.6 : 3.7
      const spacing = count === 2 ? 5.9 : 3.9
      const startX = (W - (count === 2 ? 11.2 : 11.1)) / 2
      stats.forEach((st, i) => {
        const cx = startX + i * spacing
        // Card
        s.addShape('roundRect', { x: cx, y: 1.32, w: cardW, h: H - 1.68,
          fill: { color: t.accentLight }, line: { color: t.accentMid }, rectRadius: 0.14 })
        // Top accent strip on card
        s.addShape('rect', { x: cx, y: 1.32, w: cardW, h: 0.18,
          fill: { color: t.accentColor }, line: { color: t.accentColor } })
        // Stat value — statColor always contrasts with accentLight
        // (dark accent on light card for light themes, light accent on dark card for dark theme)
        s.addText(st.value, {
          x: cx + 0.1, y: 1.58, w: cardW - 0.2, h: 2.85,
          fontSize: 80, bold: true, color: t.statColor,
          fontFace: t.font, align: 'center', valign: 'middle',
        })
        // Separator
        s.addShape('rect', { x: cx + cardW / 2 - 1.3, y: 4.5, w: 2.6, h: 0.06,
          fill: { color: t.accentColor }, line: { color: t.accentColor } })
        // Label text — textColor always contrasts with accentLight
        s.addText(st.label, {
          x: cx + 0.18, y: 4.65, w: cardW - 0.36, h: 1.15,
          fontSize: 15, color: t.textColor,
          fontFace: t.font, align: 'center', valign: 'top', wrap: true,
        })
      })

    // ── CONCLUSION ───────────────────────────────────────────────────────────
    } else if (slide.type === 'conclusion') {
      gradRect(s, 0, 0, '100%', '100%', t.gradStop1, t.gradStop2, 135)
      // Left accent stripe
      s.addShape('rect', { x: 0, y: 0, w: 0.22, h: H,
        fill: { color: t.accentColor }, line: { color: t.accentColor } })
      // Decorative circles bottom-right
      s.addShape('ellipse', { x: 10.3, y: 3.6, w: 4.2, h: 4.2,
        fill: { color: t.accentColor, transparency: 60 }, line: { color: t.accentColor, transparency: 75 } })
      s.addShape('ellipse', { x: 11.1, y: 4.4, w: 3.0, h: 3.0,
        fill: { color: t.gradStop1, transparency: 0 }, line: { color: t.gradStop1 } })
      // Title
      s.addText(slide.title || 'Key Takeaways', {
        x: PAD + 0.3, y: 0.2, w: 9.5, h: 0.9,
        fontSize: 30, bold: true,
        color: t.titleSlide.titleColor, fontFace: t.font, align: 'left',
      })
      s.addShape('rect', { x: PAD + 0.3, y: 1.15, w: 9.8, h: 0.05,
        fill: { color: t.accentColor }, line: { color: t.accentColor } })
      // Takeaway rows
      const pts: string[] = (slide.points || []).slice(0, 4)
      pts.forEach((pt: string, i: number) => {
        const y = 1.38 + i * 1.38
        // Row card (semi-transparent)
        s.addShape('roundRect', { x: PAD + 0.3, y, w: 9.8, h: 1.12,
          fill: { color: t.accentColor + '1A' }, line: { color: t.accentColor + '55' }, rectRadius: 0.08 })
        // Number badge — t.onAccent for text on accentColor background
        s.addShape('ellipse', { x: PAD + 0.42, y: y + 0.22, w: 0.66, h: 0.66,
          fill: { color: t.accentColor }, line: { color: t.accentColor } })
        s.addText(String(i + 1), {
          x: PAD + 0.42, y: y + 0.22, w: 0.66, h: 0.66,
          fontSize: 20, bold: true, color: t.onAccent,
          fontFace: t.font, align: 'center', valign: 'middle',
        })
        // Point text — subtitleColor always readable on dark gradient
        s.addText(pt, {
          x: PAD + 1.25, y: y + 0.08, w: 8.75, h: 0.9,
          fontSize: 17, color: t.titleSlide.subtitleColor,
          fontFace: t.font, valign: 'middle', wrap: true,
        })
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

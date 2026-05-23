import { NextRequest, NextResponse } from 'next/server'

// Slide canvas: 13.33" × 7.5" (LAYOUT_WIDE)
const W = 13.33
const H = 7.5

// Contrast contract (never break these):
//   • text on dark gradient bg   → titleSlide.titleColor / titleSlide.subtitleColor
//   • text on accentColor bg     → onAccent
//   • text on accentLight bg     → textColor (body) or titleColor (heading)
//   • content-slide header band  → headerGrad1/2 (always dark) + 'FFFFFF'
//   • NEVER append hex digits ('1A', '55') for transparency — use the transparency: N property
const THEMES = {
  minimal: {
    bg: 'FFFFFF',
    titleColor: '111827',
    textColor: '374151',
    accentColor: '4F46E5',   // dark indigo — white text safe on it
    onAccent: 'FFFFFF',
    accentLight: 'EEF2FF',   // very light — dark text only
    accentMid: 'C7D2FE',
    decoColor: '312E81',     // muted accent for large decorative text on dark bg
    titleSlide: { titleColor: 'FFFFFF', subtitleColor: 'A5B4FC' },
    sectionText: 'FFFFFF',
    font: 'Calibri',
    statColor: '4F46E5',
    gradStop1: '1E1B4B', gradStop2: '111827',
    headerGrad1: '1E1B4B', headerGrad2: '312E81',
  },
  corporate: {
    bg: 'F8FAFC',
    titleColor: '1A2E44',
    textColor: '334155',
    accentColor: '0369A1',
    onAccent: 'FFFFFF',
    accentLight: 'E0F2FE',
    accentMid: 'BAE6FD',
    decoColor: '075985',
    titleSlide: { titleColor: 'FFFFFF', subtitleColor: '7DD3FC' },
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
    accentColor: '89B4FA',   // LIGHT pastel blue — NEVER use as bg with white text
    onAccent: '11111B',      // dark text ON light-blue accent backgrounds
    accentLight: '313244',   // dark card bg — light text only
    accentMid: '45475A',
    decoColor: '45475A',     // subtle muted color for decorative elements on dark bg
    titleSlide: { titleColor: 'CDD6F4', subtitleColor: '89B4FA' },
    sectionText: 'CDD6F4',
    font: 'Calibri',
    statColor: '89B4FA',     // light on dark accentLight card ✓
    gradStop1: '11111B', gradStop2: '1E1E2E',
    headerGrad1: '11111B', headerGrad2: '181825',
  },
  colorful: {
    bg: 'FDFCFF',
    titleColor: '3B0764',
    textColor: '1F2937',
    accentColor: '7C3AED',
    onAccent: 'FFFFFF',
    accentLight: 'EDE9FE',
    accentMid: 'C4B5FD',
    decoColor: '6D28D9',
    titleSlide: { titleColor: 'FFFFFF', subtitleColor: 'DDD6FE' },
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
    line: { color: c1, transparency: 100 },
  })
}

// Left accent stripe used consistently on all dark full-bleed slides
function leftStripe(s: any, color: string) {
  s.addShape('rect', { x: 0, y: 0, w: 0.22, h: H, fill: { color }, line: { color, transparency: 100 } })
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

Slide types — use a diverse mix:

1. TITLE (always first):
{ "type": "title", "title": "Punchy title, max 8 words", "subtitle": "One compelling sentence capturing the core message" }

2. BIG-IDEA (1-2 times, most important insight):
{ "type": "big-idea", "title": "3-5 word label for this insight", "statement": "A bold memorable insight — direct, impactful, 10-20 words", "context": "One sentence with supporting evidence or explanation" }

3. SECTION (between major topics):
{ "type": "section", "title": "Section title — 3-5 words", "subtitle": "Brief teaser of what follows" }

4. BULLETS (3-5 points):
{ "type": "bullets", "title": "Clear slide title", "bullets": ["Full sentence with specific detail (15+ words).", "Another complete thought that stands alone."] }

5. TWO-COL (compare, contrast, before/after, pros/cons):
{ "type": "two-col", "title": "Comparison title", "col1": { "heading": "Left label", "points": ["Point.", "Point."] }, "col2": { "heading": "Right label", "points": ["Point.", "Point."] } }

6. QUOTE (striking phrase or key statement):
{ "type": "quote", "title": "Topic or theme of this quote", "quote": "Memorable striking statement at least 15 words", "source": "Source or context" }

7. STATS (2-3 key numbers):
{ "type": "stats", "title": "What these numbers mean", "stats": [{ "value": "73%", "label": "What this represents" }, { "value": "2.4×", "label": "What this means" }] }

8. CONCLUSION (always last):
{ "type": "conclusion", "title": "Key Takeaways", "points": ["Most important thing to remember.", "Key action to take.", "Broader implication."] }

RULES:
- 9 to 13 slides total
- Start: title. End: conclusion.
- Use AT LEAST: one big-idea, one section, one two-col, one quote or stats
- Every text field must be a COMPLETE SENTENCE — never isolated keywords
- Extract only real information — do not invent facts
- Match the document's language exactly (French → French, English → English)
- notes (optional): one-sentence speaker note`,
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
      leftStripe(s, t.accentColor)
      // Decorative circles top-right — transparency: N (correct API, not hex suffix)
      s.addShape('ellipse', { x: 10.0, y: -1.9, w: 5.4, h: 5.4,
        fill: { color: t.accentColor, transparency: 62 }, line: { color: t.accentColor, transparency: 100 } })
      s.addShape('ellipse', { x: 10.9, y: -1.0, w: 3.8, h: 3.8,
        fill: { color: t.gradStop1, transparency: 0 }, line: { color: t.gradStop1, transparency: 100 } })
      s.addShape('ellipse', { x: 11.3, y: 5.1, w: 2.6, h: 2.6,
        fill: { color: t.accentColor, transparency: 57 }, line: { color: t.accentColor, transparency: 100 } })
      // Title text — titleSlide.titleColor always readable on dark gradient
      s.addText(slide.title || '', {
        x: 0.9, y: 1.5, w: 9.8, h: 2.3,
        fontSize: 48, bold: true, color: t.titleSlide.titleColor,
        fontFace: t.font, align: 'left', valign: 'middle', charSpacing: -0.5,
      })
      s.addShape('rect', { x: 0.9, y: 3.92, w: 2.6, h: 0.07,
        fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })
      if (slide.subtitle) {
        s.addText(slide.subtitle, {
          x: 0.9, y: 4.12, w: 9.8, h: 1.5,
          fontSize: 19, color: t.titleSlide.subtitleColor,
          fontFace: t.font, align: 'left', lineSpacingMultiple: 1.35,
        })
      }

    // ── BIG-IDEA ─────────────────────────────────────────────────────────────
    } else if (slide.type === 'big-idea') {
      gradRect(s, 0, 0, '100%', '100%', t.gradStop1, t.gradStop2, 145)
      leftStripe(s, t.accentColor)
      // Decorative arc right
      s.addShape('ellipse', { x: 9.0, y: 0.6, w: 6.2, h: 6.2,
        fill: { color: t.accentColor, transparency: 82 }, line: { color: t.accentColor, transparency: 100 } })
      s.addShape('ellipse', { x: 9.8, y: 1.4, w: 4.6, h: 4.6,
        fill: { color: t.gradStop1, transparency: 0 }, line: { color: t.gradStop1, transparency: 100 } })
      // Slide title (small, at top) — always present since AI prompt requires it
      if (slide.title) {
        s.addText(slide.title.toUpperCase(), {
          x: 0.9, y: 0.28, w: 10.0, h: 0.4,
          fontSize: 11, color: t.titleSlide.subtitleColor,
          fontFace: t.font, align: 'left', charSpacing: 2.5,
        })
        s.addShape('rect', { x: 0.9, y: 0.68, w: 1.6, h: 0.04,
          fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })
      }
      // "KEY INSIGHT" pill — onAccent is the correct text color on accentColor bg
      s.addShape('roundRect', { x: 0.9, y: 1.0, w: 2.05, h: 0.38,
        fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 }, rectRadius: 0.19 })
      s.addText('KEY INSIGHT', {
        x: 0.9, y: 1.0, w: 2.05, h: 0.38,
        fontSize: 10, bold: true, color: t.onAccent,
        fontFace: t.font, align: 'center', valign: 'middle', charSpacing: 1.8,
      })
      // Main statement
      s.addText(slide.statement || '', {
        x: 0.9, y: 1.55, w: 10.5, h: 3.6,
        fontSize: 34, bold: true, color: t.titleSlide.titleColor,
        fontFace: t.font, align: 'left', valign: 'middle', lineSpacingMultiple: 1.28,
      })
      // Separator + context
      s.addShape('rect', { x: 0.9, y: 5.38, w: 3.2, h: 0.06,
        fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })
      if (slide.context) {
        s.addText(slide.context, {
          x: 0.9, y: 5.55, w: 10.5, h: 1.05,
          fontSize: 16, italic: true, color: t.titleSlide.subtitleColor,
          fontFace: t.font, align: 'left',
        })
      }

    // ── SECTION ──────────────────────────────────────────────────────────────
    } else if (slide.type === 'section') {
      gradRect(s, 0, 0, '100%', '100%', t.gradStop1, t.gradStop2, 145)
      s.addShape('ellipse', { x: 8.6, y: -1.2, w: 7.2, h: 7.2,
        fill: { color: t.accentColor, transparency: 72 }, line: { color: t.accentColor, transparency: 100 } })
      s.addShape('ellipse', { x: 9.6, y: -0.3, w: 5.6, h: 5.6,
        fill: { color: t.gradStop1, transparency: 0 }, line: { color: t.gradStop1, transparency: 100 } })
      s.addShape('ellipse', { x: -2.0, y: 4.9, w: 5.2, h: 5.2,
        fill: { color: t.accentColor, transparency: 72 }, line: { color: t.accentColor, transparency: 100 } })
      // Left vertical accent bar
      s.addShape('rect', { x: 0.55, y: 1.2, w: 0.09, h: 2.1,
        fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })
      s.addText(slide.title || '', {
        x: 0.85, y: 1.1, w: 8.8, h: 2.3,
        fontSize: 46, bold: true, color: t.sectionText,
        fontFace: t.font, align: 'left', valign: 'middle', charSpacing: -0.3,
      })
      s.addShape('rect', { x: 0.85, y: 3.52, w: 2.8, h: 0.07,
        fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })
      if (slide.subtitle) {
        s.addText(slide.subtitle, {
          x: 0.85, y: 3.72, w: 8.5, h: 1.2,
          fontSize: 19, color: t.titleSlide.subtitleColor,
          fontFace: t.font, align: 'left',
        })
      }

    // ── BULLETS ──────────────────────────────────────────────────────────────
    } else if (slide.type === 'bullets') {
      s.background = { color: t.bg }
      // Left accent sidebar (consistent with dark slides)
      s.addShape('rect', { x: 0, y: 0, w: 0.2, h: H,
        fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })
      // Header band — headerGrad (always dark) → white text always safe
      gradRect(s, 0.2, 0, W - 0.2, 1.2, t.headerGrad1, t.headerGrad2, 90)
      s.addShape('rect', { x: 0.2, y: 1.2, w: W - 0.2, h: 0.07,
        fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })
      s.addText(slide.title || '', {
        x: 0.45, y: 0.1, w: W - 0.65, h: 1.0,
        fontSize: 27, bold: true, color: 'FFFFFF',
        fontFace: t.font, align: 'left', valign: 'middle',
      })
      // Bullet rows
      const bullets: string[] = (slide.bullets || []).slice(0, 5)
      bullets.forEach((item: string, i: number) => {
        const y = 1.44 + i * 1.1
        // Alternating tint row — textColor always contrasts with accentLight
        if (i % 2 === 0) {
          s.addShape('rect', { x: 0.4, y: y - 0.08, w: W - 0.55, h: 0.96,
            fill: { color: t.accentLight }, line: { color: t.accentLight, transparency: 100 } })
        }
        // Number badge — onAccent is correct text color on accentColor background
        s.addShape('ellipse', { x: 0.42, y: y + 0.12, w: 0.38, h: 0.38,
          fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })
        s.addText(String(i + 1), {
          x: 0.42, y: y + 0.12, w: 0.38, h: 0.38,
          fontSize: 12, bold: true, color: t.onAccent,
          fontFace: t.font, align: 'center', valign: 'middle',
        })
        // Bullet text — textColor always contrasts with both bg and accentLight
        s.addText(item, {
          x: 0.92, y: y, w: W - 1.1, h: 0.82,
          fontSize: 17, color: t.textColor,
          fontFace: t.font, valign: 'middle', wrap: true,
        })
      })

    // ── TWO-COL ──────────────────────────────────────────────────────────────
    } else if (slide.type === 'two-col') {
      s.background = { color: t.bg }
      // Left accent sidebar
      s.addShape('rect', { x: 0, y: 0, w: 0.2, h: H,
        fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })
      // Header band — same pattern as bullets/stats
      gradRect(s, 0.2, 0, W - 0.2, 1.1, t.headerGrad1, t.headerGrad2, 90)
      s.addShape('rect', { x: 0.2, y: 1.1, w: W - 0.2, h: 0.07,
        fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })
      s.addText(slide.title || '', {
        x: 0.45, y: 0.1, w: W - 0.65, h: 0.92,
        fontSize: 26, bold: true, color: 'FFFFFF',
        fontFace: t.font, align: 'left', valign: 'middle',
      })
      // Two column cards
      const col1 = slide.col1 || {}
      const col2 = slide.col2 || {}
      const colY = 1.25
      const colH = H - colY - 0.18
      const colW = (W - 0.2 - 0.4 - 0.25) / 2  // = 6.09
      const col1X = 0.4
      const col2X = col1X + colW + 0.3

      ;[{ col: col1, cx: col1X }, { col: col2, cx: col2X }].forEach(({ col, cx }) => {
        // Card background — accentLight + textColor always contrasts
        s.addShape('roundRect', { x: cx, y: colY, w: colW, h: colH,
          fill: { color: t.accentLight }, line: { color: t.accentMid }, rectRadius: 0.1 })
        // Column header — headerGrad (always dark) → white text always safe
        gradRect(s, cx, colY, colW, 0.65, t.headerGrad1, t.headerGrad2, 90)
        s.addText(col.heading || '', {
          x: cx + 0.2, y: colY, w: colW - 0.3, h: 0.65,
          fontSize: 16, bold: true, color: 'FFFFFF',
          fontFace: t.font, align: 'left', valign: 'middle',
        })
        // Left accent bar inside card
        s.addShape('rect', { x: cx + 0.13, y: colY + 0.75, w: 0.06, h: colH - 0.85,
          fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })
        ;(col.points || []).slice(0, 4).forEach((pt: string, i: number) => {
          s.addText(pt, {
            x: cx + 0.3, y: colY + 0.78 + i * 1.05, w: colW - 0.42, h: 0.92,
            fontSize: 14, color: t.textColor,
            fontFace: t.font, valign: 'top', wrap: true,
          })
        })
      })

    // ── QUOTE ────────────────────────────────────────────────────────────────
    } else if (slide.type === 'quote') {
      gradRect(s, 0, 0, '100%', '100%', t.gradStop1, t.gradStop2, 160)
      leftStripe(s, t.accentColor)
      // Decorative giant quote mark — decoColor is muted, won't swamp the text
      s.addText('“', {
        x: -0.6, y: -1.8, w: 6.5, h: 6.5,
        fontSize: 280, color: t.decoColor,
        fontFace: t.font, align: 'left', valign: 'top',
      })
      // Slide title (small, at top) — AI prompt now requires it
      if (slide.title) {
        s.addText(slide.title.toUpperCase(), {
          x: 0.9, y: 0.25, w: 10.5, h: 0.42,
          fontSize: 11, color: t.titleSlide.subtitleColor,
          fontFace: t.font, align: 'left', charSpacing: 2.5,
        })
      }
      // Vertical accent bar
      s.addShape('rect', { x: 0.85, y: 1.1, w: 0.14, h: 4.7,
        fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })
      // Quote text — titleSlide.titleColor always readable on dark gradient
      s.addText(slide.quote || '', {
        x: 1.2, y: 0.9, w: W - 1.6, h: 4.9,
        fontSize: 27, italic: true, color: t.titleSlide.titleColor,
        fontFace: t.font, align: 'left', valign: 'middle', lineSpacingMultiple: 1.4,
      })
      if (slide.source) {
        s.addShape('rect', { x: 1.2, y: 5.9, w: 3.2, h: 0.06,
          fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })
        s.addText(`— ${slide.source}`, {
          x: 1.2, y: 6.06, w: W - 1.6, h: 0.56,
          fontSize: 15, bold: true, color: t.titleSlide.subtitleColor,
          fontFace: t.font, align: 'left',
        })
      }

    // ── STATS ────────────────────────────────────────────────────────────────
    } else if (slide.type === 'stats') {
      s.background = { color: t.bg }
      // Left accent sidebar
      s.addShape('rect', { x: 0, y: 0, w: 0.2, h: H,
        fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })
      // Header band
      gradRect(s, 0.2, 0, W - 0.2, 1.15, t.headerGrad1, t.headerGrad2, 90)
      s.addShape('rect', { x: 0.2, y: 1.15, w: W - 0.2, h: 0.07,
        fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })
      s.addText(slide.title || '', {
        x: 0.45, y: 0.1, w: W - 0.65, h: 0.97,
        fontSize: 27, bold: true, color: 'FFFFFF',
        fontFace: t.font, align: 'center', valign: 'middle',
      })
      // Stat cards
      const stats: { value: string; label: string }[] = (slide.stats || []).slice(0, 3)
      const count = stats.length
      const cardW = count === 2 ? 5.7 : 3.75
      const spacing = count === 2 ? 6.0 : 3.95
      const totalW = count === 2 ? 11.4 : 11.25
      const startX = (W - totalW) / 2
      stats.forEach((st, i) => {
        const cx = startX + i * spacing
        // Card — accentLight bg + textColor/statColor always contrast
        s.addShape('roundRect', { x: cx, y: 1.36, w: cardW, h: H - 1.7,
          fill: { color: t.accentLight }, line: { color: t.accentMid }, rectRadius: 0.14 })
        // Top color strip
        s.addShape('rect', { x: cx, y: 1.36, w: cardW, h: 0.22,
          fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })
        // Stat value — statColor always contrasts with accentLight (verified per theme)
        s.addText(st.value, {
          x: cx + 0.08, y: 1.62, w: cardW - 0.16, h: 2.82,
          fontSize: 80, bold: true, color: t.statColor,
          fontFace: t.font, align: 'center', valign: 'middle',
        })
        // Separator
        s.addShape('rect', { x: cx + cardW / 2 - 1.35, y: 4.52, w: 2.7, h: 0.06,
          fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })
        // Label — textColor always contrasts with accentLight
        s.addText(st.label, {
          x: cx + 0.15, y: 4.68, w: cardW - 0.3, h: 1.1,
          fontSize: 15, color: t.textColor,
          fontFace: t.font, align: 'center', valign: 'top', wrap: true,
        })
      })

    // ── CONCLUSION ───────────────────────────────────────────────────────────
    } else if (slide.type === 'conclusion') {
      gradRect(s, 0, 0, '100%', '100%', t.gradStop1, t.gradStop2, 135)
      leftStripe(s, t.accentColor)
      // Decorative circles bottom-right
      s.addShape('ellipse', { x: 10.2, y: 3.5, w: 4.4, h: 4.4,
        fill: { color: t.accentColor, transparency: 62 }, line: { color: t.accentColor, transparency: 100 } })
      s.addShape('ellipse', { x: 11.0, y: 4.3, w: 3.1, h: 3.1,
        fill: { color: t.gradStop1, transparency: 0 }, line: { color: t.gradStop1, transparency: 100 } })
      // Title
      s.addText(slide.title || 'Key Takeaways', {
        x: 0.9, y: 0.22, w: 9.5, h: 0.88,
        fontSize: 30, bold: true, color: t.titleSlide.titleColor,
        fontFace: t.font, align: 'left',
      })
      s.addShape('rect', { x: 0.9, y: 1.14, w: 9.8, h: 0.05,
        fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })
      // Takeaway rows — NO transparency trick, just solid accentLight card
      const pts: string[] = (slide.points || []).slice(0, 4)
      pts.forEach((pt: string, i: number) => {
        const y = 1.36 + i * 1.42
        // Row card: solid accentLight bg, no hex-suffix trick
        s.addShape('roundRect', { x: 0.9, y, w: 9.8, h: 1.18,
          fill: { color: t.accentLight }, line: { color: t.accentMid }, rectRadius: 0.08 })
        // Number badge — onAccent for text on accentColor background
        s.addShape('ellipse', { x: 1.04, y: y + 0.24, w: 0.68, h: 0.68,
          fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })
        s.addText(String(i + 1), {
          x: 1.04, y: y + 0.24, w: 0.68, h: 0.68,
          fontSize: 20, bold: true, color: t.onAccent,
          fontFace: t.font, align: 'center', valign: 'middle',
        })
        // Point text — titleColor always contrasts with accentLight
        s.addText(pt, {
          x: 1.9, y: y + 0.1, w: 8.65, h: 0.94,
          fontSize: 17, color: t.titleColor,
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

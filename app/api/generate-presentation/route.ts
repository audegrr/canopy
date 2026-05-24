import { NextRequest, NextResponse } from 'next/server'

// Slide canvas: 13.33" × 7.5" (LAYOUT_WIDE)
const W = 13.33
const H = 7.5

// ── THEMES ───────────────────────────────────────────────────────────────────
// Contrast rules:
//   • dark slides (gradStop bg)  → always use titleSlide.titleColor / subtitleColor
//   • light slides (bg)          → always use titleColor / textColor
//   • text ON accentColor        → always use onAccent
//   • text ON accentLight        → always use textColor (light themes) or accentLightText (dark)
//   • header bands (headerGrad)  → always 'FFFFFF'
const THEMES = {
  minimal: {
    bg: 'FFFFFF',
    titleColor: '111827',
    textColor: '374151',
    accentColor: '4F46E5',
    onAccent: 'FFFFFF',
    accentLight: 'EEF2FF',
    accentLightText: '374151',   // text on accentLight bg
    accentMid: 'C7D2FE',
    decoColor: '312E81',
    titleSlide: { titleColor: 'FFFFFF', subtitleColor: 'A5B4FC' },
    sectionText: 'FFFFFF',
    font: 'Calibri',
    statColor: '4338CA',
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
    accentLightText: '1A2E44',
    accentMid: 'BAE6FD',
    decoColor: '075985',
    titleSlide: { titleColor: 'FFFFFF', subtitleColor: '7DD3FC' },
    sectionText: 'FFFFFF',
    font: 'Calibri',
    statColor: '0C4A6E',
    gradStop1: '0C1A28', gradStop2: '0F2A42',
    headerGrad1: '0C1A28', headerGrad2: '075985',
  },
  dark: {
    bg: '1E1E2E',
    titleColor: 'CDD6F4',
    textColor: 'BAC2DE',
    accentColor: '89B4FA',
    onAccent: '11111B',
    accentLight: '313244',
    accentLightText: 'CDD6F4',   // light text on dark card bg
    accentMid: '45475A',
    decoColor: '45475A',
    titleSlide: { titleColor: 'CDD6F4', subtitleColor: '89B4FA' },
    sectionText: 'CDD6F4',
    font: 'Calibri',
    statColor: '89B4FA',
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
    accentLightText: '1F2937',
    accentMid: 'C4B5FD',
    decoColor: '6D28D9',
    titleSlide: { titleColor: 'FFFFFF', subtitleColor: 'DDD6FE' },
    sectionText: 'FFFFFF',
    font: 'Calibri',
    statColor: '5B21B6',
    gradStop1: '3B0764', gradStop2: '4C1D95',
    headerGrad1: '2E1065', headerGrad2: '4C1D95',
  },
} as const

type ThemeKey = keyof typeof THEMES
type Theme = typeof THEMES[ThemeKey]

// ── HELPERS ──────────────────────────────────────────────────────────────────
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

function leftStripe(s: any, color: string) {
  s.addShape('rect', { x: 0, y: 0, w: 0.22, h: H, fill: { color }, line: { color, transparency: 100 } })
}

// Shared header band used by light-bg slides (bullets, two-col, stats)
function headerBand(s: any, t: Theme, title: string, bandH: number) {
  s.addShape('rect', { x: 0, y: 0, w: 0.2, h: H,
    fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })
  gradRect(s, 0.2, 0, W - 0.2, bandH, t.headerGrad1, t.headerGrad2, 90)
  s.addShape('rect', { x: 0.2, y: bandH, w: W - 0.2, h: 0.07,
    fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })
  s.addText(title, {
    x: 0.48, y: 0.08, w: W - 0.7, h: bandH - 0.08,
    fontSize: 26, bold: true, color: 'FFFFFF',
    fontFace: t.font, align: 'left', valign: 'middle', shrinkText: true,
  })
}

// ── ROUTE ────────────────────────────────────────────────────────────────────
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
          content: `You are a world-class presentation designer. Transform the document into a compelling slide deck.

Return ONLY a JSON object: { "slides": [...] }

Slide types — use a diverse mix:

1. TITLE (always first, required):
{ "type": "title", "title": "Max 7 words", "subtitle": "One sentence, max 18 words" }

2. BIG-IDEA (1–2 per deck, most important insight):
{ "type": "big-idea", "title": "3–4 word label", "statement": "Bold insight, max 15 words", "context": "Supporting sentence, max 20 words" }

3. SECTION (between major topics):
{ "type": "section", "title": "3–5 words", "subtitle": "One sentence teaser, max 15 words" }

4. BULLETS (3–4 points, never 5):
{ "type": "bullets", "title": "Clear slide title, max 8 words", "bullets": ["Complete sentence, max 20 words.", "Another complete thought, max 20 words.", "Third point, max 20 words."] }

5. TWO-COL (compare/contrast, 2–3 points per column):
{ "type": "two-col", "title": "Comparison title, max 8 words", "col1": { "heading": "Left label, max 4 words", "points": ["Point max 15 words.", "Point max 15 words."] }, "col2": { "heading": "Right label, max 4 words", "points": ["Point max 15 words.", "Point max 15 words."] } }

6. QUOTE (striking statement):
{ "type": "quote", "title": "3–5 word theme", "quote": "Memorable statement, max 30 words", "source": "Author or context, max 8 words" }

7. STATS (2–3 numbers):
{ "type": "stats", "title": "What these numbers mean, max 8 words", "stats": [{ "value": "73%", "label": "Max 6 words" }, { "value": "2×", "label": "Max 6 words" }] }

8. CONCLUSION (always last, required):
{ "type": "conclusion", "title": "Key Takeaways", "points": ["Most important thing, max 20 words.", "Key action, max 20 words.", "Broader implication, max 20 words."] }

STRICT RULES:
- 8 to 12 slides total
- First slide: title. Last slide: conclusion.
- Use AT LEAST one big-idea, one section, one two-col or stats
- NEVER exceed the word limits above — slides have fixed dimensions
- Every field must be a complete sentence, never isolated keywords
- Extract only real information from the document — no invented facts
- Match the document's language exactly (French → French, English → English)
- "notes" field optional: one-sentence speaker note per slide`,
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
      // Decorative circles top-right
      s.addShape('ellipse', { x: 9.8, y: -2.0, w: 5.8, h: 5.8,
        fill: { color: t.accentColor, transparency: 65 }, line: { color: t.accentColor, transparency: 100 } })
      s.addShape('ellipse', { x: 10.7, y: -1.1, w: 4.0, h: 4.0,
        fill: { color: t.gradStop1, transparency: 0 }, line: { color: t.gradStop1, transparency: 100 } })
      s.addShape('ellipse', { x: 11.2, y: 5.0, w: 2.8, h: 2.8,
        fill: { color: t.accentColor, transparency: 60 }, line: { color: t.accentColor, transparency: 100 } })
      // Title
      s.addText(slide.title || '', {
        x: 0.9, y: 1.4, w: 9.6, h: 2.5,
        fontSize: 50, bold: true, color: t.titleSlide.titleColor,
        fontFace: t.font, align: 'left', valign: 'middle', charSpacing: -0.5,
        shrinkText: true,
      })
      s.addShape('rect', { x: 0.9, y: 4.0, w: 2.8, h: 0.08,
        fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })
      if (slide.subtitle) {
        s.addText(slide.subtitle, {
          x: 0.9, y: 4.2, w: 9.6, h: 1.6,
          fontSize: 20, color: t.titleSlide.subtitleColor,
          fontFace: t.font, align: 'left', lineSpacingMultiple: 1.3, shrinkText: true,
        })
      }

    // ── BIG-IDEA ─────────────────────────────────────────────────────────────
    } else if (slide.type === 'big-idea') {
      gradRect(s, 0, 0, '100%', '100%', t.gradStop1, t.gradStop2, 145)
      leftStripe(s, t.accentColor)
      s.addShape('ellipse', { x: 8.8, y: 0.4, w: 6.4, h: 6.4,
        fill: { color: t.accentColor, transparency: 84 }, line: { color: t.accentColor, transparency: 100 } })
      s.addShape('ellipse', { x: 9.7, y: 1.3, w: 4.8, h: 4.8,
        fill: { color: t.gradStop1, transparency: 0 }, line: { color: t.gradStop1, transparency: 100 } })
      if (slide.title) {
        s.addText(slide.title.toUpperCase(), {
          x: 0.9, y: 0.26, w: 10.0, h: 0.42,
          fontSize: 11, color: t.titleSlide.subtitleColor,
          fontFace: t.font, align: 'left', charSpacing: 2.5, shrinkText: true,
        })
        s.addShape('rect', { x: 0.9, y: 0.7, w: 1.8, h: 0.04,
          fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })
      }
      // KEY INSIGHT badge
      s.addShape('roundRect', { x: 0.9, y: 1.05, w: 2.1, h: 0.4,
        fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 }, rectRadius: 0.2 })
      s.addText('KEY INSIGHT', {
        x: 0.9, y: 1.05, w: 2.1, h: 0.4,
        fontSize: 10, bold: true, color: t.onAccent,
        fontFace: t.font, align: 'center', valign: 'middle', charSpacing: 1.8,
      })
      // Main statement — shrinkText handles any overflow
      s.addText(slide.statement || '', {
        x: 0.9, y: 1.6, w: 10.2, h: 3.55,
        fontSize: 32, bold: true, color: t.titleSlide.titleColor,
        fontFace: t.font, align: 'left', valign: 'middle', lineSpacingMultiple: 1.25,
        shrinkText: true,
      })
      s.addShape('rect', { x: 0.9, y: 5.32, w: 3.4, h: 0.06,
        fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })
      if (slide.context) {
        s.addText(slide.context, {
          x: 0.9, y: 5.5, w: 10.2, h: 1.1,
          fontSize: 16, italic: true, color: t.titleSlide.subtitleColor,
          fontFace: t.font, align: 'left', shrinkText: true,
        })
      }

    // ── SECTION ──────────────────────────────────────────────────────────────
    } else if (slide.type === 'section') {
      gradRect(s, 0, 0, '100%', '100%', t.gradStop1, t.gradStop2, 145)
      s.addShape('ellipse', { x: 8.4, y: -1.4, w: 7.6, h: 7.6,
        fill: { color: t.accentColor, transparency: 74 }, line: { color: t.accentColor, transparency: 100 } })
      s.addShape('ellipse', { x: 9.5, y: -0.4, w: 5.8, h: 5.8,
        fill: { color: t.gradStop1, transparency: 0 }, line: { color: t.gradStop1, transparency: 100 } })
      s.addShape('ellipse', { x: -2.2, y: 4.8, w: 5.4, h: 5.4,
        fill: { color: t.accentColor, transparency: 74 }, line: { color: t.accentColor, transparency: 100 } })
      s.addShape('rect', { x: 0.55, y: 1.15, w: 0.1, h: 2.2,
        fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })
      s.addText(slide.title || '', {
        x: 0.85, y: 1.05, w: 8.6, h: 2.4,
        fontSize: 46, bold: true, color: t.sectionText,
        fontFace: t.font, align: 'left', valign: 'middle', charSpacing: -0.3,
        shrinkText: true,
      })
      s.addShape('rect', { x: 0.85, y: 3.56, w: 3.0, h: 0.07,
        fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })
      if (slide.subtitle) {
        s.addText(slide.subtitle, {
          x: 0.85, y: 3.76, w: 8.4, h: 1.3,
          fontSize: 19, color: t.titleSlide.subtitleColor,
          fontFace: t.font, align: 'left', shrinkText: true,
        })
      }

    // ── BULLETS ──────────────────────────────────────────────────────────────
    } else if (slide.type === 'bullets') {
      s.background = { color: t.bg }
      const BAND_H = 1.15
      headerBand(s, t, slide.title || '', BAND_H)

      // Max 4 bullets — each row = 1.25" → 4×1.25 + 1.22 header = 6.22" < 7.5 ✓
      const bullets: string[] = (slide.bullets || []).slice(0, 4)
      const rowH = bullets.length <= 3 ? 1.45 : 1.22
      const textH = rowH - 0.22

      bullets.forEach((item: string, i: number) => {
        const y = BAND_H + 0.07 + i * rowH
        // Alternating tint row
        if (i % 2 === 0) {
          s.addShape('rect', { x: 0.38, y: y + 0.02, w: W - 0.52, h: rowH - 0.04,
            fill: { color: t.accentLight }, line: { color: t.accentLight, transparency: 100 } })
        }
        // Number badge
        const badgeY = y + rowH / 2 - 0.22
        s.addShape('ellipse', { x: 0.42, y: badgeY, w: 0.44, h: 0.44,
          fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })
        s.addText(String(i + 1), {
          x: 0.42, y: badgeY, w: 0.44, h: 0.44,
          fontSize: 13, bold: true, color: t.onAccent,
          fontFace: t.font, align: 'center', valign: 'middle',
        })
        // Bullet text — accentLightText guarantees contrast on both bg and accentLight
        s.addText(item, {
          x: 0.98, y: y + 0.1, w: W - 1.18, h: textH,
          fontSize: 16, color: t.accentLightText,
          fontFace: t.font, valign: 'middle', wrap: true, shrinkText: true,
          lineSpacingMultiple: 1.2,
        })
      })

    // ── TWO-COL ──────────────────────────────────────────────────────────────
    } else if (slide.type === 'two-col') {
      s.background = { color: t.bg }
      const BAND_H = 1.08
      headerBand(s, t, slide.title || '', BAND_H)

      const col1 = slide.col1 || {}
      const col2 = slide.col2 || {}
      const colY = BAND_H + 0.07
      const colH = H - colY - 0.16
      const colW = (W - 0.2 - 0.42 - 0.28) / 2  // ≈ 6.07"
      const col1X = 0.4
      const col2X = col1X + colW + 0.28

      ;[{ col: col1, cx: col1X }, { col: col2, cx: col2X }].forEach(({ col, cx }) => {
        // Card background
        s.addShape('roundRect', { x: cx, y: colY, w: colW, h: colH,
          fill: { color: t.accentLight }, line: { color: t.accentMid }, rectRadius: 0.1 })
        // Column header — headerGrad always dark → white always safe
        gradRect(s, cx, colY, colW, 0.62, t.headerGrad1, t.headerGrad2, 90)
        s.addText(col.heading || '', {
          x: cx + 0.18, y: colY, w: colW - 0.28, h: 0.62,
          fontSize: 15, bold: true, color: 'FFFFFF',
          fontFace: t.font, align: 'left', valign: 'middle', shrinkText: true,
        })
        // Accent bar
        s.addShape('rect', { x: cx + 0.12, y: colY + 0.72, w: 0.06, h: colH - 0.82,
          fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })
        // Max 3 points per col
        const points: string[] = (col.points || []).slice(0, 3)
        const ptH = Math.min(1.35, (colH - 0.84) / Math.max(points.length, 1))
        points.forEach((pt: string, i: number) => {
          s.addText(pt, {
            x: cx + 0.28, y: colY + 0.74 + i * ptH, w: colW - 0.38, h: ptH - 0.08,
            fontSize: 13, color: t.accentLightText,
            fontFace: t.font, valign: 'top', wrap: true, shrinkText: true,
            lineSpacingMultiple: 1.2,
          })
        })
      })

    // ── QUOTE ────────────────────────────────────────────────────────────────
    } else if (slide.type === 'quote') {
      gradRect(s, 0, 0, '100%', '100%', t.gradStop1, t.gradStop2, 160)
      leftStripe(s, t.accentColor)
      // Decorative giant quote mark
      s.addText('“', {
        x: -0.7, y: -2.0, w: 6.5, h: 6.5,
        fontSize: 280, color: t.decoColor,
        fontFace: t.font, align: 'left', valign: 'top',
      })
      if (slide.title) {
        s.addText(slide.title.toUpperCase(), {
          x: 0.9, y: 0.24, w: 10.5, h: 0.44,
          fontSize: 11, color: t.titleSlide.subtitleColor,
          fontFace: t.font, align: 'left', charSpacing: 2.5, shrinkText: true,
        })
      }
      s.addShape('rect', { x: 0.85, y: 0.82, w: 0.14, h: 4.9,
        fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })
      // Quote text — shrinkText handles long quotes gracefully
      s.addText(slide.quote || '', {
        x: 1.18, y: 0.72, w: W - 1.6, h: 4.95,
        fontSize: 26, italic: true, color: t.titleSlide.titleColor,
        fontFace: t.font, align: 'left', valign: 'middle', lineSpacingMultiple: 1.42,
        shrinkText: true,
      })
      if (slide.source) {
        s.addShape('rect', { x: 1.18, y: 5.85, w: 3.4, h: 0.06,
          fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })
        s.addText(`— ${slide.source}`, {
          x: 1.18, y: 6.02, w: W - 1.6, h: 0.58,
          fontSize: 15, bold: true, color: t.titleSlide.subtitleColor,
          fontFace: t.font, align: 'left', shrinkText: true,
        })
      }

    // ── STATS ────────────────────────────────────────────────────────────────
    } else if (slide.type === 'stats') {
      s.background = { color: t.bg }
      const BAND_H = 1.12
      headerBand(s, t, slide.title || '', BAND_H)

      const stats: { value: string; label: string }[] = (slide.stats || []).slice(0, 3)
      const count = stats.length || 1
      const gap = 0.28
      const cardW = (W - 0.2 - 0.38 - gap * (count - 1)) / count
      const startX = 0.38
      const cardY = BAND_H + 0.14
      const cardH = H - cardY - 0.16

      stats.forEach((st, i) => {
        const cx = startX + i * (cardW + gap)
        s.addShape('roundRect', { x: cx, y: cardY, w: cardW, h: cardH,
          fill: { color: t.accentLight }, line: { color: t.accentMid }, rectRadius: 0.14 })
        // Top strip
        s.addShape('rect', { x: cx, y: cardY, w: cardW, h: 0.24,
          fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })
        // Stat value — statColor on accentLight, verified per theme
        s.addText(st.value, {
          x: cx + 0.06, y: cardY + 0.3, w: cardW - 0.12, h: cardH * 0.58,
          fontSize: 72, bold: true, color: t.statColor,
          fontFace: t.font, align: 'center', valign: 'middle', shrinkText: true,
        })
        // Separator
        const sepY = cardY + cardH * 0.66
        s.addShape('rect', { x: cx + cardW / 2 - 1.3, y: sepY, w: 2.6, h: 0.06,
          fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })
        // Label — accentLightText guarantees contrast
        s.addText(st.label, {
          x: cx + 0.14, y: sepY + 0.14, w: cardW - 0.28, h: cardH - cardH * 0.66 - 0.22,
          fontSize: 15, color: t.accentLightText,
          fontFace: t.font, align: 'center', valign: 'top', wrap: true, shrinkText: true,
        })
      })

    // ── CONCLUSION ───────────────────────────────────────────────────────────
    } else if (slide.type === 'conclusion') {
      gradRect(s, 0, 0, '100%', '100%', t.gradStop1, t.gradStop2, 135)
      leftStripe(s, t.accentColor)
      // Decorative circles bottom-right
      s.addShape('ellipse', { x: 10.0, y: 3.4, w: 4.6, h: 4.6,
        fill: { color: t.accentColor, transparency: 64 }, line: { color: t.accentColor, transparency: 100 } })
      s.addShape('ellipse', { x: 10.8, y: 4.2, w: 3.2, h: 3.2,
        fill: { color: t.gradStop1, transparency: 0 }, line: { color: t.gradStop1, transparency: 100 } })
      s.addText(slide.title || 'Key Takeaways', {
        x: 0.9, y: 0.18, w: 9.0, h: 0.92,
        fontSize: 32, bold: true, color: t.titleSlide.titleColor,
        fontFace: t.font, align: 'left', shrinkText: true,
      })
      s.addShape('rect', { x: 0.9, y: 1.14, w: 9.6, h: 0.06,
        fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })

      // Max 3 points — each row 1.7" → 3×1.7 + 1.22 header = 6.32" < 7.5 ✓
      const pts: string[] = (slide.points || []).slice(0, 3)
      const rowH = pts.length <= 2 ? 2.0 : 1.68
      pts.forEach((pt: string, i: number) => {
        const y = 1.28 + i * rowH
        // Row card — accentLight with solid contrast
        s.addShape('roundRect', { x: 0.9, y, w: 9.6, h: rowH - 0.1,
          fill: { color: t.accentLight }, line: { color: t.accentMid }, rectRadius: 0.09 })
        // Number badge — onAccent on accentColor
        const badgeSize = 0.74
        s.addShape('ellipse', { x: 1.06, y: y + (rowH - 0.1) / 2 - badgeSize / 2, w: badgeSize, h: badgeSize,
          fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })
        s.addText(String(i + 1), {
          x: 1.06, y: y + (rowH - 0.1) / 2 - badgeSize / 2, w: badgeSize, h: badgeSize,
          fontSize: 22, bold: true, color: t.onAccent,
          fontFace: t.font, align: 'center', valign: 'middle',
        })
        // Point text — accentLightText always contrasts with accentLight
        s.addText(pt, {
          x: 2.0, y: y + 0.1, w: 8.36, h: rowH - 0.3,
          fontSize: 17, color: t.accentLightText,
          fontFace: t.font, valign: 'middle', wrap: true, shrinkText: true,
          lineSpacingMultiple: 1.2,
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

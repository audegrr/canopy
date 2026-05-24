import { NextRequest, NextResponse } from 'next/server'

const W = 13.33   // slide width  (inches, LAYOUT_WIDE)
const H = 7.5     // slide height (inches)

// ── CONTRAST CONTRACT ──────────────────────────────────────────────────────
// Dark-gradient slides  → text: DARK_TEXT  sub: DARK_SUB
// Light-bg slides (body on bg / accentLight) → text: LIGHT_TEXT
// Header bands (always dark gradient)        → text: 'FFFFFF' (never changes)
// Text on accentColor badge                  → t.onAccent

const DARK_TEXT = 'FFFFFF'   // pure white on any dark gradient — ratio always > 10:1

const THEMES = {
  minimal: {
    bg: 'FFFFFF', accentColor: '4F46E5', onAccent: 'FFFFFF',
    accentLight: 'EEF2FF', accentMid: 'C7D2FE', decoColor: '3730A3',
    darkSub: 'C7D2FE',          // secondary text on dark slides
    lightText: '111827',        // body text on white/EEF2FF cards
    statColor: '3730A3',        // stat numbers on accentLight — 7:1 on EEF2FF
    font: 'Calibri',
    grad1: '1E1B4B', grad2: '111827',
    hGrad1: '1E1B4B', hGrad2: '312E81',
  },
  corporate: {
    bg: 'F8FAFC', accentColor: '0369A1', onAccent: 'FFFFFF',
    accentLight: 'E0F2FE', accentMid: 'BAE6FD', decoColor: '075985',
    darkSub: '7DD3FC',
    lightText: '0C1A2E',
    statColor: '0C4A6E',
    font: 'Calibri',
    grad1: '0C1A28', grad2: '0F2A42',
    hGrad1: '0C1A28', hGrad2: '075985',
  },
  dark: {
    bg: '1E1E2E', accentColor: '89B4FA', onAccent: '11111B',
    accentLight: '2A2A3E', accentMid: '45475A', decoColor: '45475A',
    darkSub: 'A6B4D4',          // muted blue-grey, readable on black
    lightText: 'E8ECFF',        // near-white on dark cards
    statColor: 'B4C8FF',        // light blue on dark card — 6:1 on 2A2A3E
    font: 'Calibri',
    grad1: '0D0D1A', grad2: '1A1A2E',
    hGrad1: '0D0D1A', hGrad2: '1A1A2E',
  },
  colorful: {
    bg: 'FDFCFF', accentColor: '7C3AED', onAccent: 'FFFFFF',
    accentLight: 'EDE9FE', accentMid: 'C4B5FD', decoColor: '5B21B6',
    darkSub: 'DDD6FE',
    lightText: '1E0A3C',
    statColor: '4C1D95',        // dark purple on EDE9FE — 8:1
    font: 'Calibri',
    grad1: '3B0764', grad2: '4C1D95',
    hGrad1: '2E1065', hGrad2: '4C1D95',
  },
} as const

type ThemeKey = keyof typeof THEMES
type Theme = typeof THEMES[ThemeKey]

// ── HELPERS ───────────────────────────────────────────────────────────────
function tiptapToText(node: any): string {
  if (!node) return ''
  if (node.type === 'text') return node.text || ''
  const children = (node.content || []).map((c: any) => tiptapToText(c)).join('')
  switch (node.type) {
    case 'heading':    return `${'#'.repeat(node.attrs?.level || 1)} ${children}\n`
    case 'paragraph':  return children ? `${children}\n` : ''
    case 'bulletList':
    case 'orderedList': return children
    case 'listItem':   return `• ${children.trim()}\n`
    case 'blockquote': return `"${children.trim()}"\n`
    case 'codeBlock':  return `[Code]\n`
    case 'table':      return '[Table]\n'
    default:           return children
  }
}

function gRect(s: any, x: number|string, y: number|string, w: number|string, h: number|string,
               c1: string, c2: string, angle = 135) {
  s.addShape('rect', { x, y, w, h,
    fill: { type: 'gradient', gradientType: 'linear', angle,
            stops: [{ position: 0, color: c1 }, { position: 100, color: c2 }] },
    line: { color: c1, transparency: 100 },
  })
}

function lStripe(s: any, t: Theme) {
  s.addShape('rect', { x: 0, y: 0, w: 0.26, h: H,
    fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })
}

// Header band for light-background slides — always white text on dark gradient
function hBand(s: any, t: Theme, title: string, bandH: number) {
  s.addShape('rect', { x: 0, y: 0, w: 0.24, h: H,
    fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })
  gRect(s, 0.24, 0, W - 0.24, bandH, t.hGrad1, t.hGrad2, 90)
  s.addShape('rect', { x: 0.24, y: bandH, w: W - 0.24, h: 0.06,
    fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })
  s.addText(title, {
    x: 0.52, y: 0.06, w: W - 0.72, h: bandH - 0.06,
    fontSize: 34, bold: true, color: DARK_TEXT,   // always white, always safe
    fontFace: t.font, align: 'left', valign: 'middle', shrinkText: true,
  })
}

// Small pill badge (KEY INSIGHT etc.)
function pill(s: any, t: Theme, label: string, x: number, y: number) {
  const w = label.length * 0.12 + 0.6
  s.addShape('roundRect', { x, y, w, h: 0.42,
    fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 }, rectRadius: 0.21 })
  s.addText(label, { x, y, w, h: 0.42,
    fontSize: 11, bold: true, color: t.onAccent,
    fontFace: t.font, align: 'center', valign: 'middle', charSpacing: 1.5 })
}

// ── ROUTE ─────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'GROQ_API_KEY not configured' }, { status: 500 })

  const { content, title, theme = 'minimal' } = await req.json()
  const t = THEMES[(theme as ThemeKey) in THEMES ? (theme as ThemeKey) : 'minimal']
  const pageText = typeof content === 'string' ? content : tiptapToText(content)

  // Use up to 10 000 chars so large documents are well covered
  const docText = pageText.slice(0, 10000)

  const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 6000,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are an expert presentation designer. Your job is to turn a document into a complete, comprehensive slide deck that covers EVERY major point.

Return ONLY valid JSON: { "slides": [ ... ] }

═══════════════════════════════════════
SLIDE TYPES — mandatory schema
═══════════════════════════════════════

TITLE (always slide 1):
{ "type":"title", "title":"≤8 words", "subtitle":"1 complete sentence, ≤20 words" }

SECTION (use between major topics, ≥2 per deck):
{ "type":"section", "title":"3–6 words", "subtitle":"1 sentence ≤15 words" }

BULLETS (most common type — use for any list or enumeration):
{ "type":"bullets", "title":"≤8 words", "bullets":["Sentence ≤18 words","Sentence ≤18 words","Sentence ≤18 words"] }
→ EXACTLY 3 bullets, never fewer, never more.

BIG-IDEA (1–2 per deck, for the strongest insight):
{ "type":"big-idea", "title":"3–5 words", "statement":"Bold claim ≤14 words", "context":"1 sentence ≤18 words" }

TWO-COL (comparison or before/after):
{ "type":"two-col", "title":"≤8 words", "col1":{"heading":"≤4 words","points":["≤14 words","≤14 words","≤14 words"]}, "col2":{"heading":"≤4 words","points":["≤14 words","≤14 words","≤14 words"]} }

QUOTE (striking phrase or key statement):
{ "type":"quote", "title":"3–5 words", "quote":"≤25 words", "source":"≤8 words" }

STATS (key numbers — exactly 2 or 3):
{ "type":"stats", "title":"≤8 words", "stats":[{"value":"42%","label":"≤5 words"},{"value":"3×","label":"≤5 words"}] }

CONCLUSION (always last slide):
{ "type":"conclusion", "title":"Key Takeaways", "points":["≤20 words","≤20 words","≤20 words"] }
→ EXACTLY 3 points.

═══════════════════════════════════════
RULES — respect every one
═══════════════════════════════════════
• Total slides: 12 to 20.  Use as many as needed to cover ALL content.
• Order: title → sections with their content slides → conclusion.
• Cover EVERY section, topic and key point from the document — do not skip.
• Add a SECTION slide before each new major topic.
• Use BULLETS for any list, process, or set of ideas.
• Use BIG-IDEA for the single most important insight per section.
• Use STATS when numbers are available.
• Word limits are HARD — slides have fixed physical dimensions.
• Every string must be a complete sentence or meaningful phrase.
• Language: match the document exactly (French → French, English → English).
• Optional "notes" field: one sentence speaker note per slide.`,
        },
        { role: 'user', content: `Document title: ${title || 'Untitled'}\n\n${docText}` },
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
    if (!slides.length) throw new Error('empty')
  } catch {
    return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 })
  }

  const PptxGenJS = (await import('pptxgenjs')).default
  const prs = new PptxGenJS()
  prs.layout = 'LAYOUT_WIDE'

  for (const slide of slides) {
    const s = prs.addSlide()

    // ── TITLE ───────────────────────────────────────────────────────────────
    if (slide.type === 'title') {
      gRect(s, 0, 0, W, H, t.grad1, t.grad2, 135)
      lStripe(s, t)
      // Decorative arcs top-right
      s.addShape('ellipse', { x: 9.6, y: -2.2, w: 6.2, h: 6.2,
        fill: { color: t.accentColor, transparency: 68 }, line: { color: t.accentColor, transparency: 100 } })
      s.addShape('ellipse', { x: 10.6, y: -1.2, w: 4.2, h: 4.2,
        fill: { color: t.grad1, transparency: 0 }, line: { color: t.grad1, transparency: 100 } })
      s.addShape('ellipse', { x: 11.0, y: 4.9, w: 3.0, h: 3.0,
        fill: { color: t.accentColor, transparency: 62 }, line: { color: t.accentColor, transparency: 100 } })
      // BIG title
      s.addText(slide.title || '', {
        x: 0.9, y: 1.2, w: 9.4, h: 2.9,
        fontSize: 64, bold: true, color: DARK_TEXT,
        fontFace: t.font, align: 'left', valign: 'middle', charSpacing: -0.8,
        lineSpacingMultiple: 1.1, shrinkText: true,
      })
      s.addShape('rect', { x: 0.9, y: 4.26, w: 3.0, h: 0.1,
        fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })
      if (slide.subtitle) {
        s.addText(slide.subtitle, {
          x: 0.9, y: 4.52, w: 9.6, h: 1.65,
          fontSize: 22, color: t.darkSub,
          fontFace: t.font, align: 'left', lineSpacingMultiple: 1.35, shrinkText: true,
        })
      }

    // ── SECTION ─────────────────────────────────────────────────────────────
    } else if (slide.type === 'section') {
      gRect(s, 0, 0, W, H, t.grad1, t.grad2, 148)
      // Large decorative circle right
      s.addShape('ellipse', { x: 7.8, y: -1.6, w: 8.0, h: 8.0,
        fill: { color: t.accentColor, transparency: 76 }, line: { color: t.accentColor, transparency: 100 } })
      s.addShape('ellipse', { x: 9.0, y: -0.6, w: 6.0, h: 6.0,
        fill: { color: t.grad1, transparency: 0 }, line: { color: t.grad1, transparency: 100 } })
      s.addShape('ellipse', { x: -2.5, y: 4.6, w: 5.8, h: 5.8,
        fill: { color: t.accentColor, transparency: 76 }, line: { color: t.accentColor, transparency: 100 } })
      // Vertical accent bar
      s.addShape('rect', { x: 0.6, y: 1.4, w: 0.12, h: 2.4,
        fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })
      s.addText(slide.title || '', {
        x: 0.9, y: 1.2, w: 8.6, h: 2.8,
        fontSize: 56, bold: true, color: DARK_TEXT,
        fontFace: t.font, align: 'left', valign: 'middle', charSpacing: -0.4,
        lineSpacingMultiple: 1.1, shrinkText: true,
      })
      s.addShape('rect', { x: 0.9, y: 4.14, w: 3.2, h: 0.08,
        fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })
      if (slide.subtitle) {
        s.addText(slide.subtitle, {
          x: 0.9, y: 4.36, w: 8.4, h: 1.5,
          fontSize: 22, color: t.darkSub,
          fontFace: t.font, align: 'left', lineSpacingMultiple: 1.3, shrinkText: true,
        })
      }

    // ── BIG-IDEA ────────────────────────────────────────────────────────────
    } else if (slide.type === 'big-idea') {
      gRect(s, 0, 0, W, H, t.grad1, t.grad2, 148)
      lStripe(s, t)
      s.addShape('ellipse', { x: 8.6, y: 0.2, w: 6.8, h: 6.8,
        fill: { color: t.accentColor, transparency: 86 }, line: { color: t.accentColor, transparency: 100 } })
      s.addShape('ellipse', { x: 9.6, y: 1.2, w: 5.0, h: 5.0,
        fill: { color: t.grad1, transparency: 0 }, line: { color: t.grad1, transparency: 100 } })
      if (slide.title) {
        s.addText(slide.title.toUpperCase(), {
          x: 0.9, y: 0.26, w: 10.0, h: 0.46,
          fontSize: 12, color: t.darkSub,
          fontFace: t.font, align: 'left', charSpacing: 3.0,
        })
        s.addShape('rect', { x: 0.9, y: 0.76, w: 2.0, h: 0.05,
          fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })
      }
      pill(s, t, 'KEY INSIGHT', 0.9, 1.06)
      // Main statement — BIG and bold
      s.addText(slide.statement || '', {
        x: 0.9, y: 1.64, w: 10.0, h: 3.46,
        fontSize: 42, bold: true, color: DARK_TEXT,
        fontFace: t.font, align: 'left', valign: 'middle', lineSpacingMultiple: 1.22,
        shrinkText: true,
      })
      s.addShape('rect', { x: 0.9, y: 5.28, w: 3.6, h: 0.07,
        fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })
      if (slide.context) {
        s.addText(slide.context, {
          x: 0.9, y: 5.46, w: 10.0, h: 1.14,
          fontSize: 17, italic: true, color: t.darkSub,
          fontFace: t.font, align: 'left', shrinkText: true,
        })
      }

    // ── BULLETS ─────────────────────────────────────────────────────────────
    } else if (slide.type === 'bullets') {
      s.background = { color: t.bg }
      const BAND = 1.3
      hBand(s, t, slide.title || '', BAND)

      // Exactly 3 bullets — each gets 1.9" → 3×1.9 + 1.36 header = 7.06" < 7.5 ✓
      const bullets: string[] = (slide.bullets || []).slice(0, 3)
      const rowH = 1.9
      const textH = 1.4

      bullets.forEach((item: string, i: number) => {
        const y = BAND + 0.06 + i * rowH
        // Alternating card
        if (i % 2 === 0) {
          s.addShape('roundRect', { x: 0.38, y: y + 0.04, w: W - 0.56, h: rowH - 0.1,
            fill: { color: t.accentLight }, line: { color: t.accentLight, transparency: 100 }, rectRadius: 0.08 })
        }
        // Number badge
        const bY = y + rowH / 2 - 0.28
        s.addShape('ellipse', { x: 0.44, y: bY, w: 0.56, h: 0.56,
          fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })
        s.addText(String(i + 1), {
          x: 0.44, y: bY, w: 0.56, h: 0.56,
          fontSize: 16, bold: true, color: t.onAccent,
          fontFace: t.font, align: 'center', valign: 'middle',
        })
        // Bullet text — always t.lightText on bg/accentLight for guaranteed contrast
        s.addText(item, {
          x: 1.14, y: y + (rowH - textH) / 2, w: W - 1.36, h: textH,
          fontSize: 20, color: t.lightText,
          fontFace: t.font, valign: 'middle', wrap: true, shrinkText: true,
          lineSpacingMultiple: 1.22,
        })
      })

    // ── TWO-COL ─────────────────────────────────────────────────────────────
    } else if (slide.type === 'two-col') {
      s.background = { color: t.bg }
      const BAND = 1.2
      hBand(s, t, slide.title || '', BAND)

      const colY = BAND + 0.1
      const colH = H - colY - 0.14
      const colW = (W - 0.24 - 0.44 - 0.3) / 2  // ≈ 6.07"
      const col1X = 0.38
      const col2X = col1X + colW + 0.3

      ;[{ col: slide.col1 || {}, cx: col1X }, { col: slide.col2 || {}, cx: col2X }]
        .forEach(({ col, cx }) => {
          s.addShape('roundRect', { x: cx, y: colY, w: colW, h: colH,
            fill: { color: t.accentLight }, line: { color: t.accentLight, transparency: 100 }, rectRadius: 0.12 })
          // Column header — dark gradient, white text
          gRect(s, cx, colY, colW, 0.72, t.hGrad1, t.hGrad2, 90)
          s.addText(col.heading || '', {
            x: cx + 0.18, y: colY + 0.04, w: colW - 0.28, h: 0.64,
            fontSize: 20, bold: true, color: DARK_TEXT,
            fontFace: t.font, align: 'left', valign: 'middle', shrinkText: true,
          })
          // Left accent bar
          s.addShape('rect', { x: cx + 0.14, y: colY + 0.82, w: 0.07, h: colH - 0.94,
            fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })
          // Points — always t.lightText for contrast
          const pts: string[] = (col.points || []).slice(0, 3)
          const ptH = (colH - 0.94) / 3
          pts.forEach((pt: string, i: number) => {
            s.addText(pt, {
              x: cx + 0.3, y: colY + 0.86 + i * ptH, w: colW - 0.42, h: ptH - 0.06,
              fontSize: 16, color: t.lightText,
              fontFace: t.font, valign: 'middle', wrap: true, shrinkText: true,
              lineSpacingMultiple: 1.2,
            })
          })
        })

    // ── QUOTE ───────────────────────────────────────────────────────────────
    } else if (slide.type === 'quote') {
      gRect(s, 0, 0, W, H, t.grad1, t.grad2, 162)
      lStripe(s, t)
      // Giant decorative quote mark (behind)
      s.addText('“', {
        x: -0.8, y: -1.8, w: 6.5, h: 6.5,
        fontSize: 300, color: t.accentColor,
        fontFace: t.font, align: 'left', valign: 'top', transparency: 75,
      })
      if (slide.title) {
        s.addText(slide.title.toUpperCase(), {
          x: 0.9, y: 0.28, w: 10.5, h: 0.44,
          fontSize: 12, color: t.darkSub,
          fontFace: t.font, align: 'left', charSpacing: 3.0,
        })
      }
      // Vertical bar
      s.addShape('rect', { x: 0.86, y: 0.96, w: 0.16, h: 5.1,
        fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })
      // Quote — big, white, readable
      s.addText(slide.quote || '', {
        x: 1.22, y: 0.82, w: W - 1.7, h: 4.96,
        fontSize: 30, italic: true, color: DARK_TEXT,
        fontFace: t.font, align: 'left', valign: 'middle', lineSpacingMultiple: 1.45,
        shrinkText: true,
      })
      if (slide.source) {
        s.addShape('rect', { x: 1.22, y: 5.9, w: 3.6, h: 0.07,
          fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })
        s.addText(`— ${slide.source}`, {
          x: 1.22, y: 6.1, w: W - 1.7, h: 0.52,
          fontSize: 16, bold: true, color: t.darkSub,
          fontFace: t.font, align: 'left',
        })
      }

    // ── STATS ───────────────────────────────────────────────────────────────
    } else if (slide.type === 'stats') {
      s.background = { color: t.bg }
      const BAND = 1.2
      hBand(s, t, slide.title || '', BAND)

      const stats: { value: string; label: string }[] = (slide.stats || []).slice(0, 3)
      const count = stats.length || 1
      const gap = 0.3
      const cardW = (W - 0.24 - 0.38 - gap * (count - 1)) / count
      const startX = 0.34
      const cardY = BAND + 0.14
      const cardH = H - cardY - 0.18

      stats.forEach((st, i) => {
        const cx = startX + i * (cardW + gap)
        s.addShape('roundRect', { x: cx, y: cardY, w: cardW, h: cardH,
          fill: { color: t.accentLight }, line: { color: t.accentLight, transparency: 100 }, rectRadius: 0.16 })
        // Top strip
        s.addShape('rect', { x: cx, y: cardY, w: cardW, h: 0.28,
          fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })
        // Stat value — BIG
        s.addText(st.value, {
          x: cx + 0.1, y: cardY + 0.32, w: cardW - 0.2, h: cardH * 0.56,
          fontSize: 80, bold: true, color: t.statColor,
          fontFace: t.font, align: 'center', valign: 'middle', shrinkText: true,
        })
        // Separator
        const sepY = cardY + cardH * 0.66
        s.addShape('rect', { x: cx + cardW / 2 - 1.4, y: sepY, w: 2.8, h: 0.07,
          fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })
        // Label — lightText always readable on accentLight
        s.addText(st.label, {
          x: cx + 0.14, y: sepY + 0.16, w: cardW - 0.28, h: cardH - cardH * 0.66 - 0.26,
          fontSize: 18, bold: true, color: t.lightText,
          fontFace: t.font, align: 'center', valign: 'top', wrap: true, shrinkText: true,
        })
      })

    // ── CONCLUSION ──────────────────────────────────────────────────────────
    } else if (slide.type === 'conclusion') {
      gRect(s, 0, 0, W, H, t.grad1, t.grad2, 135)
      lStripe(s, t)
      // Decorative arcs bottom-right
      s.addShape('ellipse', { x: 9.8, y: 3.2, w: 4.8, h: 4.8,
        fill: { color: t.accentColor, transparency: 66 }, line: { color: t.accentColor, transparency: 100 } })
      s.addShape('ellipse', { x: 10.7, y: 4.1, w: 3.3, h: 3.3,
        fill: { color: t.grad1, transparency: 0 }, line: { color: t.grad1, transparency: 100 } })
      // Title
      s.addText(slide.title || 'Key Takeaways', {
        x: 0.9, y: 0.16, w: 9.0, h: 1.0,
        fontSize: 40, bold: true, color: DARK_TEXT,
        fontFace: t.font, align: 'left', shrinkText: true,
      })
      s.addShape('rect', { x: 0.9, y: 1.22, w: 9.6, h: 0.07,
        fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })

      // Exactly 3 rows — each 1.66" → 3×1.66 + 1.29 header = 6.27" < 7.5 ✓
      const pts: string[] = (slide.points || []).slice(0, 3)
      const rowH = 1.66
      pts.forEach((pt: string, i: number) => {
        const y = 1.34 + i * rowH
        s.addShape('roundRect', { x: 0.9, y, w: 9.6, h: rowH - 0.1,
          fill: { color: t.accentLight }, line: { color: t.accentLight, transparency: 100 }, rectRadius: 0.1 })
        // Badge
        const bSize = 0.78
        const bY = y + (rowH - 0.1) / 2 - bSize / 2
        s.addShape('ellipse', { x: 1.06, y: bY, w: bSize, h: bSize,
          fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })
        s.addText(String(i + 1), {
          x: 1.06, y: bY, w: bSize, h: bSize,
          fontSize: 24, bold: true, color: t.onAccent,
          fontFace: t.font, align: 'center', valign: 'middle',
        })
        // Point — lightText always safe on accentLight
        s.addText(pt, {
          x: 2.06, y: y + 0.14, w: 8.3, h: rowH - 0.34,
          fontSize: 20, color: t.lightText,
          fontFace: t.font, valign: 'middle', wrap: true, shrinkText: true,
          lineSpacingMultiple: 1.22,
        })
      })
    }

    if (slide.notes) s.addNotes(slide.notes)
  }

  const buf = await prs.write({ outputType: 'nodebuffer' }) as Buffer
  const safe = (title || 'presentation').replace(/[^a-z0-9]/gi, '_').slice(0, 40)
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'Content-Disposition': `attachment; filename="${safe}.pptx"`,
    },
  })
}

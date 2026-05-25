import { NextRequest, NextResponse } from 'next/server'

const W = 13.33
const H = 7.5

// Contrast rules:
//   Gradient slides  → 'FFFFFF' primary, t.darkSub secondary
//   Light-bg slides  → t.bodyText primary, t.bodyMid secondary
//   Dark-bg slides   → t.bodyText (near-white) primary, t.bodyMid secondary
//   Header bands     → always 'FFFFFF'
//   Badge text       → t.onAccent

const THEMES = {
  minimal: {
    bg: 'FFFFFF', accentColor: '4F46E5', onAccent: 'FFFFFF',
    accentLight: 'EEF2FF', accentMid: 'C7D2FE',
    darkSub: 'C7D2FE', bodyText: '111827', bodyMid: '4B5563',
    statColor: '3730A3', font: 'Calibri',
    grad1: '1E1B4B', grad2: '111827', hGrad1: '1E1B4B', hGrad2: '312E81',
  },
  corporate: {
    bg: 'F8FAFC', accentColor: '0369A1', onAccent: 'FFFFFF',
    accentLight: 'E0F2FE', accentMid: 'BAE6FD',
    darkSub: '7DD3FC', bodyText: '0C1A2E', bodyMid: '374151',
    statColor: '0C4A6E', font: 'Calibri',
    grad1: '0C1A28', grad2: '0F2A42', hGrad1: '0C1A28', hGrad2: '075985',
  },
  dark: {
    bg: '1E1E2E', accentColor: '89B4FA', onAccent: '11111B',
    accentLight: '313244', accentMid: '585B70',
    darkSub: 'A6B4D4', bodyText: 'CDD6F4', bodyMid: 'A6B4D4',
    statColor: '89B4FA', font: 'Calibri',
    grad1: '0D0D1A', grad2: '1A1A2E', hGrad1: '0D0D1A', hGrad2: '1A1A2E',
  },
  colorful: {
    bg: 'FDFCFF', accentColor: '7C3AED', onAccent: 'FFFFFF',
    accentLight: 'EDE9FE', accentMid: 'C4B5FD',
    darkSub: 'DDD6FE', bodyText: '1E0A3C', bodyMid: '4B5563',
    statColor: '4C1D95', font: 'Calibri',
    grad1: '3B0764', grad2: '4C1D95', hGrad1: '2E1065', hGrad2: '4C1D95',
  },
} as const

type ThemeKey = keyof typeof THEMES
type Theme = typeof THEMES[ThemeKey]

function tiptapToText(node: any): string {
  if (!node) return ''
  if (node.type === 'text') return node.text || ''
  const children = (node.content || []).map((c: any) => tiptapToText(c)).join('')
  switch (node.type) {
    case 'heading':     return `${'#'.repeat(node.attrs?.level || 1)} ${children}\n`
    case 'paragraph':   return children ? `${children}\n` : ''
    case 'bulletList':
    case 'orderedList': return children
    case 'listItem':    return `• ${children.trim()}\n`
    case 'blockquote':  return `"${children.trim()}"\n`
    case 'codeBlock':   return `[Code]\n`
    case 'table':       return '[Table]\n'
    default:            return children
  }
}

function gRect(s: any, x: number, y: number, w: number, h: number, c1: string, c2: string, angle = 135) {
  s.addShape('rect', { x, y, w, h,
    fill: { type: 'gradient', gradientType: 'linear', angle,
            stops: [{ position: 0, color: c1 }, { position: 100, color: c2 }] },
    line: { color: c1, transparency: 100 },
  })
}

// Explicit solid bg — more reliable than s.background for dark themes
function bgFill(s: any, color: string) {
  s.addShape('rect', { x: 0, y: 0, w: W, h: H, fill: { color }, line: { color, transparency: 100 } })
}

function lStripe(s: any, t: Theme) {
  s.addShape('rect', { x: 0, y: 0, w: 0.26, h: H,
    fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })
}

// Header band — always dark gradient with white text, independent of theme bg
function hBand(s: any, t: Theme, title: string, bandH: number) {
  s.addShape('rect', { x: 0, y: 0, w: 0.24, h: H,
    fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })
  gRect(s, 0.24, 0, W - 0.24, bandH, t.hGrad1, t.hGrad2, 90)
  s.addShape('rect', { x: 0.24, y: bandH, w: W - 0.24, h: 0.06,
    fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })
  s.addText(title, {
    x: 0.52, y: 0.06, w: W - 0.72, h: bandH - 0.06,
    fontSize: 30, bold: true, color: 'FFFFFF',
    fontFace: t.font, align: 'left', valign: 'middle', shrinkText: true,
  })
}

function pill(s: any, t: Theme, label: string, x: number, y: number) {
  const pw = label.length * 0.11 + 0.5
  s.addShape('roundRect', { x, y, w: pw, h: 0.38,
    fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 }, rectRadius: 0.19 })
  s.addText(label, { x, y, w: pw, h: 0.38,
    fontSize: 10, bold: true, color: t.onAccent,
    fontFace: t.font, align: 'center', valign: 'middle', charSpacing: 1.5 })
}

// Large translucent number for SECTION slides
function sectionNum(s: any, t: Theme, n: number) {
  s.addText(String(n).padStart(2, '0'), {
    x: 4.8, y: -0.8, w: 8.2, h: 8.6,
    fontSize: 420, bold: true, color: t.accentColor,
    fontFace: t.font, align: 'right', valign: 'middle',
    transparency: 87,
  })
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'GROQ_API_KEY not configured' }, { status: 500 })

  const { content, title, theme = 'minimal' } = await req.json()
  const t = THEMES[(theme as ThemeKey) in THEMES ? (theme as ThemeKey) : 'minimal']
  const pageText = typeof content === 'string' ? content : tiptapToText(content)
  const docText = pageText.slice(0, 12000)

  const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 8000,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are an expert presentation designer. Transform a document into a thorough, substantive slide deck.

Return ONLY valid JSON: { "slides": [ ... ] }

═══════════════════════════════════════
SLIDE TYPES — exact schemas required
═══════════════════════════════════════

TITLE (always first slide):
{ "type":"title", "title":"≤10 words — specific and engaging", "subtitle":"1 complete sentence ≤25 words", "notes":"speaker note" }

SECTION (between major topics, ≥2 per deck):
{ "type":"section", "title":"3–6 words", "subtitle":"1 sentence ≤18 words — provides context", "notes":"speaker note" }

BULLETS (lists, arguments, features, reasons — most frequent type):
{ "type":"bullets", "title":"≤8 words", "bullets":["Complete sentence ≤22 words","..."], "notes":"speaker note" }
→ 4 or 5 bullets per slide. Each is a FULL SENTENCE with real substance. Never fragments.

PROCESS (sequences, workflows, steps, how-to, methods):
{ "type":"process", "title":"≤8 words", "steps":[{"title":"≤6 words","detail":"1 sentence ≤20 words"},...], "notes":"speaker note" }
→ 3 to 5 steps.

BIG-IDEA (1–2 per deck, strongest insight per section):
{ "type":"big-idea", "title":"3–5 words", "statement":"Bold memorable claim ≤16 words", "context":"Supporting context ≤22 words", "notes":"speaker note" }

TWO-COL (comparisons, before/after, pros/cons, two approaches):
{ "type":"two-col", "title":"≤8 words",
  "col1":{"heading":"≤5 words","points":["≤18 words","≤18 words","≤18 words","≤18 words"]},
  "col2":{"heading":"≤5 words","points":["≤18 words","≤18 words","≤18 words","≤18 words"]},
  "notes":"speaker note" }

QUOTE (striking phrase, key principle, memorable statement):
{ "type":"quote", "title":"3–5 words", "quote":"≤30 words — complete and impactful", "source":"attribution ≤10 words", "notes":"speaker note" }

STATS (key numbers, metrics, data points):
{ "type":"stats", "title":"≤8 words", "stats":[{"value":"42%","label":"≤8 words"},{"value":"3×","label":"≤8 words"}], "notes":"speaker note" }
→ 2 or 3 stats.

CONCLUSION (always last slide):
{ "type":"conclusion", "title":"Key Takeaways", "points":["≤25 words","≤25 words","≤25 words"], "notes":"speaker note" }
→ EXACTLY 3 points, each a complete actionable sentence.

═══════════════════════════════════════
CONTENT RULES — all mandatory
═══════════════════════════════════════
• Total slides: 15 to 22. Cover EVERY topic without skipping.
• Every bullet/point must be a COMPLETE SENTENCE — never a one-word or two-word fragment.
• BULLETS slides must have 4 or 5 items — never 3 or fewer.
• Each major section: 1 SECTION slide + 2–4 content slides + 1 BIG-IDEA.
• Use PROCESS for any sequence, method, or workflow in the document.
• Use STATS whenever numbers or metrics appear.
• Use TWO-COL for any comparison or contrast.
• Word limits are HARD — slides have fixed physical dimensions.
• Language: exactly match the document (French → French, English → English).
• SPECIFICITY: every sentence must contain a concrete fact, name, number, or example from the document. Never write generic claims like "X is important" or "This approach offers many benefits".
• BIG-IDEA statements must be counterintuitive or surprising — not a restatement of the obvious. Bad: "Leadership matters for success." Good: "Most projects fail from misaligned expectations, not technical failure."
• Slide titles must not repeat the same opening word across consecutive slides. Vary structure: use verbs, nouns, questions.
• TITLE slide: the title must be engaging and specific to this document's actual content, not just the document title verbatim.`,
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

  let sectionCount = 0
  for (const slide of slides) {
    const s = prs.addSlide()

    // ── TITLE ───────────────────────────────────────────────────────────────
    if (slide.type === 'title') {
      gRect(s, 0, 0, W, H, t.grad1, t.grad2, 135)
      lStripe(s, t)
      s.addShape('ellipse', { x: 9.4, y: -2.6, w: 7.0, h: 7.0,
        fill: { color: t.accentColor, transparency: 68 }, line: { color: t.accentColor, transparency: 100 } })
      s.addShape('ellipse', { x: 10.5, y: -1.5, w: 4.8, h: 4.8,
        fill: { color: t.grad1, transparency: 0 }, line: { color: t.grad1, transparency: 100 } })
      s.addShape('ellipse', { x: 11.2, y: 5.0, w: 2.8, h: 2.8,
        fill: { color: t.accentColor, transparency: 62 }, line: { color: t.accentColor, transparency: 100 } })
      // Bottom tinted band
      s.addShape('rect', { x: 0.26, y: H - 0.4, w: W - 0.26, h: 0.4,
        fill: { color: t.accentColor, transparency: 80 }, line: { color: t.accentColor, transparency: 100 } })
      s.addText(slide.title || '', {
        x: 0.9, y: 0.9, w: 9.6, h: 3.1,
        fontSize: 60, bold: true, color: 'FFFFFF',
        fontFace: t.font, align: 'left', valign: 'middle', charSpacing: -0.8,
        lineSpacingMultiple: 1.1, shrinkText: true,
      })
      s.addShape('rect', { x: 0.9, y: 4.18, w: 3.2, h: 0.1,
        fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })
      if (slide.subtitle) {
        s.addText(slide.subtitle, {
          x: 0.9, y: 4.42, w: 9.8, h: 1.8,
          fontSize: 22, color: t.darkSub,
          fontFace: t.font, align: 'left', lineSpacingMultiple: 1.4, shrinkText: true,
        })
      }

    // ── SECTION ─────────────────────────────────────────────────────────────
    } else if (slide.type === 'section') {
      sectionCount++
      gRect(s, 0, 0, W, H, t.grad1, t.grad2, 148)
      sectionNum(s, t, sectionCount)
      s.addShape('ellipse', { x: -2.8, y: 4.6, w: 5.8, h: 5.8,
        fill: { color: t.accentColor, transparency: 76 }, line: { color: t.accentColor, transparency: 100 } })
      s.addShape('rect', { x: 0.6, y: 1.5, w: 0.14, h: 2.5,
        fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })
      s.addText(slide.title || '', {
        x: 0.9, y: 1.1, w: 8.8, h: 3.0,
        fontSize: 54, bold: true, color: 'FFFFFF',
        fontFace: t.font, align: 'left', valign: 'middle', charSpacing: -0.4,
        lineSpacingMultiple: 1.1, shrinkText: true,
      })
      s.addShape('rect', { x: 0.9, y: 4.22, w: 3.4, h: 0.09,
        fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })
      if (slide.subtitle) {
        s.addText(slide.subtitle, {
          x: 0.9, y: 4.44, w: 8.6, h: 1.7,
          fontSize: 21, color: t.darkSub,
          fontFace: t.font, align: 'left', lineSpacingMultiple: 1.35, shrinkText: true,
        })
      }

    // ── BIG-IDEA ────────────────────────────────────────────────────────────
    } else if (slide.type === 'big-idea') {
      gRect(s, 0, 0, W, H, t.grad1, t.grad2, 148)
      lStripe(s, t)
      s.addShape('ellipse', { x: 8.4, y: -0.2, w: 7.2, h: 7.2,
        fill: { color: t.accentColor, transparency: 88 }, line: { color: t.accentColor, transparency: 100 } })
      s.addShape('ellipse', { x: 9.6, y: 0.8, w: 5.2, h: 5.2,
        fill: { color: t.grad1, transparency: 0 }, line: { color: t.grad1, transparency: 100 } })
      if (slide.title) {
        s.addText(slide.title.toUpperCase(), {
          x: 0.9, y: 0.26, w: 10.0, h: 0.46,
          fontSize: 12, color: t.darkSub,
          fontFace: t.font, align: 'left', charSpacing: 3.5,
        })
        s.addShape('rect', { x: 0.9, y: 0.76, w: 2.2, h: 0.05,
          fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })
      }
      pill(s, t, 'KEY INSIGHT', 0.9, 1.06)
      s.addText(slide.statement || '', {
        x: 0.9, y: 1.62, w: 10.2, h: 3.5,
        fontSize: 40, bold: true, color: 'FFFFFF',
        fontFace: t.font, align: 'left', valign: 'middle', lineSpacingMultiple: 1.25,
        shrinkText: true,
      })
      s.addShape('rect', { x: 0.9, y: 5.28, w: 4.0, h: 0.07,
        fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })
      if (slide.context) {
        s.addText(slide.context, {
          x: 0.9, y: 5.48, w: 10.2, h: 1.22,
          fontSize: 17, italic: true, color: t.darkSub,
          fontFace: t.font, align: 'left', lineSpacingMultiple: 1.3, shrinkText: true,
        })
      }

    // ── BULLETS ─────────────────────────────────────────────────────────────
    } else if (slide.type === 'bullets') {
      bgFill(s, t.bg)
      const BAND = 1.28
      hBand(s, t, slide.title || '', BAND)

      const bullets: string[] = (slide.bullets || []).slice(0, 5)
      const count = Math.max(bullets.length, 1)
      const availH = H - BAND - 0.12
      const rowH = availH / count
      const cardH = rowH - 0.1
      const fz = count <= 3 ? 20 : count === 4 ? 18 : 16
      const badgeSize = count <= 3 ? 0.56 : 0.48
      const badgeFz = count <= 3 ? 16 : 13

      bullets.forEach((item: string, i: number) => {
        const y = BAND + 0.06 + i * rowH
        // Card
        s.addShape('roundRect', { x: 0.34, y: y + 0.04, w: W - 0.52, h: cardH,
          fill: { color: t.accentLight },
          line: { color: t.accentMid, transparency: 0, width: 0.5 },
          rectRadius: 0.08 })
        // Left accent bar
        s.addShape('rect', { x: 0.34, y: y + 0.04, w: 0.08, h: cardH,
          fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })
        // Number badge
        const bY = y + rowH / 2 - badgeSize / 2
        s.addShape('ellipse', { x: 0.54, y: bY, w: badgeSize, h: badgeSize,
          fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })
        s.addText(String(i + 1), {
          x: 0.54, y: bY, w: badgeSize, h: badgeSize,
          fontSize: badgeFz, bold: true, color: t.onAccent,
          fontFace: t.font, align: 'center', valign: 'middle',
        })
        // Text
        const textH = cardH * 0.78
        s.addText(item, {
          x: 1.24, y: y + 0.04 + (cardH - textH) / 2, w: W - 1.46, h: textH,
          fontSize: fz, color: t.bodyText,
          fontFace: t.font, valign: 'middle', wrap: true, shrinkText: true,
          lineSpacingMultiple: 1.2,
        })
      })

    // ── PROCESS ─────────────────────────────────────────────────────────────
    } else if (slide.type === 'process') {
      bgFill(s, t.bg)
      const BAND = 1.28
      hBand(s, t, slide.title || '', BAND)

      const steps: { title: string; detail: string }[] = (slide.steps || []).slice(0, 5)
      const count = Math.max(steps.length, 1)
      const availH = H - BAND - 0.12
      const rowH = availH / count
      const cardH = rowH - 0.1
      const numW = count <= 3 ? 1.0 : count === 4 ? 0.85 : 0.72
      const numFz = count <= 3 ? 38 : count === 4 ? 30 : 24
      const titleFz = count <= 3 ? 18 : count === 4 ? 16 : 14
      const detailFz = count <= 3 ? 15 : count === 4 ? 13 : 12

      steps.forEach((step, i) => {
        const y = BAND + 0.06 + i * rowH
        // Card background
        s.addShape('roundRect', { x: 0.34, y: y + 0.04, w: W - 0.52, h: cardH,
          fill: { color: t.accentLight },
          line: { color: t.accentMid, transparency: 0, width: 0.5 },
          rectRadius: 0.08 })
        // Step number box (dark gradient)
        gRect(s, 0.34, y + 0.04, numW, cardH, t.hGrad1, t.hGrad2, 90)
        s.addText(String(i + 1).padStart(2, '0'), {
          x: 0.34, y: y + 0.04, w: numW, h: cardH,
          fontSize: numFz, bold: true, color: 'FFFFFF',
          fontFace: t.font, align: 'center', valign: 'middle',
        })
        // Connector dot between steps
        if (i < count - 1) {
          const dotX = 0.34 + numW / 2 - 0.06
          s.addShape('ellipse', { x: dotX, y: y + 0.04 + cardH + 0.01, w: 0.12, h: 0.08,
            fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })
        }
        // Content area
        const textX = 0.34 + numW + 0.22
        const textW = W - textX - 0.28
        s.addText(step.title || '', {
          x: textX, y: y + 0.04, w: textW, h: cardH * 0.46,
          fontSize: titleFz, bold: true, color: t.bodyText,
          fontFace: t.font, valign: 'middle', shrinkText: true,
        })
        s.addShape('rect', { x: textX, y: y + 0.04 + cardH * 0.46, w: textW * 0.28, h: 0.035,
          fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })
        if (step.detail) {
          s.addText(step.detail, {
            x: textX, y: y + 0.04 + cardH * 0.5, w: textW, h: cardH * 0.46,
            fontSize: detailFz, color: t.bodyMid,
            fontFace: t.font, valign: 'middle', wrap: true, shrinkText: true,
            lineSpacingMultiple: 1.2,
          })
        }
      })

    // ── TWO-COL ─────────────────────────────────────────────────────────────
    } else if (slide.type === 'two-col') {
      bgFill(s, t.bg)
      const BAND = 1.2
      hBand(s, t, slide.title || '', BAND)

      const colY = BAND + 0.1
      const colH = H - colY - 0.14
      const colW = (W - 0.24 - 0.44 - 0.3) / 2
      const col1X = 0.38
      const col2X = col1X + colW + 0.3

      ;[{ col: slide.col1 || {}, cx: col1X }, { col: slide.col2 || {}, cx: col2X }]
        .forEach(({ col, cx }) => {
          s.addShape('roundRect', { x: cx, y: colY, w: colW, h: colH,
            fill: { color: t.accentLight },
            line: { color: t.accentMid, transparency: 0, width: 0.5 },
            rectRadius: 0.12 })
          // Column heading — accent-colored text (avoids flat gradient overlaying rounded card)
          s.addText(col.heading || '', {
            x: cx + 0.22, y: colY + 0.1, w: colW - 0.34, h: 0.64,
            fontSize: 20, bold: true, color: t.accentColor,
            fontFace: t.font, align: 'left', valign: 'middle', shrinkText: true,
          })
          // Separator line under heading
          s.addShape('rect', { x: cx + 0.22, y: colY + 0.78, w: colW - 0.44, h: 0.045,
            fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })
          // Left accent bar (below heading)
          s.addShape('rect', { x: cx + 0.14, y: colY + 0.88, w: 0.07, h: colH - 1.0,
            fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })
          const pts: string[] = (col.points || []).slice(0, 4)
          const ptH = (colH - 1.0) / Math.max(pts.length, 1)
          const ptFz = pts.length <= 3 ? 16 : 14
          pts.forEach((pt: string, i: number) => {
            s.addText(pt, {
              x: cx + 0.3, y: colY + 0.92 + i * ptH, w: colW - 0.42, h: ptH - 0.06,
              fontSize: ptFz, color: t.bodyText,
              fontFace: t.font, valign: 'middle', wrap: true, shrinkText: true,
              lineSpacingMultiple: 1.2,
            })
          })
        })

    // ── QUOTE ───────────────────────────────────────────────────────────────
    } else if (slide.type === 'quote') {
      gRect(s, 0, 0, W, H, t.grad1, t.grad2, 162)
      lStripe(s, t)
      s.addText('“', {
        x: -0.6, y: -2.0, w: 6.5, h: 6.5,
        fontSize: 300, color: t.accentColor,
        fontFace: t.font, align: 'left', valign: 'top', transparency: 75,
      })
      if (slide.title) {
        s.addText(slide.title.toUpperCase(), {
          x: 0.9, y: 0.28, w: 10.5, h: 0.46,
          fontSize: 12, color: t.darkSub,
          fontFace: t.font, align: 'left', charSpacing: 3.0,
        })
      }
      s.addShape('rect', { x: 0.86, y: 0.96, w: 0.16, h: 4.9,
        fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })
      s.addText(slide.quote || '', {
        x: 1.22, y: 0.82, w: W - 1.7, h: 5.0,
        fontSize: 28, italic: true, color: 'FFFFFF',
        fontFace: t.font, align: 'left', valign: 'middle', lineSpacingMultiple: 1.5,
        shrinkText: true,
      })
      if (slide.source) {
        s.addShape('rect', { x: 1.22, y: 5.9, w: 4.0, h: 0.07,
          fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })
        s.addText(`— ${slide.source}`, {
          x: 1.22, y: 6.1, w: W - 1.7, h: 0.52,
          fontSize: 16, bold: true, color: t.darkSub,
          fontFace: t.font, align: 'left',
        })
      }

    // ── STATS ───────────────────────────────────────────────────────────────
    } else if (slide.type === 'stats') {
      bgFill(s, t.bg)
      const BAND = 1.2
      hBand(s, t, slide.title || '', BAND)

      const stats: { value: string; label: string }[] = (slide.stats || []).slice(0, 3)
      const count = Math.max(stats.length, 1)
      const gap = 0.3
      const cardW = (W - 0.24 - 0.38 - gap * (count - 1)) / count
      const startX = 0.34
      const cardY = BAND + 0.14
      const cardH = H - cardY - 0.18
      const valFz = count === 1 ? 100 : count === 2 ? 88 : 72

      stats.forEach((st, i) => {
        const cx = startX + i * (cardW + gap)
        s.addShape('roundRect', { x: cx, y: cardY, w: cardW, h: cardH,
          fill: { color: t.accentLight },
          line: { color: t.accentMid, transparency: 0, width: 0.5 },
          rectRadius: 0.16 })
        // Top accent strip
        s.addShape('rect', { x: cx, y: cardY, w: cardW, h: 0.3,
          fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })
        // Stat value — very large
        s.addText(st.value, {
          x: cx + 0.1, y: cardY + 0.34, w: cardW - 0.2, h: cardH * 0.54,
          fontSize: valFz, bold: true, color: t.statColor,
          fontFace: t.font, align: 'center', valign: 'middle', shrinkText: true,
        })
        const sepY = cardY + cardH * 0.64
        s.addShape('rect', { x: cx + cardW / 2 - 1.2, y: sepY, w: 2.4, h: 0.07,
          fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })
        s.addText(st.label, {
          x: cx + 0.14, y: sepY + 0.14, w: cardW - 0.28, h: cardH - cardH * 0.64 - 0.28,
          fontSize: 17, bold: true, color: t.bodyText,
          fontFace: t.font, align: 'center', valign: 'top', wrap: true, shrinkText: true,
        })
      })

    // ── CONCLUSION ──────────────────────────────────────────────────────────
    } else if (slide.type === 'conclusion') {
      gRect(s, 0, 0, W, H, t.grad1, t.grad2, 135)
      lStripe(s, t)
      s.addShape('ellipse', { x: 9.4, y: 2.8, w: 5.4, h: 5.4,
        fill: { color: t.accentColor, transparency: 66 }, line: { color: t.accentColor, transparency: 100 } })
      s.addShape('ellipse', { x: 10.4, y: 3.8, w: 3.6, h: 3.6,
        fill: { color: t.grad1, transparency: 0 }, line: { color: t.grad1, transparency: 100 } })
      s.addText(slide.title || 'Key Takeaways', {
        x: 0.9, y: 0.14, w: 9.2, h: 1.0,
        fontSize: 38, bold: true, color: 'FFFFFF',
        fontFace: t.font, align: 'left', shrinkText: true,
      })
      s.addShape('rect', { x: 0.9, y: 1.2, w: 9.8, h: 0.07,
        fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })

      const pts: string[] = (slide.points || []).slice(0, 3)
      const rowH = (H - 1.38) / 3
      pts.forEach((pt: string, i: number) => {
        const y = 1.34 + i * rowH
        const cardH = rowH - 0.1
        s.addShape('roundRect', { x: 0.9, y, w: 9.8, h: cardH,
          fill: { color: t.accentColor, transparency: 80 },
          line: { color: t.accentColor, transparency: 60, width: 0.75 },
          rectRadius: 0.1 })
        const bSize = 0.72
        const bY = y + cardH / 2 - bSize / 2
        s.addShape('ellipse', { x: 1.06, y: bY, w: bSize, h: bSize,
          fill: { color: t.accentColor }, line: { color: t.accentColor, transparency: 100 } })
        s.addText(String(i + 1), {
          x: 1.06, y: bY, w: bSize, h: bSize,
          fontSize: 22, bold: true, color: t.onAccent,
          fontFace: t.font, align: 'center', valign: 'middle',
        })
        s.addText(pt, {
          x: 2.0, y: y + 0.1, w: 8.5, h: cardH - 0.2,
          fontSize: 19, color: 'FFFFFF',
          fontFace: t.font, valign: 'middle', wrap: true, shrinkText: true,
          lineSpacingMultiple: 1.25,
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

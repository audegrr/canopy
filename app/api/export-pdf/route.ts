import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'

export const runtime = 'nodejs'
export const maxDuration = 60

// Local dev has no @sparticuz/chromium binary — fall back to an installed
// Chrome so `npm run dev` still works without pulling in full `puppeteer`.
const LOCAL_CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
]

async function launchBrowser() {
  const puppeteer = await import('puppeteer-core')
  if (process.env.VERCEL) {
    const chromium = (await import('@sparticuz/chromium')).default
    // Matches @sparticuz/chromium's own integration test exactly: chromium.args
    // must be merged through puppeteer.defaultArgs() (not passed raw) or the
    // browser launches and responds fine but page.pdf() silently produces a
    // blank PDF. An explicit defaultViewport is part of the same reference setup.
    const args = await puppeteer.defaultArgs({ args: chromium.args, headless: 'shell' })
    return puppeteer.launch({
      args,
      defaultViewport: { deviceScaleFactor: 1, hasTouch: false, height: 1080, isLandscape: true, isMobile: false, width: 1920 },
      executablePath: await chromium.executablePath(),
      headless: 'shell',
    })
  }
  const executablePath = LOCAL_CHROME_CANDIDATES.find(p => fs.existsSync(p))
  if (!executablePath) throw new Error('No local Chrome install found for PDF export')
  return puppeteer.launch({ executablePath, headless: true })
}

export async function POST(req: NextRequest) {
  const { html, css, title } = await req.json()
  if (!html) return NextResponse.json({ error: 'Nothing to export' }, { status: 400 })
  console.log(`[export-pdf] received html.length=${html.length} css.length=${(css || '').length}`)

  let browser
  try {
    browser = await launchBrowser()
    console.log('[export-pdf] browser launched, connected=', browser.connected)
    const page = await browser.newPage()
    page.on('console', msg => console.log('[export-pdf][page console]', msg.type(), msg.text()))
    page.on('pageerror', (err: unknown) => console.log('[export-pdf][page error]', err instanceof Error ? err.message : err))
    const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <style>* { box-sizing: border-box; margin: 0; padding: 0; }</style>
      <style>${css || ''}</style>
    </head><body class="printing-page">${html}</body></html>`
    // page.setContent() injects the document via document.write(), which in
    // some restricted Chromium configurations (single-process/headless-shell,
    // as used here) doesn't properly commit a frame for the print pipeline —
    // the DOM is populated (visible to page.evaluate) but page.pdf() captures
    // nothing. Loading via an actual navigation avoids that.
    await page.goto(`data:text/html;charset=utf-8,${encodeURIComponent(fullHtml)}`, { waitUntil: 'load' })
    const bodyText = await page.evaluate(() => document.body.innerText)
    const bodyHtmlLength = await page.evaluate(() => document.body.innerHTML.length)
    console.log(`[export-pdf] after setContent: body.innerHTML.length=${bodyHtmlLength} body.innerText.length=${bodyText.length} snippet=${JSON.stringify(bodyText.slice(0, 200))}`)
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '22mm', bottom: '22mm', left: '20mm', right: '20mm' },
    })
    console.log(`[export-pdf] pdf generated, byteLength=${pdfBuffer.length}`)
    const safe = (title || 'page').replace(/[^a-z0-9]/gi, '_').slice(0, 60) || 'page'
    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${safe}.pdf"`,
      },
    })
  } catch (err: any) {
    console.log('[export-pdf] ERROR', err?.message, err?.stack)
    return NextResponse.json({ error: err?.message || 'PDF generation failed' }, { status: 500 })
  } finally {
    await browser?.close()
  }
}

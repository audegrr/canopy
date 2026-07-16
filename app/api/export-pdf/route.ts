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

// @sparticuz/chromium-min doesn't bundle the ~65MB Chromium binary — it
// downloads and caches this pack to /tmp on cold start instead. This avoids
// Next.js's file-tracing missing the binary (it isn't a local file at build
// time) and keeps the deployed function well under Vercel's size limits.
const CHROMIUM_PACK_URL = 'https://github.com/Sparticuz/chromium/releases/download/v149.0.0/chromium-v149.0.0-pack.x64.tar'

async function launchBrowser() {
  const puppeteer = await import('puppeteer-core')
  if (process.env.VERCEL) {
    const chromium = (await import('@sparticuz/chromium-min')).default
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(CHROMIUM_PACK_URL),
      headless: true,
    })
  }
  const executablePath = LOCAL_CHROME_CANDIDATES.find(p => fs.existsSync(p))
  if (!executablePath) throw new Error('No local Chrome install found for PDF export')
  return puppeteer.launch({ executablePath, headless: true })
}

export async function POST(req: NextRequest) {
  const { html, css, title } = await req.json()
  if (!html) return NextResponse.json({ error: 'Nothing to export' }, { status: 400 })

  let browser
  try {
    browser = await launchBrowser()
    const page = await browser.newPage()
    const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <style>* { box-sizing: border-box; margin: 0; padding: 0; }</style>
      <style>${css || ''}</style>
    </head><body class="printing-page">${html}</body></html>`
    await page.setContent(fullHtml, { waitUntil: 'load' })
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '22mm', bottom: '22mm', left: '20mm', right: '20mm' },
    })
    const safe = (title || 'page').replace(/[^a-z0-9]/gi, '_').slice(0, 60) || 'page'
    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${safe}.pdf"`,
      },
    })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'PDF generation failed' }, { status: 500 })
  } finally {
    await browser?.close()
  }
}

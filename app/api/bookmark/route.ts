import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, requireUser } from '@/lib/server/security'
import { readLimitedText, safeFetch } from '@/lib/server/safe-fetch'

export async function GET(req: NextRequest) {
  const { user } = await requireUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const limited = await rateLimit(`bookmark:${user.id}`, 60, 60 * 60 * 1000)
  if (limited) return limited
  const url = req.nextUrl.searchParams.get('url')
  if (!url) return NextResponse.json({ error: 'Missing url' }, { status: 400 })

  try {
    const res = await safeFetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Canopy/1.0; +https://canopy.app)' },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) throw new Error('Fetch failed')
    const contentType = res.headers.get('content-type') || ''
    if (!contentType.includes('text/html')) throw new Error('Unsupported content type')
    const html = await readLimitedText(res, 1_000_000)

    function getMeta(name: string): string {
      const patterns = [
        new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i'),
        new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${name}["']`, 'i'),
      ]
      for (const re of patterns) {
        const m = html.match(re)
        if (m?.[1]) return m[1].trim()
      }
      return ''
    }

    const title = getMeta('og:title') || getMeta('twitter:title') ||
      html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || ''
    const description = getMeta('og:description') || getMeta('twitter:description') ||
      getMeta('description') || ''
    const image = getMeta('og:image') || getMeta('twitter:image') || ''

    const { hostname } = new URL(url)
    const favicon = `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`

    return NextResponse.json({ title, description, image, favicon, hostname })
  } catch {
    try {
      const parsed = new URL(url)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('Invalid URL')
      return NextResponse.json({ title: url, description: '', image: '', favicon: '', hostname: parsed.hostname })
    } catch {
      return NextResponse.json({ error: 'Invalid or inaccessible URL' }, { status: 400 })
    }
  }
}

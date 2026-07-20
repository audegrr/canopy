import 'server-only'

import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { Agent, fetch as undiciFetch } from 'undici'

function isPrivateAddress(address: string): boolean {
  if (address === '::1' || address === '::' || address.startsWith('fc') || address.startsWith('fd') || address.startsWith('fe8') || address.startsWith('fe9') || address.startsWith('fea') || address.startsWith('feb')) return true
  const normalized = address.startsWith('::ffff:') ? address.slice(7) : address
  if (!isIP(normalized)) return true
  const parts = normalized.split('.').map(Number)
  if (parts.length !== 4) return false
  const [a, b] = parts
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
}

// Resolves the hostname once and returns a validated public address. Returning
// the address (instead of just asserting and letting fetch() re-resolve later)
// matters: a hostname that resolves to a public IP here could resolve to an
// internal one a moment later (DNS rebinding). The caller must pin the
// connection to this exact address rather than re-resolving.
async function resolvePublicAddress(url: URL): Promise<string> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Unsupported protocol')
  if (url.username || url.password) throw new Error('Credentials are not allowed')
  const addresses = await lookup(url.hostname, { all: true, verbatim: true })
  if (!addresses.length || addresses.some(item => isPrivateAddress(item.address))) throw new Error('Private address blocked')
  return addresses[0].address
}

export async function safeFetch(urlString: string, init: RequestInit = {}, maxRedirects = 3): Promise<Response> {
  let url = new URL(urlString)
  for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
    const pinnedAddress = await resolvePublicAddress(url)
    const pinnedFamily = isIP(pinnedAddress) === 6 ? 6 : 4
    const agent = new Agent({
      connect: {
        lookup: (_hostname, _options, callback) => callback(null, [{ address: pinnedAddress, family: pinnedFamily }]),
      },
    })
    try {
      const undiciInit = { ...init, redirect: 'manual', dispatcher: agent } as Parameters<typeof undiciFetch>[1]
      const response = await undiciFetch(url, undiciInit) as unknown as Response
      if (![301, 302, 303, 307, 308].includes(response.status)) return response
      const location = response.headers.get('location')
      if (!location || redirects === maxRedirects) throw new Error('Too many redirects')
      url = new URL(location, url)
    } finally {
      await agent.close()
    }
  }
  throw new Error('Too many redirects')
}

export async function readLimitedText(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maxBytes) {
      await reader.cancel()
      throw new Error('Response too large')
    }
    chunks.push(value)
  }
  const merged = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength }
  return new TextDecoder().decode(merged)
}

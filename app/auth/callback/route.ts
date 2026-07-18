import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const requestedNext = searchParams.get('next') ?? '/app'
  const next = requestedNext.startsWith('/') && !requestedNext.startsWith('//') ? requestedNext : '/app'
  const redirectUrl = `${origin}${next}`

  if (!code) {
    return NextResponse.redirect(redirectUrl)
  }

  // Build the redirect response FIRST so we can attach session cookies to it.
  // Using next/headers cookies() in a Route Handler does NOT reliably attach
  // cookies to the outgoing redirect — they must be set on the Response object.
  const response = NextResponse.redirect(redirectUrl)

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  await supabase.auth.exchangeCodeForSession(code)
  return response
}

import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { type EmailOtpType } from '@supabase/supabase-js'
import { type NextRequest, NextResponse } from 'next/server'

const EMAIL_OTP_TYPES = new Set<EmailOtpType>([
  'email',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
])

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get('token_hash')
  const requestedType = request.nextUrl.searchParams.get('type')
  const requestedNext = request.nextUrl.searchParams.get('next') ?? '/app'
  const next = requestedNext.startsWith('/') && !requestedNext.startsWith('//') ? requestedNext : '/app'

  const successUrl = new URL(next, request.url)
  const response = NextResponse.redirect(successUrl)

  if (!tokenHash || !requestedType || !EMAIL_OTP_TYPES.has(requestedType as EmailOtpType)) {
    return NextResponse.redirect(new URL('/login?error=invalid_or_expired_link', request.url))
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    },
  )

  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: requestedType as EmailOtpType,
  })

  if (error) {
    console.error('[auth-confirm] failed to verify email link:', {
      name: error.name,
      message: error.message,
      code: error.code,
      status: error.status,
    })
    return NextResponse.redirect(new URL('/login?error=invalid_or_expired_link', request.url))
  }

  return response
}

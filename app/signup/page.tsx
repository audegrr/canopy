'use client'
import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import Image from 'next/image'

function SignupForm() {
  const searchParams = useSearchParams()
  const inviteToken = searchParams.get('invite') ?? ''
  const prefillEmail = searchParams.get('email') ?? ''

  const [email, setEmail] = useState(prefillEmail)
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const supabase = createClient()

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')

    const redirectTo = inviteToken
      ? `${location.origin}/auth/callback?next=${encodeURIComponent(`/invite/${inviteToken}`)}`
      : `${location.origin}/auth/callback`

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name }, emailRedirectTo: redirectTo },
    })

    if (error) { setError(error.message); setLoading(false) }
    else setDone(true)
  }

  async function handleGoogle() {
    const redirectTo = inviteToken
      ? `${location.origin}/auth/callback?next=${encodeURIComponent(`/invite/${inviteToken}`)}`
      : `${location.origin}/auth/callback`
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, queryParams: { prompt: 'select_account' } },
    })
  }

  if (done) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div style={{ textAlign: 'center' }}>
        <Image src="/canopy_favicon_no_bg.ico" alt="Canopy" width={56} height={56} style={{ objectFit: 'contain', marginBottom: '16px' }} />
        <h2 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '8px', color: 'var(--text)' }}>Check your email</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
          We sent a confirmation link to <strong>{email}</strong>
          {inviteToken && <><br />After confirming, you&apos;ll be added to the workspace.</>}
        </p>
        <Link href="/login" style={{ display: 'inline-block', marginTop: '20px', color: 'var(--accent)', fontSize: '14px' }}>Back to login</Link>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: '380px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <Image src="/canopy_favicon_no_bg.ico" alt="Canopy" width={48} height={48} priority style={{ objectFit: 'contain', marginBottom: '8px' }} />
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text)', marginBottom: '4px', fontFamily: 'var(--font-head)' }}>Canopy</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
            {inviteToken ? 'Create your account to accept the invitation' : 'Create your account'}
          </p>
        </div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '28px', boxShadow: '0 2px 8px rgba(0,0,0,.06)' }}>
          <button onClick={handleGoogle} style={googleBtn}>
            <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"/><path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z"/></svg>
            Continue with Google
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '18px 0' }}>
            <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
            <span style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>or</span>
            <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
          </div>
          <form onSubmit={handleSignup} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <label className="sr-only" htmlFor="signup-name">Full name</label>
            <input id="signup-name" name="name" autoComplete="name" value={name} onChange={e => setName(e.target.value)} required style={inputSt} placeholder="Full name" />
            <label className="sr-only" htmlFor="signup-email">Email</label>
            <input
              id="signup-email"
              name="email"
              autoComplete="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              style={inputSt}
              placeholder="Email"
              readOnly={!!prefillEmail}
            />
            <label className="sr-only" htmlFor="signup-password">Password</label>
            <input id="signup-password" name="password" autoComplete="new-password" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} style={inputSt} placeholder="Password (min. 8 characters)" />
            {error && <p role="alert" style={{ color: '#eb5757', fontSize: '13px' }}>{error}</p>}
            <button type="submit" disabled={loading} style={primaryBtn}>{loading ? 'Creating account…' : 'Create account'}</button>
          </form>
          <p style={{ textAlign: 'center', marginTop: '16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
            Already have an account? <Link href="/login" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  )
}

const inputSt: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '14px', color: 'var(--text)', outline: 'none', background: 'var(--surface)' }
const primaryBtn: React.CSSProperties = { background: 'var(--accent)', color: '#fff', border: 'none', padding: '10px', borderRadius: '6px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }
const googleBtn: React.CSSProperties = { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '9px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--surface)', fontSize: '14px', cursor: 'pointer', color: 'var(--text)' }

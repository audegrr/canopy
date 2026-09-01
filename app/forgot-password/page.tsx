'use client'
import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import Image from 'next/image'
import { friendlyAuthError } from '@/lib/friendly-auth-error'

function ForgotPasswordForm() {
  const searchParams = useSearchParams()
  const [email, setEmail] = useState(searchParams.get('email') ?? '')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent('/reset-password')}`,
    })
    if (error) { setError(friendlyAuthError(error.message)); setLoading(false); return }
    setDone(true)
  }

  if (done) return (
    <div style={{ textAlign: 'center' }}>
      <Image src="/canopy_favicon_no_bg.ico" alt="Canopy" width={56} height={56} style={{ objectFit: 'contain', marginBottom: '16px' }} />
      <h2 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '8px', color: 'var(--text)' }}>Check your email</h2>
      <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
        If an account exists for <strong>{email}</strong>, we sent a link to reset your password.
      </p>
      <Link href="/login" style={{ display: 'inline-block', marginTop: '20px', color: 'var(--accent)', fontSize: '14px' }}>Back to login</Link>
    </div>
  )

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '28px', boxShadow: '0 2px 8px rgba(0,0,0,.06)' }}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <label className="sr-only" htmlFor="forgot-email">Email</label>
        <input id="forgot-email" name="email" autoComplete="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required style={inputSt} placeholder="Email" autoFocus />
        {error && <p role="alert" style={{ color: '#eb5757', fontSize: '13px' }}>{error}</p>}
        <button type="submit" disabled={loading} style={primaryBtn}>{loading ? 'Sending…' : error ? 'Try again' : 'Send reset link'}</button>
      </form>
      <p style={{ textAlign: 'center', marginTop: '16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
        <Link href="/login" style={{ color: 'var(--accent)', textDecoration: 'underline', textUnderlineOffset: 2 }}>Back to login</Link>
      </p>
    </div>
  )
}

export default function ForgotPasswordPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: '380px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <Image src="/canopy_favicon_no_bg.ico" alt="Canopy" width={48} height={48} priority style={{ objectFit: 'contain', marginBottom: '8px' }} />
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text)', marginBottom: '4px', fontFamily: 'var(--font-head)' }}>Canopy</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Reset your password</p>
        </div>
        <Suspense>
          <ForgotPasswordForm />
        </Suspense>
      </div>
    </div>
  )
}

const inputSt: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '14px', color: 'var(--text)', outline: 'none', background: 'var(--surface)' }
const primaryBtn: React.CSSProperties = { background: 'var(--accent)', color: '#fff', border: 'none', padding: '10px', borderRadius: '6px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }

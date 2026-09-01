'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import Image from 'next/image'
import { Icon } from '@/components/Icons'
import { friendlyAuthError } from '@/lib/friendly-auth-error'

function ResetPasswordForm() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  // The recovery link exchanges its code for a session via /auth/callback
  // before landing here — until that resolves, we can't tell a valid
  // in-progress recovery apart from a stale/expired link.
  const [checkingSession, setCheckingSession] = useState(true)
  const [hasSession, setHasSession] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setHasSession(!!data.session)
      setCheckingSession(false)
    })
  }, [supabase])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    const { error } = await supabase.auth.updateUser({ password })
    if (error) { setError(friendlyAuthError(error.message)); setLoading(false); return }
    router.push('/app')
  }

  if (checkingSession) return null

  if (!hasSession) return (
    <div style={{ textAlign: 'center' }}>
      <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '16px' }}>
        This reset link is invalid or has expired.
      </p>
      <Link href="/forgot-password" style={{ color: 'var(--accent)', fontSize: '14px' }}>Request a new link</Link>
    </div>
  )

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '28px', boxShadow: '0 2px 8px rgba(0,0,0,.06)' }}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <label className="sr-only" htmlFor="new-password">New password</label>
        <div style={{ position: 'relative' }}>
          <input id="new-password" name="password" autoComplete="new-password" type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required minLength={8} style={{ ...inputSt, paddingRight: '38px' }} placeholder="New password (min. 8 characters)" autoFocus />
          <button type="button" onClick={() => setShowPassword(s => !s)} aria-label={showPassword ? 'Hide password' : 'Show password'}
            style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: '6px', display: 'flex', alignItems: 'center' }}>
            <Icon name={showPassword ? 'eye-off' : 'eye'} size={16} />
          </button>
        </div>
        {error && <p role="alert" style={{ color: '#eb5757', fontSize: '13px' }}>{error}</p>}
        <button type="submit" disabled={loading} style={primaryBtn}>{loading ? 'Saving…' : error ? 'Try again' : 'Set new password'}</button>
      </form>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: '380px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <Image src="/canopy_favicon_no_bg.ico" alt="Canopy" width={48} height={48} priority style={{ objectFit: 'contain', marginBottom: '8px' }} />
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text)', marginBottom: '4px', fontFamily: 'var(--font-head)' }}>Canopy</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Set a new password</p>
        </div>
        <Suspense>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  )
}

const inputSt: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '14px', color: 'var(--text)', outline: 'none', background: 'var(--surface)' }
const primaryBtn: React.CSSProperties = { background: 'var(--accent)', color: '#fff', border: 'none', padding: '10px', borderRadius: '6px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }

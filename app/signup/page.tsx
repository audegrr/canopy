'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: name }, emailRedirectTo: `${location.origin}/auth/callback` }
    })
    if (error) { setError(error.message); setLoading(false) }
    else setDone(true)
  }

  async function handleGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/auth/callback` }
    })
  }

  if (done) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ textAlign: 'center', maxWidth: '400px' }}>
        <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🌿</div>
        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.5rem', marginBottom: '12px' }}>Check your email</h2>
        <p style={{ color: 'var(--muted)', lineHeight: 1.6 }}>We sent a confirmation link to <strong>{email}</strong>. Click it to activate your Canopy account.</p>
        <Link href="/login" style={{ display: 'inline-block', marginTop: '24px', color: 'var(--accent)', textDecoration: 'underline', fontSize: '0.9rem' }}>Back to login</Link>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: '400px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '2rem', color: 'var(--accent)', marginBottom: '8px' }}>Canopy</h1>
          <p style={{ color: 'var(--muted)', fontSize: '0.95rem' }}>Create your account</p>
        </div>
        <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', padding: '32px', boxShadow: '0 2px 16px rgba(0,0,0,0.06)' }}>
          <button onClick={handleGoogle} style={googleBtnStyle}>
            <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"/><path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z"/></svg>
            Continue with Google
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '20px 0' }}>
            <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
            <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>or</span>
            <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
          </div>
          <form onSubmit={handleSignup} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={labelStyle}>Full name</label>
              <input value={name} onChange={e => setName(e.target.value)} required style={inputStyle} placeholder="Jane Smith" />
            </div>
            <div>
              <label style={labelStyle}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required style={inputStyle} placeholder="you@example.com" />
            </div>
            <div>
              <label style={labelStyle}>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} style={inputStyle} placeholder="Min. 8 characters" />
            </div>
            {error && <p style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>{error}</p>}
            <button type="submit" disabled={loading} style={primaryBtnStyle}>
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </form>
          <p style={{ textAlign: 'center', marginTop: '20px', fontSize: '0.875rem', color: 'var(--muted)' }}>
            Already have an account?{' '}
            <Link href="/login" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: '0.8rem', fontWeight: 500, color: 'var(--muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }
const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 14px', border: '1px solid var(--border)', borderRadius: '8px', fontFamily: 'var(--font-sans)', fontSize: '0.95rem', background: 'var(--bg)', color: 'var(--text)', outline: 'none' }
const primaryBtnStyle: React.CSSProperties = { background: 'var(--accent)', color: '#fff', border: 'none', padding: '11px', borderRadius: '8px', fontFamily: 'var(--font-sans)', fontSize: '0.95rem', fontWeight: 500, cursor: 'pointer', marginTop: '4px' }
const googleBtnStyle: React.CSSProperties = { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '10px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--surface)', fontFamily: 'var(--font-sans)', fontSize: '0.95rem', cursor: 'pointer', color: 'var(--text)' }

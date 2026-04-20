'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const supabase = createClient()

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    const { error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name }, emailRedirectTo: `${location.origin}/auth/callback` } })
    if (error) { setError(error.message); setLoading(false) }
    else setDone(true)
  }

  async function handleGoogle() {
    await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${location.origin}/auth/callback` } })
  }

  if (done) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🌿</div>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '8px', color: '#37352f' }}>Check your email</h2>
        <p style={{ color: '#787774', fontSize: '14px' }}>We sent a confirmation link to <strong>{email}</strong></p>
        <Link href="/login" style={{ display: 'inline-block', marginTop: '20px', color: '#2383e2', fontSize: '14px' }}>Back to login</Link>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: '380px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ fontSize: '36px', marginBottom: '8px' }}>🌿</div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#37352f', marginBottom: '4px' }}>Canopy</h1>
          <p style={{ color: '#787774', fontSize: '14px' }}>Create your account</p>
        </div>
        <div style={{ background: '#fff', border: '1px solid #e9e9e7', borderRadius: '8px', padding: '28px', boxShadow: '0 2px 8px rgba(0,0,0,.06)' }}>
          <button onClick={handleGoogle} style={googleBtn}>
            <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"/><path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z"/></svg>
            Continue with Google
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '18px 0' }}>
            <div style={{ flex: 1, height: '1px', background: '#e9e9e7' }} />
            <span style={{ color: '#acaba8', fontSize: '12px' }}>or</span>
            <div style={{ flex: 1, height: '1px', background: '#e9e9e7' }} />
          </div>
          <form onSubmit={handleSignup} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <input value={name} onChange={e => setName(e.target.value)} required style={inputSt} placeholder="Full name" />
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required style={inputSt} placeholder="Email" />
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} style={inputSt} placeholder="Password (min. 8 characters)" />
            {error && <p style={{ color: '#eb5757', fontSize: '13px' }}>{error}</p>}
            <button type="submit" disabled={loading} style={primaryBtn}>{loading ? 'Creating account…' : 'Create account'}</button>
          </form>
          <p style={{ textAlign: 'center', marginTop: '16px', fontSize: '13px', color: '#787774' }}>
            Already have an account? <Link href="/login" style={{ color: '#2383e2', textDecoration: 'none' }}>Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
const inputSt: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1px solid #e9e9e7', borderRadius: '6px', fontFamily: 'Inter, sans-serif', fontSize: '14px', color: '#37352f', outline: 'none' }
const primaryBtn: React.CSSProperties = { background: '#2383e2', color: '#fff', border: 'none', padding: '10px', borderRadius: '6px', fontFamily: 'Inter, sans-serif', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }
const googleBtn: React.CSSProperties = { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '9px', border: '1px solid #e9e9e7', borderRadius: '6px', background: '#fff', fontFamily: 'Inter, sans-serif', fontSize: '14px', cursor: 'pointer', color: '#37352f' }

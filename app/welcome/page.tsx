'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function WelcomePage() {
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Please enter your name.'); return }
    if (!password || password.length < 8) { setError('Please choose a password (min. 8 characters).'); return }
    setLoading(true); setError('')

    const { data: { user } } = await supabase.auth.getUser()

    const { error: authError } = await supabase.auth.updateUser({
      data: { full_name: name.trim() },
      password,
    })
    if (authError) { setError(authError.message); setLoading(false); return }

    // Sync name to profiles table so other workspace members see it.
    if (user) {
      await supabase.from('profiles').update({ full_name: name.trim() }).eq('id', user.id)
    }

    router.replace('/app')
  }

  async function handleGoogle() {
    if (!name.trim()) { setError('Please enter your name first.'); return }
    setLoading(true); setError('')

    const { data: { user } } = await supabase.auth.getUser()

    // Save the name before starting the OAuth flow (user may not return here).
    const { error: updateError } = await supabase.auth.updateUser({ data: { full_name: name.trim() } })
    if (updateError) { setError(updateError.message); setLoading(false); return }
    if (user) {
      await supabase.from('profiles').update({ full_name: name.trim() }).eq('id', user.id)
    }

    // Link Google identity to the existing invited account. After this the
    // account has provider != 'email', which marks it as a real account.
    const { error } = await supabase.auth.linkIdentity({
      provider: 'google',
      options: {
        redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent('/app')}`,
        queryParams: { prompt: 'select_account' },
      },
    })
    if (error) { setError(error.message); setLoading(false) }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: '380px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <img src="/canopy_favicon_no_bg.ico" alt="Canopy" style={{ width: 48, height: 48, objectFit: 'contain', marginBottom: '8px' }} />
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text)', marginBottom: '4px' }}>Welcome to Canopy!</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>You&apos;ve been added to a workspace. Set up your account to get started.</p>
        </div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '28px', boxShadow: '0 2px 8px rgba(0,0,0,.06)' }}>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text)', marginBottom: '6px' }}>Your name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              required
              style={inputSt}
              placeholder="Full name"
              autoFocus
            />
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text)', marginBottom: '6px' }}>Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                minLength={8}
                style={inputSt}
                placeholder="Choose a password (min. 8 characters)"
              />
            </div>
            {error && <p style={{ color: '#eb5757', fontSize: '13px', margin: 0 }}>{error}</p>}
            <button type="submit" disabled={loading} style={primaryBtn}>
              {loading ? 'Saving…' : 'Get started'}
            </button>
          </form>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '16px 0' }}>
            <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
            <span style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>or</span>
            <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
          </div>

          <button onClick={handleGoogle} disabled={loading} style={googleBtn}>
            <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"/><path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z"/></svg>
            Continue with Google
          </button>
        </div>
      </div>
    </div>
  )
}

const inputSt: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '14px', color: 'var(--text)', outline: 'none', background: 'var(--surface)', boxSizing: 'border-box' }
const primaryBtn: React.CSSProperties = { background: 'var(--accent)', color: '#fff', border: 'none', padding: '10px', borderRadius: '6px', fontSize: '14px', fontWeight: 500, cursor: 'pointer', width: '100%' }
const googleBtn: React.CSSProperties = { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '9px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--surface)', fontSize: '14px', cursor: 'pointer', color: 'var(--text)' }

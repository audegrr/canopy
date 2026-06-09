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
    setLoading(true); setError('')

    const updates: { data: { full_name: string }; password?: string } = {
      data: { full_name: name.trim() },
    }
    if (password) updates.password = password

    const { error } = await supabase.auth.updateUser(updates)
    if (error) { setError(error.message); setLoading(false); return }

    router.replace('/app')
  }

  return (
    <div style={{ minHeight: '100vh', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ width: '100%', maxWidth: '380px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <img src="/canopy_favicon_no_bg.ico" alt="Canopy" style={{ width: 48, height: 48, objectFit: 'contain', marginBottom: '8px' }} />
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#37352f', marginBottom: '4px' }}>Welcome to Canopy!</h1>
          <p style={{ color: '#787774', fontSize: '14px' }}>You've been added to a workspace. Set up your account to get started.</p>
        </div>
        <div style={{ background: '#fff', border: '1px solid #e9e9e7', borderRadius: '8px', padding: '28px', boxShadow: '0 2px 8px rgba(0,0,0,.06)' }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#37352f', marginBottom: '6px' }}>Your name</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                required
                style={inputSt}
                placeholder="Full name"
                autoFocus
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#37352f', marginBottom: '6px' }}>
                Password <span style={{ fontWeight: 400, color: '#787774' }}>(optional, to log in next time)</span>
              </label>
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
        </div>
      </div>
    </div>
  )
}

const inputSt: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1px solid #e9e9e7', borderRadius: '6px', fontFamily: 'Inter, sans-serif', fontSize: '14px', color: '#37352f', outline: 'none', boxSizing: 'border-box' }
const primaryBtn: React.CSSProperties = { background: '#2383e2', color: '#fff', border: 'none', padding: '10px', borderRadius: '6px', fontFamily: 'Inter, sans-serif', fontSize: '14px', fontWeight: 500, cursor: 'pointer', width: '100%' }

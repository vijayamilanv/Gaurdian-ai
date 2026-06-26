import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { api } from '../lib/api'

type Tab = 'login' | 'signup'

export default function Login() {
  const [tab, setTab] = useState<Tab>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuthStore()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const endpoint = tab === 'login' ? '/auth/login' : '/auth/signup'
      const body = tab === 'login' ? { email, password } : { name, email, password }
      const { data } = await api.post(endpoint, body)
      login(data.user, data.token)
      navigate(tab === 'signup' ? '/onboarding' : '/dashboard')
    } catch (err: any) {
      setError(err.response?.data?.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(ellipse at top, #1a1a3e 0%, #0f0f23 70%)',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      {/* Background orbs */}
      <div style={{
        position: 'fixed', top: '-20%', left: '-10%', width: '600px', height: '600px',
        borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'fixed', bottom: '-20%', right: '-10%', width: '500px', height: '500px',
        borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,0.1) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{
        width: '100%', maxWidth: '440px', padding: '0 1rem',
        position: 'relative', zIndex: 1,
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{
            width: 64, height: 64, borderRadius: '18px', margin: '0 auto 1rem',
            background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '2rem', fontWeight: 900, color: '#fff',
            boxShadow: '0 8px 32px rgba(99,102,241,0.4)',
          }}>G</div>
          <h1 style={{ color: '#e2e8f0', fontSize: '1.75rem', fontWeight: 800, margin: 0 }}>
            Guardian <span style={{ color: '#6366f1' }}>AI</span>
          </h1>
          <p style={{ color: '#64748b', marginTop: '0.4rem', fontSize: '0.9rem' }}>
            Personal Success Prediction Engine
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: 'rgba(26,26,62,0.8)',
          border: '1px solid rgba(99,102,241,0.2)',
          borderRadius: '20px',
          backdropFilter: 'blur(20px)',
          overflow: 'hidden',
          boxShadow: '0 25px 50px rgba(0,0,0,0.4)',
        }}>
          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid rgba(99,102,241,0.15)' }}>
            {(['login', 'signup'] as Tab[]).map((t) => (
              <button key={t} onClick={() => { setTab(t); setError('') }} style={{
                flex: 1, padding: '1rem', border: 'none', cursor: 'pointer',
                fontWeight: 600, fontSize: '0.9rem', transition: 'all 0.2s',
                background: tab === t ? 'rgba(99,102,241,0.1)' : 'transparent',
                color: tab === t ? '#818cf8' : '#64748b',
                borderBottom: tab === t ? '2px solid #6366f1' : '2px solid transparent',
              }}>
                {t === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ padding: '2rem' }}>
            {tab === 'signup' && (
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>Full Name</label>
                <input
                  type="text" value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe" required
                  style={{
                    width: '100%', padding: '0.75rem 1rem', borderRadius: '10px',
                    background: 'rgba(15,15,35,0.6)', border: '1px solid rgba(99,102,241,0.2)',
                    color: '#e2e8f0', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>
            )}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>Email</label>
              <input
                type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com" required
                style={{
                  width: '100%', padding: '0.75rem 1rem', borderRadius: '10px',
                  background: 'rgba(15,15,35,0.6)', border: '1px solid rgba(99,102,241,0.2)',
                  color: '#e2e8f0', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>Password</label>
              <input
                type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••" required minLength={6}
                style={{
                  width: '100%', padding: '0.75rem 1rem', borderRadius: '10px',
                  background: 'rgba(15,15,35,0.6)', border: '1px solid rgba(99,102,241,0.2)',
                  color: '#e2e8f0', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>

            {error && (
              <div style={{
                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: '8px', padding: '0.65rem 1rem', marginBottom: '1rem',
                color: '#f87171', fontSize: '0.85rem',
              }}>{error}</div>
            )}

            <button type="submit" disabled={loading} style={{
              width: '100%', padding: '0.85rem', borderRadius: '10px', border: 'none',
              background: loading ? 'rgba(99,102,241,0.5)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              color: '#fff', fontWeight: 700, fontSize: '0.95rem', cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: loading ? 'none' : '0 4px 20px rgba(99,102,241,0.4)',
              transition: 'all 0.2s',
            }}>
              {loading ? 'Please wait…' : tab === 'login' ? 'Sign In' : 'Create Account'}
            </button>

            {tab === 'login' && (
              <p style={{ textAlign: 'center', color: '#64748b', fontSize: '0.8rem', marginTop: '1rem' }}>
                Demo: <span style={{ color: '#818cf8' }}>demo@guardianai.dev</span> / <span style={{ color: '#818cf8' }}>demo1234</span>
              </p>
            )}
          </form>
        </div>
      </div>
    </div>
  )
}

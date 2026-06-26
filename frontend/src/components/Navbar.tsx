import { useState } from 'react'
import { useAuthStore } from '../store/authStore'
import { useNavigate, useLocation } from 'react-router-dom'

const NAV_LINKS = [
  { label: '🛡️ Guardian',    path: '/companion' },
  { label: '📊 Dashboard',   path: '/dashboard' },
  { label: '📅 Schedule',    path: '/schedule' },
  { label: '📋 Applications',path: '/applications' },
  { label: '📧 Inbox',       path: '/gmail' },
  { label: '📚 Exam Prep',   path: '/exam' },
  { label: '🏥 Health',      path: '/health' },
  { label: '📝 Notes',       path: '/notes' },
  { label: '📁 Files',       path: '/files' },
  { label: '🔍 Resume',      path: '/resume-review' },
  { label: '🎯 Interview',   path: '/mock-interview' },
  { label: '🔢 Prep',        path: '/prep' },
  { label: '👤 Profile',     path: '/onboarding' },
]

export default function Navbar() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)

  const handleLogout = () => { logout(); navigate('/login') }

  const initials = user?.name
    ? user.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : 'GA'

  return (
    <nav style={{
      background: 'rgba(15,15,35,0.95)',
      backdropFilter: 'blur(16px)',
      borderBottom: '1px solid rgba(99,102,241,0.18)',
      padding: '0 1.5rem',
      height: '60px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'sticky',
      top: 0,
      zIndex: 100,
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      {/* Logo */}
      <div
        onClick={() => navigate('/dashboard')}
        style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer' }}
      >
        <div style={{
          width: 32, height: 32, borderRadius: '9px',
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1rem', fontWeight: 900, color: '#fff',
        }}>G</div>
        <span style={{ fontWeight: 800, fontSize: '1rem', color: '#e2e8f0', letterSpacing: '-0.02em' }}>
          Guardian <span style={{ color: '#6366f1' }}>AI</span>
        </span>
      </div>

      {/* Center nav links */}
      <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
        {NAV_LINKS.map(({ label, path }) => {
          const active = pathname === path || (path !== '/dashboard' && pathname.startsWith(path))
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              style={{
                background: active ? 'rgba(99,102,241,0.15)' : 'none',
                border: active ? '1px solid rgba(99,102,241,0.3)' : '1px solid transparent',
                borderRadius: '8px',
                cursor: 'pointer',
                color: active ? '#818cf8' : '#64748b',
                fontSize: '0.8rem',
                fontWeight: active ? 700 : 500,
                padding: '0.35rem 0.75rem',
                transition: 'all 0.15s',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={(e) => { if (!active) { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.background = 'rgba(99,102,241,0.06)' } }}
              onMouseLeave={(e) => { if (!active) { e.currentTarget.style.color = '#64748b'; e.currentTarget.style.background = 'none' } }}
            >{label}</button>
          )
        })}
      </div>

      {/* Right — user + logout */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.75rem', fontWeight: 700, color: '#fff',
        }}>{initials}</div>
        <span style={{ color: '#94a3b8', fontSize: '0.82rem', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {user?.name}
        </span>
        <button
          onClick={handleLogout}
          style={{
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: '7px', padding: '0.3rem 0.7rem', cursor: 'pointer',
            color: '#f87171', fontSize: '0.78rem', fontWeight: 600, transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.15)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)' }}
        >Logout</button>
      </div>
    </nav>
  )
}

import { useState, useEffect, useCallback } from 'react'
import Navbar from '../components/Navbar'
import { api } from '../lib/api'

interface Email {
  id: string
  gmailMessageId: string
  sender: string | null
  subject: string | null
  snippet: string | null
  body: string | null
  label: string | null
  isImportant: boolean
  receivedAt: string | null
}

interface GmailStatus {
  connected: boolean
  email: string | null
  lastSyncedAt: string | null
}

const LABEL_META: Record<string, { color: string; bg: string; icon: string; text: string }> = {
  OA:     { color: '#fbbf24', bg: 'rgba(251,191,36,0.1)',  icon: '📝', text: 'Online Assessment' },
  OL:     { color: '#10b981', bg: 'rgba(16,185,129,0.1)',  icon: '🎉', text: 'Offer Letter' },
  REJECT: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   icon: '❌', text: 'Rejection' },
  INFO:   { color: '#60a5fa', bg: 'rgba(96,165,250,0.1)',  icon: 'ℹ️', text: 'Info / Invite' },
  GHOST:  { color: '#475569', bg: 'rgba(71,85,105,0.08)',  icon: '👻', text: 'Ghosted' },
}

function EmailCard({ email, selected, onSelect }: { email: Email; selected: boolean; onSelect: () => void }) {
  const meta = LABEL_META[email.label ?? 'INFO'] ?? LABEL_META.INFO
  const from = email.sender?.replace(/<.*>/, '').trim() ?? 'Unknown'
  const date = email.receivedAt ? new Date(email.receivedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''

  return (
    <div
      onClick={onSelect}
      style={{
        background: selected ? 'rgba(99,102,241,0.12)' : email.isImportant ? 'rgba(99,102,241,0.05)' : 'rgba(15,15,35,0.5)',
        border: `1px solid ${selected ? 'rgba(99,102,241,0.45)' : email.isImportant ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)'}`,
        borderRadius: 12, padding: '0.85rem 1rem', cursor: 'pointer',
        transition: 'all 0.15s', marginBottom: '0.4rem',
      }}
      onMouseEnter={e => { if (!selected) (e.currentTarget as HTMLElement).style.borderColor = 'rgba(99,102,241,0.25)' }}
      onMouseLeave={e => { if (!selected) (e.currentTarget as HTMLElement).style.borderColor = email.isImportant ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.2rem' }}>
            <span style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.color}30`, borderRadius: 5, padding: '0.1rem 0.45rem', fontSize: '0.68rem', fontWeight: 700, flexShrink: 0 }}>
              {meta.icon} {email.label}
            </span>
            {email.isImportant && <span style={{ color: '#f59e0b', fontSize: '0.72rem' }}>★</span>}
          </div>
          <div style={{ color: '#e2e8f0', fontWeight: 600, fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {email.subject ?? '(no subject)'}
          </div>
          <div style={{ color: '#475569', fontSize: '0.75rem', marginTop: '0.15rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {from}
          </div>
        </div>
        <div style={{ color: '#334155', fontSize: '0.72rem', flexShrink: 0, marginTop: 2 }}>{date}</div>
      </div>
      {email.snippet && (
        <div style={{ color: '#475569', fontSize: '0.78rem', marginTop: '0.4rem', lineHeight: 1.45, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' } as any}>
          {email.snippet}
        </div>
      )}
    </div>
  )
}

function EmailDetail({ email, onClose }: { email: Email; onClose: () => void }) {
  const meta = LABEL_META[email.label ?? 'INFO'] ?? LABEL_META.INFO
  return (
    <div style={{ background: 'rgba(15,15,35,0.8)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 14, padding: '1.25rem', height: '100%', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
        <div>
          <span style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.color}30`, borderRadius: 6, padding: '0.15rem 0.55rem', fontSize: '0.72rem', fontWeight: 700 }}>
            {meta.icon} {meta.text}
          </span>
          <h2 style={{ margin: '0.5rem 0 0.25rem', color: '#e2e8f0', fontSize: '1.05rem', fontWeight: 800 }}>{email.subject ?? '(no subject)'}</h2>
          <div style={{ color: '#475569', fontSize: '0.78rem' }}>From: {email.sender}</div>
          {email.receivedAt && (
            <div style={{ color: '#334155', fontSize: '0.73rem', marginTop: '0.1rem' }}>
              {new Date(email.receivedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
            </div>
          )}
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: '1.1rem' }}>✕</button>
      </div>
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '1rem', color: '#94a3b8', fontSize: '0.85rem', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
        {email.body || email.snippet || 'No body content available.'}
      </div>
    </div>
  )
}

export default function GmailInbox() {
  const [status, setStatus]     = useState<GmailStatus | null>(null)
  const [emails, setEmails]     = useState<Email[]>([])
  const [total, setTotal]       = useState(0)
  const [activeLabel, setActiveLabel] = useState<string | null>(null)
  const [selected, setSelected] = useState<Email | null>(null)
  const [syncing, setSyncing]   = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [loading, setLoading]   = useState(true)
  const [toast, setToast]       = useState('')

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3500) }

  const loadStatus = useCallback(async () => {
    try {
      const res: any = await api.get('/gmail/status')
      setStatus(res.data)
    } catch { setStatus({ connected: false, email: null, lastSyncedAt: null }) }
  }, [])

  const loadEmails = useCallback(async (label?: string | null) => {
    try {
      setLoading(true)
      const qs = label ? `?label=${label}&limit=50` : '?limit=50'
      const res: any = await api.get(`/gmail/inbox${qs}`)
      setEmails(res.data.emails)
      setTotal(res.data.total)
    } catch { showToast('Failed to load inbox') } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    loadStatus()
    // Handle OAuth callback redirect: /gmail?connected=1 or /gmail?error=...
    const params = new URLSearchParams(window.location.search)
    if (params.get('connected') === '1') {
      showToast('✅ Gmail connected!')
      window.history.replaceState({}, '', '/gmail')
      loadStatus()
    } else if (params.get('error')) {
      showToast(`❌ ${params.get('error')}`)
      window.history.replaceState({}, '', '/gmail')
    }
  }, [loadStatus])

  useEffect(() => {
    if (status?.connected) loadEmails(activeLabel)
  }, [status, activeLabel, loadEmails])

  const handleConnect = async () => {
    setConnecting(true)
    try {
      const res: any = await api.get('/gmail/auth-url')
      window.location.href = res.data.url
    } catch (e: any) {
      showToast(e?.response?.data?.message ?? 'Could not get auth URL. Ensure GOOGLE_CLIENT_ID is set in backend .env')
      setConnecting(false)
    }
  }

  const handleSync = async () => {
    setSyncing(true)
    try {
      const res: any = await api.post('/gmail/sync', {})
      showToast(`✅ Synced ${res.data.synced} new emails (${res.data.total} scanned)`)
      await loadEmails(activeLabel)
      await loadStatus()
    } catch { showToast('❌ Sync failed') } finally { setSyncing(false) }
  }

  const handleDisconnect = async () => {
    if (!confirm('Disconnect Gmail and remove all synced email data?')) return
    try {
      await api.delete('/gmail/disconnect')
      setEmails([]); setStatus({ connected: false, email: null, lastSyncedAt: null })
      showToast('Gmail disconnected.')
    } catch { showToast('Disconnect failed') }
  }

  const LABELS = [null, 'OA', 'OL', 'REJECT', 'INFO']
  const labelCounts = LABELS.map(l => ({
    label: l,
    count: l ? emails.filter(e => e.label === l).length : emails.length,
  }))

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#0f0f23 0%,#1a1a3e 50%,#0f0f23 100%)', fontFamily: 'Inter,system-ui,sans-serif' }}>
      <Navbar />
      {toast && (
        <div style={{ position: 'fixed', top: 80, right: 24, zIndex: 1000, background: 'rgba(30,30,60,0.95)', border: '1px solid rgba(99,102,241,0.4)', borderRadius: 10, padding: '0.75rem 1.25rem', color: '#e2e8f0', fontSize: '0.88rem', fontWeight: 500, backdropFilter: 'blur(12px)' }}>
          {toast}
        </div>
      )}

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '2rem 1.5rem' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 900, color: '#e2e8f0' }}>📧 Placement Inbox</h1>
            <p style={{ margin: '0.3rem 0 0', color: '#64748b', fontSize: '0.83rem' }}>
              Placement-related emails synced from Gmail — auto-classified
              {status?.lastSyncedAt && ` · Last sync: ${new Date(status.lastSyncedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {status?.connected ? (
              <>
                <button onClick={handleSync} disabled={syncing}
                  style={{ background: syncing ? 'rgba(99,102,241,0.25)' : 'linear-gradient(135deg,#6366f1,#8b5cf6)', border: 'none', borderRadius: 9, padding: '0.5rem 1rem', color: '#fff', fontWeight: 700, fontSize: '0.83rem', cursor: syncing ? 'wait' : 'pointer' }}>
                  {syncing ? '⏳ Syncing…' : '🔄 Sync Now'}
                </button>
                <button onClick={handleDisconnect}
                  style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 9, padding: '0.5rem 1rem', color: '#f87171', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}>
                  Disconnect
                </button>
              </>
            ) : (
              <button onClick={handleConnect} disabled={connecting}
                style={{ background: connecting ? 'rgba(99,102,241,0.25)' : 'linear-gradient(135deg,#6366f1,#8b5cf6)', border: 'none', borderRadius: 9, padding: '0.55rem 1.2rem', color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: connecting ? 'wait' : 'pointer' }}>
                {connecting ? 'Redirecting…' : '🔗 Connect Gmail'}
              </button>
            )}
          </div>
        </div>

        {!status?.connected ? (
          /* Not connected */
          <div style={{ border: '1px dashed rgba(99,102,241,0.25)', borderRadius: 16, padding: '4rem 2rem', textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📬</div>
            <div style={{ color: '#94a3b8', fontWeight: 600, fontSize: '1rem', marginBottom: '0.5rem' }}>Gmail not connected</div>
            <div style={{ color: '#475569', fontSize: '0.83rem', marginBottom: '1.5rem', maxWidth: 420, margin: '0.5rem auto 1.5rem' }}>
              Connect your Gmail account to automatically sync placement-related emails — offer letters, OA invites, rejections, and interview schedules.
            </div>
            <div style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 10, padding: '0.75rem 1.25rem', display: 'inline-block', color: '#d97706', fontSize: '0.8rem', fontWeight: 600, marginBottom: '1.5rem' }}>
              ⚠️ Requires <code>GOOGLE_CLIENT_ID</code> + <code>GOOGLE_CLIENT_SECRET</code> + <code>GMAIL_ENCRYPTION_KEY</code> in <code>backend/.env</code>
            </div>
            <br />
            <button onClick={handleConnect} disabled={connecting}
              style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', border: 'none', borderRadius: 11, padding: '0.7rem 1.75rem', color: '#fff', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer' }}>
              🔗 Connect My Gmail (read-only)
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 1fr' : '1fr', gap: '1rem' }}>
            {/* Left panel */}
            <div>
              {/* Gmail account badge */}
              <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 9, padding: '0.5rem 0.85rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', color: '#34d399' }}>
                <span>✅</span>
                <span style={{ color: '#64748b' }}>Connected:</span>
                <span style={{ fontWeight: 700 }}>{status.email}</span>
                <span style={{ color: '#475569', marginLeft: 'auto' }}>{total} emails</span>
              </div>

              {/* Label filter tabs */}
              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.85rem' }}>
                {labelCounts.map(({ label, count }) => {
                  const meta = label ? LABEL_META[label] : null
                  const isActive = activeLabel === label
                  return (
                    <button key={label ?? 'all'} onClick={() => { setActiveLabel(label); setSelected(null) }}
                      style={{ background: isActive ? (meta?.bg ?? 'rgba(99,102,241,0.15)') : 'rgba(15,15,35,0.5)', border: `1px solid ${isActive ? (meta?.color ?? '#6366f1') + '60' : 'rgba(255,255,255,0.06)'}`, borderRadius: 7, padding: '0.3rem 0.7rem', color: isActive ? (meta?.color ?? '#818cf8') : '#475569', fontWeight: 600, fontSize: '0.73rem', cursor: 'pointer' }}>
                      {meta ? `${meta.icon} ${label}` : '📥 All'} <span style={{ opacity: 0.6 }}>({count})</span>
                    </button>
                  )
                })}
              </div>

              {/* Email list */}
              {loading ? (
                <div style={{ color: '#475569', textAlign: 'center', padding: '3rem' }}>Loading…</div>
              ) : emails.length === 0 ? (
                <div style={{ color: '#334155', textAlign: 'center', padding: '3rem', fontSize: '0.88rem' }}>
                  No emails yet. Click <strong style={{ color: '#6366f1' }}>Sync Now</strong> to import.
                </div>
              ) : (
                <div style={{ maxHeight: '65vh', overflowY: 'auto', paddingRight: 4 }}>
                  {(activeLabel ? emails.filter(e => e.label === activeLabel) : emails).map(email => (
                    <EmailCard key={email.id} email={email} selected={selected?.id === email.id}
                      onSelect={() => setSelected(selected?.id === email.id ? null : email)} />
                  ))}
                </div>
              )}
            </div>

            {/* Right panel: email detail */}
            {selected && (
              <EmailDetail email={selected} onClose={() => setSelected(null)} />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

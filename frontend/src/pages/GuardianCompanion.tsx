import { useState, useEffect, useRef, useCallback } from 'react'
import Navbar from '../components/Navbar'
import { api } from '../lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Briefing {
  mood:          string
  headline:      string
  focus_today:   string
  schedule_note: string
  nudges:        string[]
  alerts:        string[]
  escalation:    'green' | 'yellow' | 'orange' | 'red'
  affirmation:   string
  _context?:     Record<string, any>
}
interface Nudge { type: string; severity: string; message: string }
interface ChatMsg { role: 'user' | 'assistant'; content: string }
interface Escalation { id: string; trigger: string; severity: string; message: string; supportLink: string | null; createdAt: string }
interface NotifSettings {
  scheduleNudges: boolean; placementNudges: boolean; examNudges: boolean
  healthNudges: boolean; accountabilitySummary: boolean; accountabilityEmail: string | null
}

// ─── Constants ─────────────────────────────────────────────────────────────────
const ESCALATION = {
  green:  { color: '#10b981', bg: 'rgba(16,185,129,0.1)',  border: 'rgba(16,185,129,0.25)', label: '✅ On Track' },
  yellow: { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.25)', label: '⚠️ Mild Concern' },
  orange: { color: '#f97316', bg: 'rgba(249,115,22,0.1)',  border: 'rgba(249,115,22,0.25)', label: '🔶 Needs Attention' },
  red:    { color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.3)',   label: '🚨 Critical' },
}
const MOOD_EMOJI: Record<string, string> = {
  proud: '🌟', concerned: '😟', alert: '⚡', encouraging: '💪', critical: '🚨',
}
const SEVERITY_DOT: Record<string, string> = {
  green: '#10b981', yellow: '#f59e0b', orange: '#f97316', red: '#ef4444',
}

// ─── Components ───────────────────────────────────────────────────────────────
function EscalationBanner({ level }: { level: keyof typeof ESCALATION }) {
  const e = ESCALATION[level] ?? ESCALATION.yellow
  return (
    <div style={{ background: e.bg, border: `1px solid ${e.border}`, borderRadius: 11, padding: '0.5rem 1rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', fontWeight: 700, color: e.color }}>
      {e.label}
    </div>
  )
}

function NudgeCard({ nudge }: { nudge: Nudge }) {
  const color = SEVERITY_DOT[nudge.severity] ?? '#64748b'
  return (
    <div style={{ background: 'rgba(15,15,35,0.6)', border: `1px solid ${color}25`, borderLeft: `3px solid ${color}`, borderRadius: '0 9px 9px 0', padding: '0.65rem 0.85rem', display: 'flex', gap: '0.55rem', alignItems: 'flex-start' }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0, marginTop: 4 }} />
      <span style={{ color: '#cbd5e1', fontSize: '0.83rem', lineHeight: 1.5 }}>{nudge.message}</span>
    </div>
  )
}

function ChatBubble({ msg }: { msg: ChatMsg }) {
  const isUser = msg.role === 'user'
  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', marginBottom: '0.65rem' }}>
      {!isUser && (
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', flexShrink: 0, marginRight: '0.55rem', marginTop: 2 }}>
          🛡️
        </div>
      )}
      <div style={{
        maxWidth: '78%',
        background: isUser ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : 'rgba(30,30,60,0.8)',
        border: isUser ? 'none' : '1px solid rgba(99,102,241,0.15)',
        borderRadius: isUser ? '14px 14px 4px 14px' : '4px 14px 14px 14px',
        padding: '0.65rem 0.9rem',
        color: '#e2e8f0', fontSize: '0.85rem', lineHeight: 1.6,
        whiteSpace: 'pre-wrap',
      }}>
        {msg.content}
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function GuardianCompanion() {
  const [briefing, setBriefing]     = useState<Briefing | null>(null)
  const [nudges, setNudges]         = useState<Nudge[]>([])
  const [escalation, setEscalation] = useState<keyof typeof ESCALATION>('yellow')
  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [escalations, setEscalations] = useState<Escalation[]>([])
  const [notifSettings, setNotifSettings] = useState<NotifSettings | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [acctEmail, setAcctEmail] = useState('')

  // Chat
  const [chatHistory, setChatHistory] = useState<ChatMsg[]>([])
  const [input, setInput]             = useState('')
  const [sending, setSending]         = useState(false)
  const chatEndRef                    = useRef<HTMLDivElement>(null)

  const [toast, setToast] = useState('')
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3500) }

  const loadStatus = useCallback(async () => {
    try {
      const res: any = await api.get('/companion/nudges')
      setNudges(res.data.nudges)
      setEscalation(res.data.escalation)
      // Load escalations
      const [escRes, notifRes]: any[] = await Promise.all([
        api.get('/guardian/escalations'),
        api.get('/guardian/notifications'),
      ])
      setEscalations(escRes.data.escalations)
      setNotifSettings(notifRes.data.settings)
      setAcctEmail(notifRes.data.settings.accountabilityEmail ?? '')
    } catch {}
  }, [])

  const loadBriefing = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    try {
      const res: any = await api.get('/companion/briefing')
      setBriefing(res.data)
      setEscalation(res.data.escalation)
      // Seed first guardian message in chat
      if (chatHistory.length === 0 && res.data.headline) {
        setChatHistory([{
          role: 'assistant',
          content: `${MOOD_EMOJI[res.data.mood] ?? '🛡️'} ${res.data.headline}\n\n${res.data.affirmation}\n\nFeel free to ask me anything — I know your full profile and I'm here to help.`,
        }])
      }
    } catch { showToast('Could not load briefing') } finally {
      setLoading(false); setRefreshing(false)
    }
  }, [chatHistory.length])

  useEffect(() => {
    loadStatus()
    loadBriefing()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatHistory])

  const sendMessage = async () => {
    const msg = input.trim()
    if (!msg || sending) return
    const newHistory: ChatMsg[] = [...chatHistory, { role: 'user', content: msg }]
    setChatHistory(newHistory)
    setInput('')
    setSending(true)
    try {
      const res: any = await api.post('/companion/chat', {
        message: msg,
        history: chatHistory.map(m => ({ role: m.role, content: m.content })),
      })
      setChatHistory([...newHistory, { role: 'assistant', content: res.data.reply }])
    } catch {
      setChatHistory([...newHistory, { role: 'assistant', content: "I'm having trouble connecting. Please try again." }])
    } finally { setSending(false) }
  }

  const ackEscalation = async (id: string) => {
    await api.post(`/guardian/escalations/${id}/ack`, {})
    setEscalations(prev => prev.filter(e => e.id !== id))
  }

  const saveNotifSettings = async () => {
    if (!notifSettings) return
    setSettingsSaving(true)
    try {
      const res: any = await api.put('/guardian/notifications', {
        ...notifSettings,
        accountabilityEmail: acctEmail.trim() || null,
      })
      setNotifSettings(res.data.settings)
      showToast('✅ Notification settings saved')
      setShowSettings(false)
    } catch { showToast('❌ Failed to save settings') } finally { setSettingsSaving(false) }
  }

  const esc = ESCALATION[escalation]
  const cardStyle: React.CSSProperties = {
    background: 'rgba(20,20,50,0.7)', border: '1px solid rgba(99,102,241,0.12)', borderRadius: 14, padding: '1.25rem',
  }

  // Toggle helper for notification settings
  const toggleNotif = (key: keyof NotifSettings) => {
    if (!notifSettings || typeof notifSettings[key] !== 'boolean') return
    setNotifSettings({ ...notifSettings, [key]: !notifSettings[key] })
  }

  // Quick prompt chips
  const QUICK_PROMPTS = [
    "What should I focus on this week?",
    "How is my placement preparation going?",
    "Am I falling behind on anything?",
    "Give me a motivational push.",
    "What's my biggest risk right now?",
  ]

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#0f0f23 0%,#1a1a3e 50%,#0f0f23 100%)', fontFamily: 'Inter,system-ui,sans-serif' }}>
      <Navbar />

      {toast && (
        <div style={{ position: 'fixed', top: 80, right: 24, zIndex: 1000, background: 'rgba(30,30,60,0.95)', border: '1px solid rgba(99,102,241,0.4)', borderRadius: 10, padding: '0.75rem 1.25rem', color: '#e2e8f0', fontSize: '0.88rem', backdropFilter: 'blur(12px)' }}>
          {toast}
        </div>
      )}

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '2rem 1.5rem' }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 900, color: '#e2e8f0' }}>
              🛡️ Guardian <span style={{ color: '#818cf8' }}>Companion</span>
            </h1>
            <p style={{ margin: '0.3rem 0 0', color: '#64748b', fontSize: '0.83rem' }}>
              Your personal AI guardian — watching everything, nudging you forward
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <EscalationBanner level={escalation} />
            <button onClick={() => setShowSettings(s => !s)}
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '0.4rem 0.85rem', color: '#64748b', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>
              ⚙️ Notifications
            </button>
            <button onClick={() => loadBriefing(true)} disabled={refreshing}
              style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 8, padding: '0.4rem 0.85rem', color: '#818cf8', fontSize: '0.78rem', fontWeight: 600, cursor: refreshing ? 'wait' : 'pointer' }}>
              {refreshing ? '⏳' : '🔄'} Refresh
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '1.25rem' }}>

          {/* Left: Briefing + Nudges */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            {/* Daily Briefing Card */}
            {loading ? (
              <div style={{ ...cardStyle, textAlign: 'center', padding: '3rem' }}>
                <div style={{ color: '#475569', fontSize: '0.9rem' }}>⏳ Loading your Guardian briefing…</div>
              </div>
            ) : briefing ? (
              <div style={{ ...cardStyle, borderColor: `${esc.border}` }}>
                {/* Mood + headline */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '1rem' }}>
                  <div style={{ fontSize: '2rem', flexShrink: 0, lineHeight: 1 }}>{MOOD_EMOJI[briefing.mood] ?? '🛡️'}</div>
                  <div>
                    <div style={{ color: '#e2e8f0', fontWeight: 900, fontSize: '1.08rem', lineHeight: 1.35 }}>{briefing.headline}</div>
                    <div style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '0.2rem', textTransform: 'capitalize' }}>{briefing.mood} · {escalation}</div>
                  </div>
                </div>

                {/* Alerts */}
                {briefing.alerts.length > 0 && (
                  <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 9, padding: '0.65rem 0.85rem', marginBottom: '0.85rem' }}>
                    {briefing.alerts.map((a, i) => (
                      <div key={i} style={{ color: '#fca5a5', fontSize: '0.8rem', display: 'flex', gap: '0.4rem', marginBottom: i < briefing.alerts.length - 1 ? '0.3rem' : 0 }}>
                        <span>🚨</span><span>{a}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Focus today */}
                <div style={{ background: `${esc.bg}`, border: `1px solid ${esc.border}`, borderRadius: 9, padding: '0.75rem 1rem', marginBottom: '0.85rem' }}>
                  <div style={{ color: esc.color, fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.3rem' }}>🎯 Your #1 Priority Today</div>
                  <div style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '0.92rem', lineHeight: 1.4 }}>{briefing.focus_today}</div>
                </div>

                {/* Two-column: schedule note + nudges */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem', marginBottom: '0.85rem' }}>
                  <div>
                    <div style={{ color: '#64748b', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.45rem' }}>📅 Schedule</div>
                    <div style={{ color: '#94a3b8', fontSize: '0.82rem', lineHeight: 1.55 }}>{briefing.schedule_note}</div>
                  </div>
                  <div>
                    <div style={{ color: '#64748b', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.45rem' }}>💡 Guardian Nudges</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                      {briefing.nudges.map((n, i) => (
                        <div key={i} style={{ color: '#cbd5e1', fontSize: '0.8rem', lineHeight: 1.4, display: 'flex', gap: '0.35rem' }}>
                          <span style={{ color: '#6366f1', flexShrink: 0 }}>→</span>{n}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Affirmation */}
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.75rem', color: '#64748b', fontSize: '0.8rem', fontStyle: 'italic', lineHeight: 1.5 }}>
                  "{briefing.affirmation}"
                </div>
              </div>
            ) : null}

            {/* Nudge cards */}
            {nudges.length > 0 && (
              <div style={cardStyle}>
                <div style={{ color: '#818cf8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.75rem' }}>📡 Live Signals</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                  {nudges.map((n, i) => <NudgeCard key={i} nudge={n} />)}
                </div>
              </div>
            )}

            {/* Guardian escalation alerts */}
            {escalations.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ color: '#f87171', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase' }}>🚨 Guardian Alerts</div>
                {escalations.map(e => (
                  <div key={e.id} style={{
                    background: e.severity === 'red' ? 'rgba(239,68,68,0.08)' : e.severity === 'orange' ? 'rgba(249,115,22,0.08)' : 'rgba(245,158,11,0.08)',
                    border: `1px solid ${e.severity === 'red' ? 'rgba(239,68,68,0.3)' : e.severity === 'orange' ? 'rgba(249,115,22,0.3)' : 'rgba(245,158,11,0.25)'}`,
                    borderRadius: 12, padding: '0.85rem 1rem',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: e.severity === 'red' ? '#fca5a5' : e.severity === 'orange' ? '#fdba74' : '#fde68a', fontSize: '0.82rem', lineHeight: 1.55 }}>
                          {e.severity === 'red' ? '🚨' : e.severity === 'orange' ? '🔶' : '⚠️'} {e.message}
                        </div>
                        {e.supportLink && (
                          <a href={e.supportLink} target="_blank" rel="noreferrer"
                            style={{ display: 'inline-block', marginTop: '0.4rem', color: '#818cf8', fontSize: '0.73rem', textDecoration: 'underline' }}>
                            💙 Access student support resources
                          </a>
                        )}
                      </div>
                      <button onClick={() => ackEscalation(e.id)}
                        style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 6, padding: '0.25rem 0.55rem', color: '#64748b', fontSize: '0.72rem', cursor: 'pointer', flexShrink: 0 }}>
                        ✓ Got it
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Context snapshot */}
            {briefing?._context && (
              <details style={{ ...cardStyle, padding: '0.85rem 1.25rem' }}>
                <summary style={{ color: '#334155', fontSize: '0.73rem', cursor: 'pointer', fontWeight: 600 }}>📊 View Context Snapshot</summary>
                <div style={{ marginTop: '0.75rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.5rem' }}>
                  {Object.entries(briefing._context).filter(([k]) => !['extra_context','student_name','health_flags','top_risks'].includes(k)).map(([k, v]) => (
                    <div key={k} style={{ background: 'rgba(15,15,35,0.5)', borderRadius: 7, padding: '0.4rem 0.65rem' }}>
                      <div style={{ color: '#334155', fontSize: '0.65rem', textTransform: 'uppercase' }}>{k.replace(/_/g, ' ')}</div>
                      <div style={{ color: '#94a3b8', fontWeight: 700, fontSize: '0.82rem' }}>
                        {v === null ? '—' : typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(1)) : String(v)}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>

          {/* Right: Chat */}
          <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 140px)', maxHeight: 720 }}>
            <div style={{ ...cardStyle, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {/* Chat header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.85rem', paddingBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}>🛡️</div>
                <div>
                  <div style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '0.9rem' }}>Guardian AI</div>
                  <div style={{ color: '#475569', fontSize: '0.68rem' }}>Your personal mentor • Context-aware</div>
                </div>
                <div style={{ marginLeft: 'auto', width: 8, height: 8, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px #10b981' }} />
              </div>

              {/* Messages */}
              <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4, paddingBottom: '0.5rem' }}>
                {chatHistory.map((msg, i) => <ChatBubble key={i} msg={msg} />)}
                {sending && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', padding: '0.4rem 0' }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem' }}>🛡️</div>
                    <div style={{ display: 'flex', gap: '0.3rem' }}>
                      {[0,1,2].map(i => (
                        <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#6366f1', animation: 'bounce 1s infinite', animationDelay: `${i*0.15}s` }} />
                      ))}
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Quick prompts */}
              <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginBottom: '0.6rem', borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: '0.6rem' }}>
                {QUICK_PROMPTS.map((p, i) => (
                  <button key={i} onClick={() => { setInput(p); }} disabled={sending}
                    style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 6, padding: '0.25rem 0.55rem', color: '#64748b', fontSize: '0.68rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    {p}
                  </button>
                ))}
              </div>

              {/* Input */}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                  placeholder="Ask your Guardian…"
                  disabled={sending}
                  style={{ flex: 1, padding: '0.6rem 0.85rem', background: 'rgba(15,15,35,0.8)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 10, color: '#e2e8f0', fontSize: '0.85rem', outline: 'none' }}
                />
                <button onClick={sendMessage} disabled={!input.trim() || sending}
                  style={{ background: input.trim() && !sending ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : 'rgba(99,102,241,0.2)', border: 'none', borderRadius: 10, padding: '0.6rem 1rem', color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: input.trim() && !sending ? 'pointer' : 'not-allowed' }}>
                  {sending ? '…' : '➤'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Notification Settings Modal ── */}
      {showSettings && notifSettings && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onClick={() => setShowSettings(false)}>
          <div style={{ background: '#1a1a3e', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 16, padding: '1.75rem', maxWidth: 480, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div style={{ color: '#e2e8f0', fontWeight: 800, fontSize: '1rem' }}>⚙️ Notification Settings</div>
              <button onClick={() => setShowSettings(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '1.1rem' }}>✕</button>
            </div>

            <div style={{ color: '#475569', fontSize: '0.75rem', marginBottom: '1rem', lineHeight: 1.5 }}>
              Choose which categories your Guardian monitors and nudges you about. All notifications are in-app only.
            </div>

            {([
              { key: 'scheduleNudges',   label: '📅 Schedule nudges',   desc: 'Morning briefing, missed-day alerts, recalibration' },
              { key: 'placementNudges',  label: '💼 Placement nudges',  desc: 'No-app streaks, OA deadlines, offer letter alerts' },
              { key: 'examNudges',       label: '📚 Exam prep nudges',  desc: 'Subjects with no tests, upcoming exam reminders' },
              { key: 'healthNudges',     label: '🏥 Health nudges',     desc: 'Opt-in only — linked to your Health module data' },
            ] as { key: keyof NotifSettings; label: string; desc: string }[]).map(item => (
              <div key={item.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.65rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div>
                  <div style={{ color: '#cbd5e1', fontSize: '0.84rem', fontWeight: 600 }}>{item.label}</div>
                  <div style={{ color: '#475569', fontSize: '0.71rem' }}>{item.desc}</div>
                </div>
                <div onClick={() => toggleNotif(item.key)}
                  style={{ width: 42, height: 24, borderRadius: 12, background: notifSettings[item.key] ? '#6366f1' : 'rgba(255,255,255,0.1)', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                  <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: notifSettings[item.key] ? 21 : 3, transition: 'left 0.2s' }} />
                </div>
              </div>
            ))}

            <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <div>
                  <div style={{ color: '#cbd5e1', fontSize: '0.84rem', fontWeight: 600 }}>📨 Weekly accountability summary</div>
                  <div style={{ color: '#475569', fontSize: '0.71rem' }}>Opt-in: sends a weekly summary to a contact email. No raw health data included.</div>
                </div>
                <div onClick={() => toggleNotif('accountabilitySummary')}
                  style={{ width: 42, height: 24, borderRadius: 12, background: notifSettings.accountabilitySummary ? '#6366f1' : 'rgba(255,255,255,0.1)', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                  <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: notifSettings.accountabilitySummary ? 21 : 3, transition: 'left 0.2s' }} />
                </div>
              </div>
              {notifSettings.accountabilitySummary && (
                <input value={acctEmail} onChange={e => setAcctEmail(e.target.value)}
                  placeholder="Accountability contact email…"
                  style={{ width: '100%', padding: '0.5rem 0.75rem', background: 'rgba(15,15,35,0.8)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 8, color: '#e2e8f0', fontSize: '0.83rem', outline: 'none', boxSizing: 'border-box', marginTop: '0.4rem' }} />
              )}
            </div>

            <button onClick={saveNotifSettings} disabled={settingsSaving}
              style={{ marginTop: '1.25rem', width: '100%', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', border: 'none', borderRadius: 10, padding: '0.65rem', color: '#fff', fontWeight: 700, fontSize: '0.9rem', cursor: settingsSaving ? 'wait' : 'pointer' }}>
              {settingsSaving ? '⏳ Saving…' : '💾 Save Settings'}
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
      `}</style>
    </div>
  )
}

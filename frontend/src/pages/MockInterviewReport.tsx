import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { api } from '../lib/api'

interface Report {
  id: string
  topic: string
  status: string
  overallScore: number | null
  weakAreas: string[] | null
  actionPlan: {
    daily?: string[]
    weekly?: string[]
    monthly?: string[]
  } | null
  startedAt: string
  completedAt: string | null
  transcriptLength: number
}

function ScoreRing({ score }: { score: number }) {
  const color = score >= 75 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444'
  const label = score >= 75 ? 'Strong' : score >= 50 ? 'Moderate' : 'Needs Work'
  const r = 52, c = 60
  const circ = 2 * Math.PI * r
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ position: 'relative', width: 128, height: 128, margin: '0 auto' }}>
        <svg width={128} height={128} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={c} cy={c} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={10} />
          <circle cx={c} cy={c} r={r} fill="none" stroke={color} strokeWidth={10}
            strokeDasharray={circ} strokeDashoffset={circ * (1 - score / 100)}
            strokeLinecap="round" style={{ transition: 'stroke-dashoffset 1s ease' }} />
        </svg>
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center' }}>
          <div style={{ fontSize: '1.75rem', fontWeight: 900, color }}>{score}</div>
          <div style={{ fontSize: '0.62rem', color: '#64748b', fontWeight: 700 }}>/ 100</div>
        </div>
      </div>
      <div style={{ marginTop: '0.5rem', background: `${color}18`, borderRadius: 7, padding: '0.2rem 0.7rem', display: 'inline-block', color, fontSize: '0.8rem', fontWeight: 700 }}>{label}</div>
    </div>
  )
}

function PlanList({ items, icon, color }: { items: string[]; icon: string; color: string }) {
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
      {items.map((item, i) => (
        <li key={i} style={{ display: 'flex', gap: '0.55rem', alignItems: 'flex-start', color: '#cbd5e1', fontSize: '0.85rem', lineHeight: 1.55 }}>
          <span style={{ color, flexShrink: 0, fontSize: '0.9rem', marginTop: 1 }}>{icon}</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

export default function MockInterviewReport() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState('')
  const [addedToSchedule, setAddedToSchedule] = useState(false)

  useEffect(() => {
    if (!sessionId) return
    api.get(`/agent/mock-interview/${sessionId}/report`)
      .then((r: any) => setReport(r.data))
      .catch(() => setError('Could not load report.'))
      .finally(() => setLoading(false))
  }, [sessionId])

  const handleAddToSchedule = async () => {
    try {
      await api.post('/schedule/regenerate', {})
      setAddedToSchedule(true)
    } catch { alert('Could not regenerate schedule.') }
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#0f0f23', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontFamily: 'Inter,system-ui,sans-serif' }}>
      <Navbar />
      <div style={{ textAlign: 'center', marginTop: 80 }}>⏳ Loading report…</div>
    </div>
  )

  if (error || !report) return (
    <div style={{ minHeight: '100vh', background: '#0f0f23', fontFamily: 'Inter,system-ui,sans-serif' }}>
      <Navbar />
      <div style={{ maxWidth: 700, margin: '4rem auto', textAlign: 'center', color: '#f87171' }}>{error || 'Report not found.'}</div>
    </div>
  )

  const score = report.overallScore ?? 0
  const weakAreas = report.weakAreas ?? []
  const plan = report.actionPlan ?? {}

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#0f0f23 0%,#1a1a3e 50%,#0f0f23 100%)', fontFamily: 'Inter,system-ui,sans-serif' }}>
      <Navbar />
      <div style={{ maxWidth: 820, margin: '0 auto', padding: '2rem 1.5rem' }}>

        {/* Header */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.4rem' }}>
            <button onClick={() => navigate('/mock-interview')}
              style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: '0.82rem' }}>
              ← Back
            </button>
            <span style={{ color: '#334155', fontSize: '0.75rem' }}>Interview Report</span>
          </div>
          <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 900, color: '#e2e8f0' }}>
            📊 Interview Report
          </h1>
          <p style={{ margin: '0.3rem 0 0', color: '#64748b', fontSize: '0.85rem' }}>
            Topic: <strong style={{ color: '#94a3b8' }}>{report.topic}</strong>
            {' · '}{report.transcriptLength} Q/A pairs
            {report.completedAt && ' · ' + new Date(report.completedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>

        {/* Score + Weak Areas row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '1.5rem', background: 'rgba(20,20,50,0.7)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 16, padding: '1.5rem', marginBottom: '1rem', alignItems: 'center' }}>
          <ScoreRing score={score} />
          <div>
            <div style={{ color: '#818cf8', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>
              Areas to Improve
            </div>
            {weakAreas.length > 0 ? (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {weakAreas.map((area, i) => (
                  <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', color: '#cbd5e1', fontSize: '0.85rem', lineHeight: 1.5 }}>
                    <span style={{ color: '#f87171', flexShrink: 0 }}>⚠</span>
                    <span>{area}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ color: '#475569', fontSize: '0.85rem' }}>No specific weak areas identified.</p>
            )}
          </div>
        </div>

        {/* Action Plan */}
        {(plan.daily?.length || plan.weekly?.length || plan.monthly?.length) ? (
          <div style={{ background: 'rgba(20,20,50,0.6)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 14, padding: '1.25rem', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={{ color: '#34d399', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                🗓 Personalised Action Plan
              </div>
              <button onClick={handleAddToSchedule} disabled={addedToSchedule}
                style={{ background: addedToSchedule ? 'rgba(16,185,129,0.2)' : 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.35)', borderRadius: 7, padding: '0.3rem 0.8rem', color: '#34d399', fontSize: '0.78rem', fontWeight: 700, cursor: addedToSchedule ? 'default' : 'pointer' }}>
                {addedToSchedule ? '✅ Added to Schedule' : '📅 Push to My Schedule'}
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '1rem' }}>
              {plan.daily?.length ? (
                <div>
                  <div style={{ color: '#60a5fa', fontSize: '0.72rem', fontWeight: 700, marginBottom: '0.5rem', textTransform: 'uppercase' }}>Daily</div>
                  <PlanList items={plan.daily} icon="→" color="#60a5fa" />
                </div>
              ) : null}
              {plan.weekly?.length ? (
                <div>
                  <div style={{ color: '#a78bfa', fontSize: '0.72rem', fontWeight: 700, marginBottom: '0.5rem', textTransform: 'uppercase' }}>Weekly</div>
                  <PlanList items={plan.weekly} icon="→" color="#a78bfa" />
                </div>
              ) : null}
              {plan.monthly?.length ? (
                <div>
                  <div style={{ color: '#fbbf24', fontSize: '0.72rem', fontWeight: 700, marginBottom: '0.5rem', textTransform: 'uppercase' }}>Monthly</div>
                  <PlanList items={plan.monthly} icon="→" color="#fbbf24" />
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* Actions */}
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button onClick={() => navigate('/mock-interview')}
            style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', border: 'none', borderRadius: 10, padding: '0.65rem 1.5rem', color: '#fff', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' }}>
            🎯 Start Another Interview
          </button>
          <Link to="/schedule"
            style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 10, padding: '0.65rem 1.25rem', color: '#818cf8', fontWeight: 600, fontSize: '0.88rem', textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
            📅 View Today's Schedule
          </Link>
        </div>

      </div>
    </div>
  )
}

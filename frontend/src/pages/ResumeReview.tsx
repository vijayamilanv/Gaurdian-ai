import { useState } from 'react'
import Navbar from '../components/Navbar'
import { api } from '../lib/api'

interface ReviewResult {
  summary: string
  atsScore: number
  strengths: string[]
  improvements: string[]
  keywords: string[]
  rawMarkdown: string
}

const ROLES = [
  'Software Engineer', 'Frontend Developer', 'Backend Developer',
  'Full Stack Developer', 'Data Scientist', 'ML Engineer',
  'DevOps Engineer', 'Product Manager', 'Data Analyst',
  'UI/UX Designer', 'QA Engineer', 'Cloud Architect',
]

function ScoreRing({ score }: { score: number }) {
  const color = score >= 75 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444'
  const label = score >= 75 ? 'Strong' : score >= 50 ? 'Moderate' : 'Needs Work'
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ position: 'relative', width: 120, height: 120, margin: '0 auto' }}>
        <svg width={120} height={120} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={60} cy={60} r={50} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={10} />
          <circle
            cx={60} cy={60} r={50} fill="none"
            stroke={color} strokeWidth={10}
            strokeDasharray={`${2 * Math.PI * 50}`}
            strokeDashoffset={`${2 * Math.PI * 50 * (1 - score / 100)}`}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 1s ease' }}
          />
        </svg>
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '1.6rem', fontWeight: 900, color }}>{score}</div>
          <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 600 }}>ATS</div>
        </div>
      </div>
      <div style={{
        marginTop: '0.5rem', fontSize: '0.8rem', fontWeight: 700,
        color, background: `${color}18`, borderRadius: '6px',
        padding: '0.2rem 0.6rem', display: 'inline-block',
      }}>{label}</div>
    </div>
  )
}

function BulletList({ items, icon, color }: { items: string[]; icon: string; color: string }) {
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {items.map((item, i) => (
        <li key={i} style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', color: '#cbd5e1', fontSize: '0.875rem', lineHeight: 1.6 }}>
          <span style={{ fontSize: '1rem', flexShrink: 0, color }}>{icon}</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

export default function ResumeReview() {
  const [resumeText, setResumeText] = useState('')
  const [targetRole, setTargetRole] = useState('Software Engineer')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ReviewResult | null>(null)
  const [error, setError] = useState('')
  const [charCount, setCharCount] = useState(0)

  const handleReview = async () => {
    if (resumeText.trim().length < 50) {
      setError('Please paste at least 50 characters of your resume.')
      return
    }
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const res: any = await api.post('/agent/resume-review', {
        resumeText: resumeText.trim(),
        targetRole,
      })
      setResult(res.data)
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Resume review failed. Make sure the AI service is running.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f0f23 0%, #1a1a3e 50%, #0f0f23 100%)', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <Navbar />
      <div style={{ maxWidth: '860px', margin: '0 auto', padding: '2rem 1.5rem' }}>

        {/* Header */}
        <div style={{ marginBottom: '1.75rem' }}>
          <h1 style={{ margin: 0, fontSize: '1.7rem', fontWeight: 900, color: '#e2e8f0', letterSpacing: '-0.03em' }}>
            🔍 Resume Review
          </h1>
          <p style={{ margin: '0.35rem 0 0', color: '#64748b', fontSize: '0.875rem' }}>
            AI-powered ATS scoring, strengths, and improvement suggestions for your resume
          </p>
        </div>

        {/* Input section */}
        <div style={{ background: 'rgba(20,20,50,0.7)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '16px', padding: '1.5rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '200px' }}>
              <label style={{ color: '#94a3b8', fontSize: '0.78rem', display: 'block', marginBottom: '0.35rem', fontWeight: 600 }}>
                Target Role
              </label>
              <select
                value={targetRole}
                onChange={e => setTargetRole(e.target.value)}
                style={{ width: '100%', background: 'rgba(30,30,60,0.9)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '9px', padding: '0.55rem 0.85rem', color: '#e2e8f0', fontSize: '0.88rem' }}
              >
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <div style={{ color: '#475569', fontSize: '0.78rem', paddingBottom: '0.55rem' }}>
                {charCount.toLocaleString()} chars
              </div>
            </div>
          </div>

          <label style={{ color: '#94a3b8', fontSize: '0.78rem', display: 'block', marginBottom: '0.35rem', fontWeight: 600 }}>
            Paste Your Resume Text *
          </label>
          <textarea
            value={resumeText}
            onChange={e => { setResumeText(e.target.value); setCharCount(e.target.value.length) }}
            placeholder={`Paste your full resume here...\n\nTip: Copy from your PDF/Word doc. The AI will analyze skills, experience, education, and keywords vs your target role.`}
            rows={12}
            style={{
              width: '100%', background: 'rgba(15,15,35,0.8)', border: '1px solid rgba(99,102,241,0.2)',
              borderRadius: '10px', padding: '0.85rem 1rem', color: '#e2e8f0', fontSize: '0.855rem',
              lineHeight: 1.7, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit',
            }}
          />

          {error && (
            <div style={{ marginTop: '0.75rem', color: '#f87171', fontSize: '0.82rem', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', padding: '0.6rem 0.9rem' }}>
              ⚠️ {error}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <button
              onClick={handleReview}
              disabled={loading || resumeText.trim().length < 50}
              style={{
                background: loading ? 'rgba(99,102,241,0.4)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                border: 'none', borderRadius: '10px', padding: '0.65rem 1.75rem',
                color: '#fff', fontSize: '0.9rem', fontWeight: 700,
                cursor: loading ? 'wait' : resumeText.trim().length < 50 ? 'not-allowed' : 'pointer',
                opacity: resumeText.trim().length < 50 && !loading ? 0.5 : 1,
                transition: 'all 0.2s',
              }}
            >
              {loading ? '⏳ Analysing…' : '🔍 Analyse Resume'}
            </button>
          </div>
        </div>

        {/* Loading state */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem', animation: 'spin 2s linear infinite' }}>⚙️</div>
            <div style={{ fontWeight: 600, color: '#94a3b8' }}>Analysing your resume with AI…</div>
            <div style={{ fontSize: '0.82rem', marginTop: '0.35rem' }}>This takes 5–10 seconds</div>
          </div>
        )}

        {/* Results */}
        {result && !loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            {/* Score + Summary row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '1.25rem', background: 'rgba(20,20,50,0.7)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '16px', padding: '1.5rem', alignItems: 'center' }}>
              <ScoreRing score={result.atsScore} />
              <div>
                <div style={{ color: '#818cf8', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.4rem' }}>Overall Assessment</div>
                <p style={{ margin: 0, color: '#cbd5e1', fontSize: '0.92rem', lineHeight: 1.7 }}>{result.summary}</p>
              </div>
            </div>

            {/* Strengths + Improvements */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.18)', borderRadius: '14px', padding: '1.25rem' }}>
                <div style={{ color: '#34d399', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.9rem' }}>✅ Strengths</div>
                <BulletList items={result.strengths} icon="✓" color="#34d399" />
              </div>
              <div style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.18)', borderRadius: '14px', padding: '1.25rem' }}>
                <div style={{ color: '#fbbf24', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.9rem' }}>🔧 Improvements</div>
                <BulletList items={result.improvements} icon="→" color="#fbbf24" />
              </div>
            </div>

            {/* Keywords */}
            <div style={{ background: 'rgba(20,20,50,0.7)', border: '1px solid rgba(99,102,241,0.18)', borderRadius: '14px', padding: '1.25rem' }}>
              <div style={{ color: '#818cf8', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.75rem' }}>🔑 Key Terms</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                {result.keywords.map((kw, i) => (
                  <span key={i} style={{
                    background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)',
                    borderRadius: '6px', padding: '0.2rem 0.6rem',
                    color: '#a5b4fc', fontSize: '0.78rem', fontWeight: 500,
                  }}>{kw}</span>
                ))}
              </div>
            </div>

            {/* Full Markdown report */}
            <details style={{ background: 'rgba(15,15,35,0.5)', border: '1px solid rgba(99,102,241,0.12)', borderRadius: '12px', padding: '1rem' }}>
              <summary style={{ cursor: 'pointer', color: '#64748b', fontSize: '0.82rem', fontWeight: 600, userSelect: 'none' }}>
                📄 Full Detailed Report
              </summary>
              <pre style={{ marginTop: '0.75rem', color: '#94a3b8', fontSize: '0.8rem', lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit' }}>
                {result.rawMarkdown}
              </pre>
            </details>

            {/* Re-analyze */}
            <div style={{ textAlign: 'center' }}>
              <button onClick={() => setResult(null)}
                style={{ background: 'none', border: '1px solid rgba(99,102,241,0.25)', borderRadius: '8px', padding: '0.45rem 1rem', color: '#6366f1', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}>
                ↩ Analyse Another Resume
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

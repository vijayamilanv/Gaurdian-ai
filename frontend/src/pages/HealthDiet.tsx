import { useState, useEffect, useRef, useCallback } from 'react'
import Navbar from '../components/Navbar'
import { api } from '../lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Meal { breakfast: string; mid_morning: string; lunch: string; evening_snack: string; dinner: string }
interface DayPlan { day: number; meals: Meal; macros: { calories: number; protein_g: number; carbs_g: number; fat_g: number } }
interface DietPlan {
  planId: string; summaryText: string; tdee: number; goal: string
  weeklyTips: string[]; foodsToAvoid: string[]; days: DayPlan[]; generatedAt?: string
}
interface Report { id: string; label: string; uploadedAt: string }
interface Metrics {
  reportId: string; label: string; reportType: string; summary: string
  flags: string[]; dietaryNotes: string[]
  keyMetrics: Record<string, { value: any; unit: string; normal_range: string; status: 'normal'|'low'|'high'|'critical' }>
}

const STATUS_COLORS = { normal: '#10b981', low: '#f59e0b', high: '#f97316', critical: '#ef4444' }
const MEAL_LABELS: (keyof Meal)[] = ['breakfast', 'mid_morning', 'lunch', 'evening_snack', 'dinner']
const MEAL_ICONS: Record<string, string> = { breakfast: '🌅', mid_morning: '🍎', lunch: '🍱', evening_snack: '☕', dinner: '🌙' }
const DAY_NAMES = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

// ─── Sub-components ───────────────────────────────────────────────────────────
function MetricBadge({ name, m }: { name: string; m: { value: any; unit: string; normal_range: string; status: string } }) {
  const color = STATUS_COLORS[m.status as keyof typeof STATUS_COLORS] ?? '#64748b'
  return (
    <div style={{ background: `${color}10`, border: `1px solid ${color}30`, borderRadius: 10, padding: '0.65rem 0.85rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: '#94a3b8', fontSize: '0.74rem', fontWeight: 600 }}>{name}</span>
        <span style={{ background: `${color}20`, color, fontSize: '0.62rem', fontWeight: 700, borderRadius: 5, padding: '0.1rem 0.4rem', textTransform: 'uppercase' }}>{m.status}</span>
      </div>
      <div style={{ color: '#e2e8f0', fontWeight: 800, fontSize: '1rem', marginTop: '0.2rem' }}>
        {String(m.value)} <span style={{ color: '#64748b', fontSize: '0.72rem', fontWeight: 400 }}>{m.unit}</span>
      </div>
      <div style={{ color: '#334155', fontSize: '0.67rem', marginTop: '0.1rem' }}>Normal: {m.normal_range}</div>
    </div>
  )
}

function MacroBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div style={{ marginBottom: '0.3rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.15rem' }}>
        <span style={{ color: '#64748b', fontSize: '0.7rem' }}>{label}</span>
        <span style={{ color: '#94a3b8', fontSize: '0.7rem', fontWeight: 600 }}>{value}g</span>
      </div>
      <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 4 }}>
        <div style={{ height: '100%', width: `${Math.min((value / max) * 100, 100)}%`, background: color, borderRadius: 4, transition: 'width 0.6s ease' }} />
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function HealthDiet() {
  const [hasConsent, setHasConsent]       = useState<boolean | null>(null)
  const [consentText, setConsentText]     = useState('')
  const [reports, setReports]             = useState<Report[]>([])
  const [metrics, setMetrics]             = useState<Metrics | null>(null)
  const [dietPlan, setDietPlan]           = useState<DietPlan | null>(null)
  const [activeDay, setActiveDay]         = useState(1)
  const [toast, setToast]                 = useState('')

  // Report upload form
  const [reportText, setReportText]       = useState('')
  const [reportType, setReportType]       = useState<'blood_test'|'full_body_checkup'|'ecg'|'other'>('blood_test')
  const [reportLabel, setReportLabel]     = useState('')
  const [uploading, setUploading]         = useState(false)

  // Diet plan form
  const [weightKg, setWeightKg]           = useState('')
  const [heightCm, setHeightCm]           = useState('')
  const [age, setAge]                     = useState('')
  const [activityLevel, setActivityLevel] = useState<'sedentary'|'light'|'moderate'|'active'>('moderate')
  const [goal, setGoal]                   = useState<'balanced'|'weight_loss'|'muscle_gain'|'therapeutic'>('balanced')
  const [generating, setGenerating]       = useState(false)
  const [selectedReportId, setSelectedReportId] = useState<string>('')

  // Panel
  const [panel, setPanel] = useState<'report'|'metrics'|'diet'>('report')

  const fileRef = useRef<HTMLInputElement>(null)

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3500) }

  const loadStatus = useCallback(async () => {
    try {
      const res: any = await api.get('/health/consent')
      setHasConsent(res.data.hasConsent)
      setConsentText(res.data.consentText)
      if (res.data.hasConsent) {
        const [rRes, dRes]: any[] = await Promise.all([
          api.get('/health/reports'),
          api.get('/health/diet-plan'),
        ])
        setReports(rRes.data.reports)
        setDietPlan(dRes.data.plan)
      }
    } catch { setHasConsent(false) }
  }, [])

  useEffect(() => { loadStatus() }, [loadStatus])

  const grantConsent = async () => {
    await api.post('/health/consent', {})
    setHasConsent(true)
    await loadStatus()
    showToast('✅ Consent granted — you can now upload health data')
  }

  const revokeConsent = async () => {
    if (!confirm('Revoke consent? ALL health data will be permanently deleted.')) return
    await api.delete('/health/consent')
    setHasConsent(false)
    setReports([]); setMetrics(null); setDietPlan(null)
    showToast('Consent revoked. All health data deleted.')
  }

  const uploadReport = async () => {
    if (!reportText.trim()) { showToast('Paste your report text first'); return }
    setUploading(true)
    try {
      const res: any = await api.post('/health/reports', {
        reportText, reportType, label: reportLabel || undefined,
        weightKg: weightKg ? +weightKg : undefined,
        heightCm: heightCm ? +heightCm : undefined,
        age: age ? +age : undefined,
        activityLevel,
      })
      showToast('✅ Report uploaded & analyzed')
      setReportText(''); setReportLabel('')
      await loadStatus()
      // Auto-show metrics
      const mRes: any = await api.get(`/health/reports/${res.data.reportId}/metrics`)
      setMetrics(mRes.data)
      setPanel('metrics')
    } catch (e: any) {
      showToast(e?.response?.data?.message ?? '❌ Upload failed')
    } finally { setUploading(false) }
  }

  const loadMetrics = async (reportId: string) => {
    try {
      const res: any = await api.get(`/health/reports/${reportId}/metrics`)
      setMetrics(res.data)
      setPanel('metrics')
    } catch { showToast('Failed to load metrics') }
  }

  const generateDietPlan = async () => {
    setGenerating(true)
    try {
      const res: any = await api.post('/health/diet-plan', {
        reportId:      selectedReportId || undefined,
        weightKg:      weightKg ? +weightKg : undefined,
        heightCm:      heightCm ? +heightCm : undefined,
        age:           age ? +age : undefined,
        activityLevel,
        goal,
      })
      setDietPlan(res.data)
      setPanel('diet')
      setActiveDay(1)
      showToast('✅ 7-day diet plan generated!')
    } catch (e: any) {
      showToast(e?.response?.data?.message ?? '❌ Diet plan generation failed')
    } finally { setGenerating(false) }
  }

  const handleFilePaste = (e: React.ChangeEvent<HTMLTextAreaElement>) => setReportText(e.target.value)

  const cardStyle: React.CSSProperties = {
    background: 'rgba(20,20,50,0.7)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 14, padding: '1.25rem',
  }

  // ── Consent gate ───────────────────────────────────────────────────────────
  if (hasConsent === null) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#0f0f23,#1a1a3e,#0f0f23)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter,system-ui,sans-serif' }}>
        <Navbar />
        <div style={{ color: '#475569' }}>Loading…</div>
      </div>
    )
  }

  if (!hasConsent) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#0f0f23 0%,#1a1a3e 50%,#0f0f23 100%)', fontFamily: 'Inter,system-ui,sans-serif' }}>
        <Navbar />
        <div style={{ maxWidth: 600, margin: '4rem auto', padding: '0 1.5rem' }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>🏥</div>
            <h1 style={{ color: '#e2e8f0', fontSize: '1.6rem', fontWeight: 900, margin: '0 0 0.4rem' }}>Health & Diet Module</h1>
            <p style={{ color: '#64748b', fontSize: '0.85rem' }}>Informed consent required before accessing health features</p>
          </div>
          <div style={{ ...cardStyle, borderColor: 'rgba(251,191,36,0.2)', background: 'rgba(20,20,50,0.9)' }}>
            <div style={{ color: '#fbbf24', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.75rem' }}>⚖️ Informed Consent</div>
            <pre style={{ color: '#94a3b8', fontSize: '0.78rem', lineHeight: 1.75, whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0, marginBottom: '1.25rem' }}>{consentText}</pre>
            <button onClick={grantConsent}
              style={{ width: '100%', padding: '0.75rem', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer', boxShadow: '0 4px 20px rgba(99,102,241,0.4)' }}>
              ✅ I Understand & Agree
            </button>
            <p style={{ color: '#334155', fontSize: '0.72rem', textAlign: 'center', marginTop: '0.75rem', marginBottom: 0 }}>
              You can revoke consent and delete all data at any time from within this module.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ── Main UI ────────────────────────────────────────────────────────────────
  const activeDayPlan = dietPlan?.days?.find(d => d.day === activeDay)

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#0f0f23 0%,#1a1a3e 50%,#0f0f23 100%)', fontFamily: 'Inter,system-ui,sans-serif' }}>
      <Navbar />

      {toast && (
        <div style={{ position: 'fixed', top: 80, right: 24, zIndex: 1000, background: 'rgba(30,30,60,0.95)', border: '1px solid rgba(99,102,241,0.4)', borderRadius: 10, padding: '0.75rem 1.25rem', color: '#e2e8f0', fontSize: '0.88rem', backdropFilter: 'blur(12px)' }}>
          {toast}
        </div>
      )}

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '2rem 1.5rem' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 900, color: '#e2e8f0' }}>
              🏥 Health & <span style={{ color: '#10b981' }}>Diet</span>
            </h1>
            <p style={{ margin: '0.3rem 0 0', color: '#64748b', fontSize: '0.83rem' }}>
              Medical report analysis · Encrypted at rest · AI-generated diet plan
            </p>
          </div>
          <button onClick={revokeConsent}
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '0.4rem 0.85rem', color: '#f87171', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>
            🔒 Revoke Consent & Delete Data
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: '1.25rem' }}>
          {/* Sidebar */}
          <div>
            {/* Nav */}
            <div style={{ ...cardStyle, padding: '0.75rem', marginBottom: '0.75rem' }}>
              {[
                { id: 'report', icon: '📄', label: 'Upload Report' },
                { id: 'metrics', icon: '📊', label: 'Health Metrics' },
                { id: 'diet', icon: '🥗', label: 'Diet Plan' },
              ].map(item => (
                <button key={item.id} onClick={() => setPanel(item.id as any)}
                  style={{ width: '100%', textAlign: 'left', background: panel === item.id ? 'rgba(99,102,241,0.15)' : 'transparent', border: `1px solid ${panel === item.id ? 'rgba(99,102,241,0.35)' : 'transparent'}`, borderRadius: 8, padding: '0.55rem 0.75rem', color: panel === item.id ? '#818cf8' : '#475569', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                  <span>{item.icon}</span>{item.label}
                </button>
              ))}
            </div>

            {/* Past reports */}
            {reports.length > 0 && (
              <div style={cardStyle}>
                <div style={{ color: '#64748b', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.6rem' }}>Past Reports</div>
                {reports.map(r => (
                  <div key={r.id}
                    onClick={() => loadMetrics(r.id)}
                    style={{ background: 'rgba(15,15,35,0.5)', borderRadius: 8, padding: '0.55rem 0.7rem', marginBottom: '0.3rem', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.04)' }}>
                    <div style={{ color: '#94a3b8', fontSize: '0.78rem', fontWeight: 600 }}>{r.label}</div>
                    <div style={{ color: '#334155', fontSize: '0.68rem' }}>{new Date(r.uploadedAt).toLocaleDateString('en-IN')}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Main panel */}
          <div>
            {/* ── Upload Report ── */}
            {panel === 'report' && (
              <div style={cardStyle}>
                <div style={{ color: '#818cf8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '1rem' }}>📄 Upload Medical Report</div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginBottom: '0.85rem' }}>
                  <div>
                    <label style={{ color: '#64748b', fontSize: '0.73rem', fontWeight: 600 }}>Report Type</label>
                    <select value={reportType} onChange={e => setReportType(e.target.value as any)}
                      style={{ width: '100%', marginTop: '0.3rem', padding: '0.5rem 0.65rem', background: 'rgba(15,15,35,0.8)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 8, color: '#e2e8f0', fontSize: '0.83rem', outline: 'none' }}>
                      <option value="blood_test">Blood Test</option>
                      <option value="full_body_checkup">Full Body</option>
                      <option value="ecg">ECG</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={{ color: '#64748b', fontSize: '0.73rem', fontWeight: 600 }}>Label (optional)</label>
                    <input value={reportLabel} onChange={e => setReportLabel(e.target.value)} placeholder="e.g. Annual Checkup 2025"
                      style={{ width: '100%', marginTop: '0.3rem', padding: '0.5rem 0.65rem', background: 'rgba(15,15,35,0.8)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 8, color: '#e2e8f0', fontSize: '0.83rem', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                </div>

                {/* Optional measurements */}
                <div style={{ background: 'rgba(99,102,241,0.04)', border: '1px dashed rgba(99,102,241,0.15)', borderRadius: 9, padding: '0.75rem', marginBottom: '0.85rem' }}>
                  <div style={{ color: '#475569', fontSize: '0.7rem', fontWeight: 600, marginBottom: '0.5rem' }}>📏 Optional — for accurate TDEE & diet plan</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '0.5rem' }}>
                    {[
                      { label: 'Weight (kg)', val: weightKg, set: setWeightKg },
                      { label: 'Height (cm)', val: heightCm, set: setHeightCm },
                      { label: 'Age', val: age, set: setAge },
                    ].map(f => (
                      <div key={f.label}>
                        <label style={{ color: '#334155', fontSize: '0.68rem' }}>{f.label}</label>
                        <input type="number" value={f.val} onChange={e => f.set(e.target.value)} placeholder="—"
                          style={{ width: '100%', marginTop: '0.2rem', padding: '0.4rem 0.55rem', background: 'rgba(15,15,35,0.7)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 7, color: '#e2e8f0', fontSize: '0.82rem', outline: 'none', boxSizing: 'border-box' }} />
                      </div>
                    ))}
                    <div>
                      <label style={{ color: '#334155', fontSize: '0.68rem' }}>Activity</label>
                      <select value={activityLevel} onChange={e => setActivityLevel(e.target.value as any)}
                        style={{ width: '100%', marginTop: '0.2rem', padding: '0.4rem 0.55rem', background: 'rgba(15,15,35,0.7)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 7, color: '#e2e8f0', fontSize: '0.82rem', outline: 'none' }}>
                        <option value="sedentary">Sedentary</option>
                        <option value="light">Light</option>
                        <option value="moderate">Moderate</option>
                        <option value="active">Active</option>
                      </select>
                    </div>
                  </div>
                </div>

                <label style={{ color: '#64748b', fontSize: '0.73rem', fontWeight: 600 }}>Report Text (paste OCR'd text or type key values)</label>
                <textarea value={reportText} onChange={handleFilePaste} rows={10}
                  placeholder="Paste your medical report text here…&#10;&#10;Example:&#10;Haemoglobin: 11.2 g/dL (Normal: 13.0-17.0)&#10;Fasting Blood Sugar: 98 mg/dL (Normal: 70-100)&#10;Total Cholesterol: 210 mg/dL&#10;..."
                  style={{ width: '100%', marginTop: '0.4rem', padding: '0.75rem', background: 'rgba(15,15,35,0.8)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 10, color: '#e2e8f0', fontSize: '0.84rem', outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />

                <div style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)', borderRadius: 8, padding: '0.6rem 0.85rem', marginTop: '0.75rem', marginBottom: '1rem', color: '#34d399', fontSize: '0.74rem' }}>
                  🔒 Your report text is encrypted with AES-256-GCM before storage. Raw text is never stored in plaintext.
                </div>

                <button onClick={uploadReport} disabled={uploading || !reportText.trim()}
                  style={{ background: uploading || !reportText.trim() ? 'rgba(16,185,129,0.2)' : 'linear-gradient(135deg,#10b981,#059669)', border: 'none', borderRadius: 10, padding: '0.7rem 1.75rem', color: '#fff', fontWeight: 700, fontSize: '0.9rem', cursor: uploading || !reportText.trim() ? 'not-allowed' : 'pointer' }}>
                  {uploading ? '⏳ Analyzing…' : '🔬 Upload & Analyze Report'}
                </button>
              </div>
            )}

            {/* ── Health Metrics ── */}
            {panel === 'metrics' && (
              <div>
                {!metrics ? (
                  <div style={{ ...cardStyle, textAlign: 'center', padding: '4rem 2rem' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.6rem' }}>📊</div>
                    <div style={{ color: '#475569', fontSize: '0.85rem' }}>Upload a report to see your health metrics, or click a past report in the sidebar.</div>
                  </div>
                ) : (
                  <>
                    {/* Summary */}
                    <div style={{ ...cardStyle, marginBottom: '1rem', borderColor: 'rgba(16,185,129,0.2)' }}>
                      <div style={{ color: '#34d399', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.5rem' }}>📋 {metrics.label}</div>
                      <p style={{ margin: 0, color: '#cbd5e1', fontSize: '0.85rem', lineHeight: 1.65 }}>{metrics.summary}</p>
                    </div>

                    {/* Key metrics grid */}
                    {Object.keys(metrics.keyMetrics).length > 0 && (
                      <div style={{ ...cardStyle, marginBottom: '1rem' }}>
                        <div style={{ color: '#818cf8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.85rem' }}>Key Metrics</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.55rem' }}>
                          {Object.entries(metrics.keyMetrics).map(([name, m]) => (
                            <MetricBadge key={name} name={name} m={m} />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Flags */}
                    {metrics.flags.length > 0 && (
                      <div style={{ ...cardStyle, marginBottom: '1rem', borderColor: 'rgba(239,68,68,0.2)' }}>
                        <div style={{ color: '#f87171', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.6rem' }}>⚠️ Flags</div>
                        {metrics.flags.map((f, i) => (
                          <div key={i} style={{ color: '#fca5a5', fontSize: '0.82rem', padding: '0.3rem 0', borderBottom: i < metrics.flags.length-1 ? '1px solid rgba(239,68,68,0.08)' : 'none' }}>
                            • {f}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Dietary notes */}
                    {metrics.dietaryNotes.length > 0 && (
                      <div style={{ ...cardStyle, marginBottom: '1rem', borderColor: 'rgba(251,191,36,0.2)' }}>
                        <div style={{ color: '#fbbf24', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.6rem' }}>🥗 Dietary Implications</div>
                        {metrics.dietaryNotes.map((n, i) => (
                          <div key={i} style={{ color: '#fde68a', fontSize: '0.82rem', padding: '0.3rem 0', borderBottom: i < metrics.dietaryNotes.length-1 ? '1px solid rgba(251,191,36,0.08)' : 'none' }}>
                            • {n}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Generate diet plan CTA */}
                    <div style={{ ...cardStyle, background: 'rgba(99,102,241,0.06)' }}>
                      <div style={{ color: '#818cf8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.85rem' }}>🥗 Generate Diet Plan</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.85rem' }}>
                        <div>
                          <label style={{ color: '#64748b', fontSize: '0.73rem', fontWeight: 600 }}>Goal</label>
                          <select value={goal} onChange={e => setGoal(e.target.value as any)}
                            style={{ width: '100%', marginTop: '0.3rem', padding: '0.5rem 0.65rem', background: 'rgba(15,15,35,0.8)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 8, color: '#e2e8f0', fontSize: '0.83rem', outline: 'none' }}>
                            <option value="balanced">Balanced</option>
                            <option value="weight_loss">Weight Loss</option>
                            <option value="muscle_gain">Muscle Gain</option>
                            <option value="therapeutic">Therapeutic (from report)</option>
                          </select>
                        </div>
                        <div>
                          <label style={{ color: '#64748b', fontSize: '0.73rem', fontWeight: 600 }}>Source Report</label>
                          <select value={selectedReportId} onChange={e => setSelectedReportId(e.target.value)}
                            style={{ width: '100%', marginTop: '0.3rem', padding: '0.5rem 0.65rem', background: 'rgba(15,15,35,0.8)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 8, color: '#e2e8f0', fontSize: '0.83rem', outline: 'none' }}>
                            <option value="">Latest report</option>
                            {reports.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                          </select>
                        </div>
                      </div>
                      <button onClick={generateDietPlan} disabled={generating}
                        style={{ background: generating ? 'rgba(99,102,241,0.25)' : 'linear-gradient(135deg,#6366f1,#8b5cf6)', border: 'none', borderRadius: 10, padding: '0.65rem 1.5rem', color: '#fff', fontWeight: 700, fontSize: '0.88rem', cursor: generating ? 'wait' : 'pointer' }}>
                        {generating ? '⏳ Generating 7-day plan…' : '🥗 Generate My Diet Plan'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── Diet Plan ── */}
            {panel === 'diet' && (
              <div>
                {!dietPlan ? (
                  <div style={{ ...cardStyle, textAlign: 'center', padding: '4rem 2rem' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.6rem' }}>🥗</div>
                    <div style={{ color: '#475569', fontSize: '0.85rem', marginBottom: '1rem' }}>No diet plan yet. Upload a report and generate one.</div>
                    <button onClick={() => setPanel('metrics')}
                      style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', border: 'none', borderRadius: 9, padding: '0.6rem 1.4rem', color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>
                      Go to Health Metrics
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Plan header */}
                    <div style={{ ...cardStyle, marginBottom: '1rem', background: 'rgba(16,185,129,0.06)', borderColor: 'rgba(16,185,129,0.2)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <div>
                          <div style={{ color: '#34d399', fontWeight: 800, fontSize: '1rem' }}>{dietPlan.summaryText}</div>
                          <div style={{ color: '#475569', fontSize: '0.77rem', marginTop: '0.25rem' }}>{dietPlan.goal}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ color: '#10b981', fontWeight: 900, fontSize: '1.3rem' }}>{dietPlan.tdee.toLocaleString()}</div>
                          <div style={{ color: '#334155', fontSize: '0.68rem' }}>kcal / day</div>
                        </div>
                      </div>
                    </div>

                    {/* Foods to avoid */}
                    {dietPlan.foodsToAvoid.length > 0 && (
                      <div style={{ ...cardStyle, marginBottom: '1rem', borderColor: 'rgba(239,68,68,0.15)', background: 'rgba(239,68,68,0.04)' }}>
                        <div style={{ color: '#f87171', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.5rem' }}>🚫 Foods to Avoid</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                          {dietPlan.foodsToAvoid.map((f, i) => (
                            <span key={i} style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, padding: '0.2rem 0.6rem', color: '#fca5a5', fontSize: '0.75rem' }}>{f}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Day tabs */}
                    <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '0.85rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
                      {dietPlan.days.map(d => (
                        <button key={d.day} onClick={() => setActiveDay(d.day)}
                          style={{ flexShrink: 0, padding: '0.35rem 0.75rem', borderRadius: 7, border: `1px solid ${activeDay === d.day ? 'rgba(16,185,129,0.4)' : 'rgba(255,255,255,0.06)'}`, background: activeDay === d.day ? 'rgba(16,185,129,0.15)' : 'rgba(15,15,35,0.5)', color: activeDay === d.day ? '#34d399' : '#475569', fontWeight: 600, fontSize: '0.75rem', cursor: 'pointer' }}>
                          {DAY_NAMES[d.day]?.slice(0, 3)}
                        </button>
                      ))}
                    </div>

                    {/* Active day */}
                    {activeDayPlan && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '1rem' }}>
                        <div style={cardStyle}>
                          <div style={{ color: '#34d399', fontWeight: 800, fontSize: '0.88rem', marginBottom: '0.85rem' }}>{DAY_NAMES[activeDayPlan.day]}</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                            {MEAL_LABELS.map(meal => (
                              <div key={meal} style={{ background: 'rgba(15,15,35,0.5)', borderRadius: 9, padding: '0.65rem 0.8rem', border: '1px solid rgba(255,255,255,0.04)' }}>
                                <div style={{ color: '#64748b', fontSize: '0.7rem', fontWeight: 600, marginBottom: '0.2rem' }}>
                                  {MEAL_ICONS[meal]} {meal.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
                                </div>
                                <div style={{ color: '#cbd5e1', fontSize: '0.84rem', lineHeight: 1.5 }}>{activeDayPlan.meals[meal]}</div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Macros */}
                        <div style={{ ...cardStyle, minWidth: 180, alignSelf: 'start' }}>
                          <div style={{ color: '#818cf8', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.75rem' }}>Macros</div>
                          <div style={{ color: '#e2e8f0', fontWeight: 900, fontSize: '1.3rem', marginBottom: '0.1rem' }}>{activeDayPlan.macros.calories.toLocaleString()}</div>
                          <div style={{ color: '#334155', fontSize: '0.68rem', marginBottom: '0.9rem' }}>kcal</div>
                          <MacroBar label="Protein" value={activeDayPlan.macros.protein_g} max={200} color="#10b981" />
                          <MacroBar label="Carbs"   value={activeDayPlan.macros.carbs_g}   max={400} color="#6366f1" />
                          <MacroBar label="Fat"     value={activeDayPlan.macros.fat_g}     max={100} color="#f59e0b" />
                        </div>
                      </div>
                    )}

                    {/* Weekly tips */}
                    {dietPlan.weeklyTips.length > 0 && (
                      <div style={{ ...cardStyle, marginTop: '1rem', borderColor: 'rgba(99,102,241,0.15)' }}>
                        <div style={{ color: '#818cf8', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.6rem' }}>💡 Weekly Tips</div>
                        {dietPlan.weeklyTips.map((tip, i) => (
                          <div key={i} style={{ color: '#94a3b8', fontSize: '0.82rem', padding: '0.3rem 0', borderBottom: i < dietPlan.weeklyTips.length-1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                            {i + 1}. {tip}
                          </div>
                        ))}
                      </div>
                    )}

                    <button onClick={generateDietPlan} disabled={generating}
                      style={{ marginTop: '1rem', background: generating ? 'rgba(99,102,241,0.2)' : 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 9, padding: '0.55rem 1.25rem', color: '#818cf8', fontWeight: 600, fontSize: '0.82rem', cursor: generating ? 'wait' : 'pointer' }}>
                      {generating ? '⏳ Regenerating…' : '🔄 Regenerate Plan'}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

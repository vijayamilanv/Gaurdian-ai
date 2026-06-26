import { useState, useEffect, useRef } from 'react'
import Navbar from '../components/Navbar'
import { api } from '../lib/api'

interface Subject { id: string; name: string; semester: string | null; materials: number; tests: number }
interface Question { no: number; question: string; marks: number; model_answer: string; type: string }
interface PerQ     { no: number; awarded: number; feedback: string }

type Tab = 'subjects' | 'test' | 'results'

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: '#10b981', medium: '#f59e0b', hard: '#ef4444', mixed: '#818cf8',
}
const TYPE_ICONS: Record<string, string> = {
  theory: '📖', numerical: '🔢', diagram: '🖊', application: '⚙️',
}

// ── Score Ring ─────────────────────────────────────────────────────────────────
function ScoreRing({ pct, awarded, max }: { pct: number; awarded: number; max: number }) {
  const color = pct >= 75 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444'
  const label = pct >= 75 ? 'Pass' : pct >= 50 ? 'Marginal' : 'Fail'
  const r = 52, c = 64, circ = 2 * Math.PI * r
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ position: 'relative', width: 128, height: 128, margin: '0 auto' }}>
        <svg width={128} height={128} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={c} cy={c} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={10} />
          <circle cx={c} cy={c} r={r} fill="none" stroke={color} strokeWidth={10}
            strokeDasharray={circ} strokeDashoffset={circ * (1 - pct / 100)}
            strokeLinecap="round" style={{ transition: 'stroke-dashoffset 1s ease' }} />
        </svg>
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center' }}>
          <div style={{ fontSize: '1.6rem', fontWeight: 900, color }}>{pct}%</div>
          <div style={{ fontSize: '0.62rem', color: '#64748b' }}>{awarded}/{max}</div>
        </div>
      </div>
      <div style={{ marginTop: '0.4rem', background: `${color}18`, borderRadius: 7, padding: '0.2rem 0.75rem', display: 'inline-block', color, fontSize: '0.78rem', fontWeight: 700 }}>{label}</div>
    </div>
  )
}

export default function ExamPrep() {
  const [subjects, setSubjects]       = useState<Subject[]>([])
  const [activeSubject, setActiveSubject] = useState<Subject | null>(null)
  const [tab, setTab]                 = useState<Tab>('subjects')
  const [toast, setToast]             = useState('')

  // Subject creation
  const [newName, setNewName]         = useState('')
  const [newSem, setNewSem]           = useState('')

  // Test generation
  const [totalMarks, setTotalMarks]   = useState(50)
  const [numQ, setNumQ]               = useState(10)
  const [difficulty, setDifficulty]   = useState<'easy'|'medium'|'hard'|'mixed'>('mixed')
  const [generating, setGenerating]   = useState(false)
  const [activeTest, setActiveTest]   = useState<{ testId: string; questions: Question[]; totalMarks: number } | null>(null)

  // Submission
  const [answerMode, setAnswerMode]   = useState<'text' | 'image'>('text')
  const [answerText, setAnswerText]   = useState('')
  const [imageB64, setImageB64]       = useState('')
  const [submitting, setSubmitting]   = useState(false)
  const [result, setResult]           = useState<{
    submissionId: string; totalAwarded: number; maxMarks: number;
    percentage: number; overallFeedback: string; perQuestion: PerQ[];
  } | null>(null)

  const fileRef = useRef<HTMLInputElement>(null)

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3500) }

  const loadSubjects = async () => {
    try {
      const res: any = await api.get('/exam/subjects')
      setSubjects(res.data.subjects)
    } catch { showToast('Failed to load subjects') }
  }

  useEffect(() => { loadSubjects() }, [])

  const createSubject = async () => {
    if (!newName.trim()) return
    try {
      await api.post('/exam/subjects', { name: newName.trim(), semester: newSem.trim() || undefined })
      setNewName(''); setNewSem('')
      await loadSubjects()
      showToast('✅ Subject added')
    } catch { showToast('❌ Could not create subject') }
  }

  const deleteSubject = async (id: string) => {
    if (!confirm('Delete this subject and all its tests?')) return
    await api.delete(`/exam/subjects/${id}`)
    if (activeSubject?.id === id) { setActiveSubject(null); setTab('subjects') }
    await loadSubjects()
  }

  const generateTest = async () => {
    if (!activeSubject) return
    setGenerating(true); setActiveTest(null); setResult(null); setAnswerText('')
    try {
      const res: any = await api.post(`/exam/subjects/${activeSubject.id}/tests/generate`, {
        totalMarks, numQuestions: numQ, difficulty,
      })
      setActiveTest({ testId: res.data.testId, questions: res.data.questions, totalMarks: res.data.totalMarks })
      setTab('test')
      showToast(`✅ ${res.data.questions.length} questions generated`)
    } catch (e: any) {
      showToast(e?.response?.data?.message ?? '❌ Test generation failed')
    } finally { setGenerating(false) }
  }

  const handleImagePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const b64 = (reader.result as string).split(',')[1]
      setImageB64(b64)
    }
    reader.readAsDataURL(file)
  }

  const submitAnswers = async () => {
    if (!activeTest) return
    if (answerMode === 'text' && !answerText.trim()) { showToast('Write your answers first'); return }
    if (answerMode === 'image' && !imageB64) { showToast('Upload your answer sheet image'); return }
    setSubmitting(true)
    try {
      const res: any = await api.post(`/exam/tests/${activeTest.testId}/submit`, {
        answerText:     answerMode === 'text' ? answerText : undefined,
        answerImageB64: answerMode === 'image' ? imageB64 : undefined,
      })
      setResult(res.data)
      setTab('results')
      showToast('✅ Submission evaluated!')
    } catch (e: any) {
      showToast(e?.response?.data?.message ?? '❌ Submission failed')
    } finally { setSubmitting(false) }
  }

  const cardStyle: React.CSSProperties = {
    background: 'rgba(20,20,50,0.7)', border: '1px solid rgba(99,102,241,0.15)',
    borderRadius: 14, padding: '1.25rem',
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#0f0f23 0%,#1a1a3e 50%,#0f0f23 100%)', fontFamily: 'Inter,system-ui,sans-serif' }}>
      <Navbar />

      {toast && (
        <div style={{ position: 'fixed', top: 80, right: 24, zIndex: 1000, background: 'rgba(30,30,60,0.95)', border: '1px solid rgba(99,102,241,0.4)', borderRadius: 10, padding: '0.75rem 1.25rem', color: '#e2e8f0', fontSize: '0.88rem', backdropFilter: 'blur(12px)' }}>
          {toast}
        </div>
      )}

      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '2rem 1.5rem' }}>
        {/* Header */}
        <div style={{ marginBottom: '1.5rem' }}>
          <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 900, color: '#e2e8f0' }}>
            📚 Semester <span style={{ color: '#6366f1' }}>Exam Prep</span>
          </h1>
          <p style={{ margin: '0.35rem 0 0', color: '#64748b', fontSize: '0.83rem' }}>
            Upload notes & PYQs → AI generates model tests → submit answers → get graded like a professor
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: '1.25rem' }}>
          {/* Left sidebar: subjects */}
          <div>
            <div style={{ ...cardStyle, marginBottom: '0.75rem' }}>
              <div style={{ color: '#818cf8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.75rem' }}>Add Subject</div>
              <input value={newName} onChange={e => setNewName(e.target.value)}
                placeholder="Subject name…" onKeyDown={e => e.key === 'Enter' && createSubject()}
                style={{ width: '100%', padding: '0.55rem 0.75rem', background: 'rgba(15,15,35,0.7)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 8, color: '#e2e8f0', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box', marginBottom: '0.5rem' }} />
              <input value={newSem} onChange={e => setNewSem(e.target.value)}
                placeholder="Semester (optional)" onKeyDown={e => e.key === 'Enter' && createSubject()}
                style={{ width: '100%', padding: '0.55rem 0.75rem', background: 'rgba(15,15,35,0.7)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 8, color: '#e2e8f0', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box', marginBottom: '0.6rem' }} />
              <button onClick={createSubject} disabled={!newName.trim()}
                style={{ width: '100%', padding: '0.5rem', background: newName.trim() ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : 'rgba(99,102,241,0.15)', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: newName.trim() ? 'pointer' : 'not-allowed' }}>
                + Add Subject
              </button>
            </div>

            {/* Subject list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {subjects.map(sub => (
                <div key={sub.id}
                  onClick={() => { setActiveSubject(sub); setTab('subjects'); setActiveTest(null); setResult(null) }}
                  style={{ background: activeSubject?.id === sub.id ? 'rgba(99,102,241,0.15)' : 'rgba(15,15,35,0.5)', border: `1px solid ${activeSubject?.id === sub.id ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.04)'}`, borderRadius: 10, padding: '0.7rem 0.85rem', cursor: 'pointer', transition: 'all 0.15s' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '0.88rem' }}>{sub.name}</div>
                      {sub.semester && <div style={{ color: '#475569', fontSize: '0.72rem', marginTop: '0.1rem' }}>{sub.semester}</div>}
                    </div>
                    <button onClick={e => { e.stopPropagation(); deleteSubject(sub.id) }}
                      style={{ background: 'none', border: 'none', color: '#334155', cursor: 'pointer', fontSize: '0.8rem' }}>✕</button>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.45rem' }}>
                    <span style={{ color: '#475569', fontSize: '0.7rem' }}>📁 {sub.materials}</span>
                    <span style={{ color: '#475569', fontSize: '0.7rem' }}>📝 {sub.tests} tests</span>
                  </div>
                </div>
              ))}
              {subjects.length === 0 && (
                <div style={{ color: '#334155', fontSize: '0.8rem', textAlign: 'center', padding: '1.5rem 0' }}>No subjects yet</div>
              )}
            </div>
          </div>

          {/* Right: main content */}
          <div>
            {!activeSubject ? (
              <div style={{ ...cardStyle, textAlign: 'center', padding: '4rem 2rem' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📖</div>
                <div style={{ color: '#64748b', fontSize: '0.88rem' }}>Select or add a subject to get started</div>
              </div>
            ) : (
              <>
                {/* Tab bar */}
                <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '1rem' }}>
                  {(['subjects', 'test', 'results'] as Tab[]).map(t => {
                    const labels: Record<Tab, string> = { subjects: '⚙️ Generate', test: '📝 Answer', results: '📊 Results' }
                    const disabled = (t === 'test' && !activeTest) || (t === 'results' && !result)
                    return (
                      <button key={t} onClick={() => !disabled && setTab(t)} disabled={disabled}
                        style={{ background: tab === t ? 'rgba(99,102,241,0.2)' : 'rgba(15,15,35,0.5)', border: `1px solid ${tab === t ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.06)'}`, borderRadius: 8, padding: '0.4rem 0.9rem', color: tab === t ? '#818cf8' : disabled ? '#334155' : '#64748b', fontWeight: 600, fontSize: '0.8rem', cursor: disabled ? 'not-allowed' : 'pointer' }}>
                        {labels[t]}
                      </button>
                    )
                  })}
                  <div style={{ marginLeft: 'auto', color: '#475569', fontSize: '0.78rem', alignSelf: 'center' }}>
                    {activeSubject.name}
                  </div>
                </div>

                {/* ── Tab: Generate ── */}
                {tab === 'subjects' && (
                  <div style={cardStyle}>
                    <div style={{ color: '#818cf8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '1rem' }}>Configure Test</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                      <div>
                        <label style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 600 }}>Total Marks</label>
                        <input type="number" min={10} max={200} value={totalMarks} onChange={e => setTotalMarks(+e.target.value)}
                          style={{ width: '100%', marginTop: '0.3rem', padding: '0.55rem 0.75rem', background: 'rgba(15,15,35,0.7)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 8, color: '#e2e8f0', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }} />
                      </div>
                      <div>
                        <label style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 600 }}>No. of Questions</label>
                        <input type="number" min={3} max={30} value={numQ} onChange={e => setNumQ(+e.target.value)}
                          style={{ width: '100%', marginTop: '0.3rem', padding: '0.55rem 0.75rem', background: 'rgba(15,15,35,0.7)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 8, color: '#e2e8f0', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }} />
                      </div>
                    </div>
                    <div style={{ marginBottom: '1.25rem' }}>
                      <label style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 600 }}>Difficulty</label>
                      <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem' }}>
                        {(['easy','medium','hard','mixed'] as const).map(d => (
                          <button key={d} onClick={() => setDifficulty(d)}
                            style={{ padding: '0.35rem 0.9rem', borderRadius: 7, border: `1px solid ${difficulty === d ? DIFFICULTY_COLORS[d] + '60' : 'rgba(255,255,255,0.06)'}`, background: difficulty === d ? DIFFICULTY_COLORS[d] + '18' : 'rgba(15,15,35,0.5)', color: difficulty === d ? DIFFICULTY_COLORS[d] : '#475569', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}>
                            {d.charAt(0).toUpperCase() + d.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px dashed rgba(99,102,241,0.2)', borderRadius: 9, padding: '0.85rem', marginBottom: '1.25rem', color: '#475569', fontSize: '0.78rem' }}>
                      💡 <strong style={{ color: '#64748b' }}>Tip:</strong> Upload notes/PYQs under Files → link them to this subject for subject-specific questions. Without uploads, the AI generates general questions for <strong style={{ color: '#94a3b8' }}>{activeSubject.name}</strong>.
                    </div>

                    <button onClick={generateTest} disabled={generating}
                      style={{ background: generating ? 'rgba(99,102,241,0.25)' : 'linear-gradient(135deg,#6366f1,#8b5cf6)', border: 'none', borderRadius: 10, padding: '0.7rem 1.75rem', color: '#fff', fontWeight: 700, fontSize: '0.92rem', cursor: generating ? 'wait' : 'pointer', boxShadow: generating ? 'none' : '0 4px 20px rgba(99,102,241,0.4)' }}>
                      {generating ? '⏳ Generating…' : '🤖 Generate Model Test'}
                    </button>
                  </div>
                )}

                {/* ── Tab: Answer ── */}
                {tab === 'test' && activeTest && (
                  <div>
                    {/* Question paper */}
                    <div style={{ ...cardStyle, marginBottom: '1rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                        <div style={{ color: '#818cf8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase' }}>Question Paper — {activeTest.totalMarks} Marks</div>
                        <div style={{ color: '#475569', fontSize: '0.75rem' }}>{activeTest.questions.length} questions</div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {activeTest.questions.map(q => (
                          <div key={q.no} style={{ background: 'rgba(15,15,35,0.5)', borderRadius: 9, padding: '0.75rem 1rem', border: '1px solid rgba(255,255,255,0.04)' }}>
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                              <span style={{ color: '#6366f1', fontWeight: 800, fontSize: '0.85rem', flexShrink: 0 }}>Q{q.no}</span>
                              <span style={{ color: '#e2e8f0', fontSize: '0.85rem', flex: 1, lineHeight: 1.55 }}>{q.question}</span>
                              <span style={{ color: '#94a3b8', fontSize: '0.72rem', flexShrink: 0, fontWeight: 600 }}>[{q.marks}m]</span>
                            </div>
                            <div style={{ marginTop: '0.3rem', display: 'flex', gap: '0.4rem' }}>
                              <span style={{ color: '#334155', fontSize: '0.65rem' }}>{TYPE_ICONS[q.type] ?? '📄'} {q.type}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Answer section */}
                    <div style={cardStyle}>
                      <div style={{ color: '#34d399', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.75rem' }}>Your Answers</div>
                      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.75rem' }}>
                        {(['text', 'image'] as const).map(m => (
                          <button key={m} onClick={() => setAnswerMode(m)}
                            style={{ padding: '0.3rem 0.8rem', borderRadius: 7, border: `1px solid ${answerMode === m ? 'rgba(16,185,129,0.4)' : 'rgba(255,255,255,0.06)'}`, background: answerMode === m ? 'rgba(16,185,129,0.12)' : 'rgba(15,15,35,0.5)', color: answerMode === m ? '#34d399' : '#475569', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer' }}>
                            {m === 'text' ? '⌨️ Typed' : '📷 Handwritten'}
                          </button>
                        ))}
                      </div>

                      {answerMode === 'text' ? (
                        <textarea value={answerText} onChange={e => setAnswerText(e.target.value)}
                          placeholder={`Write answers for all ${activeTest.questions.length} questions here.\nFormat: Q1. [answer]\nQ2. [answer]\n...`}
                          rows={12}
                          style={{ width: '100%', padding: '0.75rem', background: 'rgba(15,15,35,0.7)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 9, color: '#e2e8f0', fontSize: '0.85rem', outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                      ) : (
                        <div>
                          <input type="file" ref={fileRef} accept="image/*" onChange={handleImagePick} style={{ display: 'none' }} />
                          <div onClick={() => fileRef.current?.click()}
                            style={{ border: '2px dashed rgba(99,102,241,0.25)', borderRadius: 10, padding: '2.5rem', textAlign: 'center', cursor: 'pointer', color: '#475569', fontSize: '0.85rem' }}>
                            {imageB64 ? '✅ Image selected — click to change' : '📷 Click to upload answer sheet image (JPG/PNG)'}
                          </div>
                          {imageB64 && (
                            <img src={`data:image/jpeg;base64,${imageB64}`} alt="preview"
                              style={{ marginTop: '0.75rem', maxHeight: 200, borderRadius: 8, border: '1px solid rgba(99,102,241,0.2)' }} />
                          )}
                        </div>
                      )}

                      <button onClick={submitAnswers} disabled={submitting}
                        style={{ marginTop: '0.85rem', background: submitting ? 'rgba(16,185,129,0.25)' : 'linear-gradient(135deg,#10b981,#059669)', border: 'none', borderRadius: 10, padding: '0.65rem 1.75rem', color: '#fff', fontWeight: 700, fontSize: '0.9rem', cursor: submitting ? 'wait' : 'pointer' }}>
                        {submitting ? '⏳ Evaluating…' : '📤 Submit & Get Graded'}
                      </button>
                    </div>
                  </div>
                )}

                {/* ── Tab: Results ── */}
                {tab === 'results' && result && (
                  <div>
                    {/* Score overview */}
                    <div style={{ ...cardStyle, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '1.5rem', alignItems: 'center', marginBottom: '1rem' }}>
                      <ScoreRing pct={result.percentage} awarded={result.totalAwarded} max={result.maxMarks} />
                      <div>
                        <div style={{ color: '#34d399', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.5rem' }}>Overall Feedback</div>
                        <p style={{ margin: 0, color: '#cbd5e1', fontSize: '0.88rem', lineHeight: 1.65 }}>{result.overallFeedback}</p>
                      </div>
                    </div>

                    {/* Per-question breakdown */}
                    <div style={cardStyle}>
                      <div style={{ color: '#818cf8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.85rem' }}>Question-wise Breakdown</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                        {result.perQuestion.map(pq => {
                          const q = activeTest?.questions.find(x => x.no === pq.no)
                          const maxM = q?.marks ?? 0
                          const pct2 = maxM > 0 ? Math.round((pq.awarded / maxM) * 100) : 0
                          const c2 = pct2 >= 75 ? '#10b981' : pct2 >= 50 ? '#f59e0b' : '#ef4444'
                          return (
                            <div key={pq.no} style={{ background: 'rgba(15,15,35,0.5)', borderRadius: 9, padding: '0.7rem 0.85rem', border: `1px solid ${c2}22` }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                                <span style={{ color: '#818cf8', fontWeight: 700, fontSize: '0.82rem' }}>Q{pq.no}</span>
                                <span style={{ color: c2, fontWeight: 800, fontSize: '0.85rem' }}>{pq.awarded}/{maxM}</span>
                              </div>
                              {q && <div style={{ color: '#64748b', fontSize: '0.77rem', marginBottom: '0.35rem', lineHeight: 1.4 }}>{q.question.slice(0, 80)}…</div>}
                              <div style={{ color: '#94a3b8', fontSize: '0.78rem', lineHeight: 1.5 }}>{pq.feedback}</div>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1rem' }}>
                      <button onClick={() => { setActiveTest(null); setResult(null); setAnswerText(''); setImageB64(''); setTab('subjects') }}
                        style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', border: 'none', borderRadius: 9, padding: '0.6rem 1.4rem', color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>
                        🔄 New Test
                      </button>
                    </div>

                    {/* AI Practice Grade Disclaimer */}
                    <div style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 10, padding: '0.75rem 1rem', marginTop: '0.85rem', display: 'flex', gap: '0.6rem', alignItems: 'flex-start' }}>
                      <span style={{ fontSize: '1rem', flexShrink: 0 }}>⚠️</span>
                      <div>
                        <div style={{ color: '#fbbf24', fontSize: '0.73rem', fontWeight: 700, marginBottom: '0.2rem' }}>AI PRACTICE GRADE — NOT OFFICIAL</div>
                        <div style={{ color: '#94a3b8', fontSize: '0.75rem', lineHeight: 1.6 }}>
                          This score is generated by an AI model for self-assessment purposes only. It does not reflect your actual university examination result and should not be used for academic records. For accurate evaluation, share your answers with your faculty or a qualified tutor.
                        </div>
                        <button
                          onClick={() => showToast('✅ Flagged for human review — share this result with your tutor or faculty for a verified grade.')}
                          style={{ marginTop: '0.5rem', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 6, padding: '0.25rem 0.75rem', color: '#fbbf24', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}>
                          🏳️ Flag for Human Review
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

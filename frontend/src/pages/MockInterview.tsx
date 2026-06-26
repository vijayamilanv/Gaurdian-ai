import { useState, useRef, useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { api } from '../lib/api'

interface Message { role: 'user' | 'assistant'; content: string }
interface QAEntry  { question: string; answer: string; feedback: string }

const TOPICS = [
  'Software Engineer', 'Full Stack Developer', 'Data Engineer',
  'ML Engineer', 'Frontend Developer', 'Backend Developer',
  'System Design', 'DSA & Algorithms', 'Behavioral (HR)',
]

export default function MockInterview() {
  const [topic, setTopic]       = useState('')
  const [started, setStarted]   = useState(false)
  const [history, setHistory]   = useState<Message[]>([])
  const [qaLog, setQaLog]       = useState<QAEntry[]>([]) // full Q/A pairs for session
  const [pendingQ, setPendingQ] = useState('')             // the last AI question awaiting answer
  const [input, setInput]       = useState('')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [completing, setCompleting] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const navigate  = useNavigate()

  const { mutate: sendMsg, isPending } = useMutation({
    mutationFn: (answer: string) =>
      api.post('/agent/mock-interview', {
        topic,
        previous_answer: answer || undefined,
        history: history.map(h => ({ role: h.role, content: h.content })),
      }).then(r => r.data),
    onSuccess: (data, answer) => {
      const aiResponse: string = data.response
      setHistory(h => [...h, { role: 'assistant', content: aiResponse }])

      // Record Q/A pair when user gave an answer
      if (answer && pendingQ) {
        const entry: QAEntry = { question: pendingQ, answer, feedback: aiResponse }
        setQaLog(log => [...log, entry])
        if (sessionId) {
          api.patch(`/agent/mock-interview/${sessionId}/transcript`, entry).catch(() => {})
        }
      }
      setPendingQ(aiResponse) // next AI message is the pending question
    },
  })

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [history, isPending])

  const handleStart = async () => {
    if (!topic) return
    try {
      const res: any = await api.post('/agent/mock-interview/session', { topic })
      setSessionId(res.data.sessionId)
    } catch { /* session creation failed — continue without persistence */ }
    setStarted(true)
    setHistory([])
    setQaLog([])
    setPendingQ('')
    sendMsg('')
  }

  const handleSend = () => {
    if (!input.trim() || isPending) return
    const msg = input.trim()
    setInput('')
    setHistory(h => [...h, { role: 'user', content: msg }])
    sendMsg(msg)
  }

  const handleFinish = async () => {
    if (!sessionId || qaLog.length === 0) return
    setCompleting(true)
    try {
      await api.post(`/agent/mock-interview/${sessionId}/complete`, {})
      navigate(`/mock-interview/${sessionId}/report`)
    } catch {
      alert('Could not complete session. Please try again.')
    } finally {
      setCompleting(false)
    }
  }

  const msgStyle = (role: string): React.CSSProperties => ({
    maxWidth: '80%',
    alignSelf: role === 'user' ? 'flex-end' : 'flex-start',
    background: role === 'user' ? 'rgba(99,102,241,0.2)' : 'rgba(26,26,62,0.9)',
    border: `1px solid ${role === 'user' ? 'rgba(99,102,241,0.4)' : 'rgba(99,102,241,0.15)'}`,
    borderRadius: role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
    padding: '0.85rem 1.1rem',
    color: '#e2e8f0', fontSize: '0.88rem', lineHeight: 1.6, whiteSpace: 'pre-wrap',
  })

  return (
    <div style={{ minHeight: '100vh', background: '#0f0f23', fontFamily: 'Inter, system-ui, sans-serif', display: 'flex', flexDirection: 'column' }}>
      <Navbar />
      <main style={{ flex: 1, maxWidth: '900px', width: '100%', margin: '0 auto', padding: '2rem 1.5rem', display: 'flex', flexDirection: 'column' }}>
        <h1 style={{ color: '#e2e8f0', fontSize: '1.6rem', fontWeight: 800, margin: '0 0 0.3rem' }}>
          Mock <span style={{ color: '#6366f1' }}>Interview</span>
        </h1>
        <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
          AI-powered placement interview practice — one question at a time
        </p>

        {!started ? (
          <div style={{ background: 'rgba(26,26,62,0.8)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '20px', padding: '2rem', backdropFilter: 'blur(12px)' }}>
            <p style={{ color: '#94a3b8', fontWeight: 600, marginBottom: '1rem' }}>Select your interview topic:</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.5rem' }}>
              {TOPICS.map(t => (
                <button key={t} onClick={() => setTopic(t)} style={{
                  padding: '0.5rem 1rem', borderRadius: '999px', cursor: 'pointer',
                  background: topic === t ? 'rgba(99,102,241,0.3)' : 'rgba(15,15,35,0.5)',
                  border: `1px solid ${topic === t ? 'rgba(99,102,241,0.6)' : 'rgba(99,102,241,0.15)'}`,
                  color: topic === t ? '#818cf8' : '#64748b', fontWeight: 600, fontSize: '0.85rem', transition: 'all 0.15s',
                }}>{t}</button>
              ))}
            </div>
            <input value={topic} onChange={e => setTopic(e.target.value)} placeholder="Or type a custom topic…"
              style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '10px', marginBottom: '1rem', background: 'rgba(15,15,35,0.7)', border: '1px solid rgba(99,102,241,0.2)', color: '#e2e8f0', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }} />
            <button onClick={handleStart} disabled={!topic} style={{
              padding: '0.75rem 2rem', borderRadius: '10px', border: 'none', cursor: topic ? 'pointer' : 'not-allowed',
              background: topic ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'rgba(99,102,241,0.2)',
              color: '#fff', fontWeight: 700, boxShadow: topic ? '0 4px 20px rgba(99,102,241,0.4)' : 'none',
            }}>🎯 Start Interview</button>
          </div>
        ) : (
          <>
            {/* Topic bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '10px', padding: '0.6rem 1rem' }}>
              <span style={{ color: '#818cf8', fontWeight: 600, fontSize: '0.85rem' }}>🎯 Topic: {topic}</span>
              <span style={{ color: '#334155', fontSize: '0.78rem' }}>• {qaLog.length} Q/A pairs</span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
                <button onClick={() => { setStarted(false); setHistory([]); setQaLog([]); setSessionId(null) }}
                  style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: '0.8rem' }}>
                  Change topic
                </button>
                {qaLog.length >= 3 && (
                  <button onClick={handleFinish} disabled={completing || isPending}
                    style={{ background: completing ? 'rgba(16,185,129,0.3)' : 'linear-gradient(135deg,#10b981,#059669)', border: 'none', borderRadius: '7px', padding: '0.35rem 0.9rem', color: '#fff', fontWeight: 700, fontSize: '0.8rem', cursor: completing ? 'wait' : 'pointer' }}>
                    {completing ? '⏳ Completing…' : '✅ Finish & Get Report'}
                  </button>
                )}
              </div>
            </div>

            {/* Chat area */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.85rem', padding: '1rem', minHeight: '400px', maxHeight: '55vh', background: 'rgba(15,15,35,0.4)', borderRadius: '16px', border: '1px solid rgba(99,102,241,0.1)', marginBottom: '1rem' }}>
              {history.map((m, i) => (
                <div key={i} style={msgStyle(m.role)}>
                  <span style={{ fontSize: '0.7rem', color: m.role === 'user' ? '#818cf8' : '#64748b', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>
                    {m.role === 'user' ? 'You' : '🤖 AI Interviewer'}
                  </span>
                  {m.content}
                </div>
              ))}
              {isPending && (
                <div style={{ ...msgStyle('assistant'), opacity: 0.6 }}>
                  <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>🤖 AI Interviewer</span>
                  Thinking…
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Hint: finish after 3+ Q/As */}
            {qaLog.length >= 3 && (
              <div style={{ marginBottom: '0.6rem', color: '#475569', fontSize: '0.77rem', textAlign: 'center' }}>
                ✨ Ready? Click <strong style={{ color: '#10b981' }}>Finish & Get Report</strong> to see your score + action plan
              </div>
            )}

            {/* Input */}
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <textarea value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                placeholder="Type your answer… (Enter to send, Shift+Enter for new line)" rows={3}
                style={{ flex: 1, padding: '0.75rem 1rem', borderRadius: '12px', resize: 'none', background: 'rgba(26,26,62,0.8)', border: '1px solid rgba(99,102,241,0.2)', color: '#e2e8f0', fontSize: '0.88rem', outline: 'none', fontFamily: 'inherit' }} />
              <button onClick={handleSend} disabled={isPending || !input.trim()}
                style={{ padding: '0 1.5rem', borderRadius: '12px', border: 'none', background: !isPending && input.trim() ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'rgba(99,102,241,0.2)', color: '#fff', fontWeight: 700, cursor: isPending ? 'not-allowed' : 'pointer', fontSize: '1.1rem' }}>➤</button>
            </div>
          </>
        )}
      </main>
    </div>
  )
}

import { useState, useRef, useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import Navbar from '../components/Navbar'
import { api } from '../lib/api'

interface Message { role: 'user' | 'assistant'; content: string }

export default function AptitudePrep() {
  const [focus, setFocus] = useState<'aptitude' | 'coding'>('aptitude')
  const [history, setHistory] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  const { mutate: sendMsg, isPending } = useMutation({
    mutationFn: (msg: string) =>
      api.post('/agent/prep', {
        message: msg,
        focus,
        history: history.map(h => ({ role: h.role, content: h.content })),
      }).then(r => r.data),
    onSuccess: (data) => {
      setHistory(h => [...h, { role: 'assistant', content: data.response }])
    },
  })

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [history, isPending])

  const handleSend = () => {
    if (!input.trim() || isPending) return
    const msg = input.trim()
    setInput('')
    setHistory(h => [...h, { role: 'user', content: msg }])
    sendMsg(msg)
  }

  const msgStyle = (role: string): React.CSSProperties => ({
    maxWidth: '82%',
    alignSelf: role === 'user' ? 'flex-end' : 'flex-start',
    background: role === 'user' ? 'rgba(99,102,241,0.2)' : 'rgba(26,26,62,0.9)',
    border: `1px solid ${role === 'user' ? 'rgba(99,102,241,0.4)' : 'rgba(99,102,241,0.15)'}`,
    borderRadius: role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
    padding: '0.85rem 1.1rem',
    color: '#e2e8f0', fontSize: '0.88rem', lineHeight: 1.6, whiteSpace: 'pre-wrap',
  })

  const STARTERS = focus === 'coding'
    ? ['Explain Binary Search with code', 'What is time complexity of merge sort?', 'How does HashMap work internally?', 'Solve Two Sum problem']
    : ['Explain percentage profit/loss formula', 'Solve: Train speed problem', 'Tips for logical reasoning questions', 'Explain permutations vs combinations']

  return (
    <div style={{ minHeight: '100vh', background: '#0f0f23', fontFamily: 'Inter, system-ui, sans-serif', display: 'flex', flexDirection: 'column' }}>
      <Navbar />
      <main style={{ flex: 1, maxWidth: '900px', width: '100%', margin: '0 auto', padding: '2rem 1.5rem', display: 'flex', flexDirection: 'column' }}>
        <h1 style={{ color: '#e2e8f0', fontSize: '1.6rem', fontWeight: 800, margin: '0 0 0.3rem' }}>
          Aptitude & Coding <span style={{ color: '#6366f1' }}>Prep</span>
        </h1>
        <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
          AI tutor for placement test preparation — step-by-step explanations
        </p>

        {/* Focus toggle */}
        <div style={{ display: 'flex', background: 'rgba(15,15,35,0.6)', borderRadius: '12px', padding: '4px', marginBottom: '1.25rem', width: 'fit-content' }}>
          {(['aptitude', 'coding'] as const).map(f => (
            <button key={f} onClick={() => { setFocus(f); setHistory([]) }} style={{
              padding: '0.5rem 1.5rem', borderRadius: '9px', border: 'none', cursor: 'pointer',
              background: focus === f ? 'rgba(99,102,241,0.7)' : 'transparent',
              color: focus === f ? '#fff' : '#64748b', fontWeight: 600, fontSize: '0.85rem',
              transition: 'all 0.2s',
            }}>
              {f === 'aptitude' ? '🔢 Quant & Logical' : '💻 Coding & DSA'}
            </button>
          ))}
        </div>

        {/* Starter prompts */}
        {history.length === 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
            {STARTERS.map(s => (
              <button key={s} onClick={() => { setHistory([{ role: 'user', content: s }]); sendMsg(s) }} style={{
                padding: '0.45rem 0.9rem', borderRadius: '999px', cursor: 'pointer',
                background: 'rgba(26,26,62,0.8)', border: '1px solid rgba(99,102,241,0.2)',
                color: '#818cf8', fontSize: '0.78rem', fontWeight: 500,
                transition: 'all 0.15s',
              }}>{s}</button>
            ))}
          </div>
        )}

        {/* Chat area */}
        <div style={{
          flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column',
          gap: '0.85rem', padding: '1rem', minHeight: '350px', maxHeight: '52vh',
          background: 'rgba(15,15,35,0.4)', borderRadius: '16px',
          border: '1px solid rgba(99,102,241,0.1)', marginBottom: '1rem',
        }}>
          {history.length === 0 && (
            <div style={{ color: '#334155', fontSize: '0.85rem', textAlign: 'center', marginTop: '3rem' }}>
              Ask anything about {focus === 'coding' ? 'DSA, algorithms, or code' : 'quant, logical reasoning, or aptitude'} →
            </div>
          )}
          {history.map((m, i) => (
            <div key={i} style={msgStyle(m.role)}>
              <span style={{ fontSize: '0.7rem', color: m.role === 'user' ? '#818cf8' : '#64748b', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>
                {m.role === 'user' ? 'You' : '🤖 AI Tutor'}
              </span>
              {m.content}
            </div>
          ))}
          {isPending && (
            <div style={{ ...msgStyle('assistant'), opacity: 0.6 }}>
              <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>🤖 AI Tutor</span>
              Explaining…
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            placeholder="Ask a question… (Enter to send)"
            rows={2}
            style={{
              flex: 1, padding: '0.75rem 1rem', borderRadius: '12px', resize: 'none',
              background: 'rgba(26,26,62,0.8)', border: '1px solid rgba(99,102,241,0.2)',
              color: '#e2e8f0', fontSize: '0.88rem', outline: 'none', fontFamily: 'inherit',
            }}
          />
          <button onClick={handleSend} disabled={isPending || !input.trim()} style={{
            padding: '0 1.5rem', borderRadius: '12px', border: 'none',
            background: !isPending && input.trim() ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'rgba(99,102,241,0.2)',
            color: '#fff', fontWeight: 700, cursor: isPending ? 'not-allowed' : 'pointer', fontSize: '1.1rem',
          }}>➤</button>
        </div>
      </main>
    </div>
  )
}

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { api } from '../lib/api'

interface Block {
  id: string
  startTime: string
  endTime: string
  activity: string
  category: string
  sourceType: string | null
  isDone: boolean
  completedAt: string | null
}

interface ScheduleDay {
  id: string
  date: string
  generatedReason: string | null
  completionPct: number
  blocks: Block[]
}

const CAT_META: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  weak_area_practice: { label: 'Weak Area',   color: '#f87171', bg: 'rgba(239,68,68,0.1)',   icon: '🎯' },
  job_readiness:      { label: 'Job Ready',   color: '#60a5fa', bg: 'rgba(96,165,250,0.1)',  icon: '💼' },
  diet:               { label: 'Meal',        color: '#34d399', bg: 'rgba(52,211,153,0.1)',  icon: '🥗' },
  exam_prep:          { label: 'Exam Prep',   color: '#fbbf24', bg: 'rgba(251,191,36,0.1)',  icon: '📚' },
  rest:               { label: 'Rest',        color: '#a78bfa', bg: 'rgba(167,139,250,0.1)', icon: '😴' },
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function blockHeight(start: string, end: string): number {
  const diff = timeToMinutes(end) - timeToMinutes(start)
  return Math.max(diff * 1.2, 48) // px, minimum 48
}

function blockTop(start: string): number {
  return (timeToMinutes(start) - 6 * 60) * 1.2 // offset from 06:00
}

const HOURS = Array.from({ length: 18 }, (_, i) => i + 6) // 06:00 – 23:00

function CompletionBar({ pct }: { pct: number }) {
  const color = pct >= 70 ? '#10b981' : pct >= 40 ? '#f59e0b' : '#6366f1'
  return (
    <div style={{ marginBottom: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
        <span style={{ color: '#94a3b8', fontSize: '0.78rem', fontWeight: 600 }}>Today's Completion</span>
        <span style={{ color, fontWeight: 800, fontSize: '0.88rem' }}>{pct}%</span>
      </div>
      <div style={{ height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 99 }}>
        <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg, ${color}, ${color}cc)`, borderRadius: 99, transition: 'width 0.6s ease' }} />
      </div>
    </div>
  )
}

function BlockCard({ block, onToggle }: { block: Block; onToggle: (id: string, done: boolean) => void }) {
  const cat = CAT_META[block.category] ?? CAT_META.rest
  const height = blockHeight(block.startTime, block.endTime)
  const top    = blockTop(block.startTime)

  return (
    <div
      onClick={() => onToggle(block.id, !block.isDone)}
      style={{
        position: 'absolute', left: 72, right: 8, top,
        height, boxSizing: 'border-box',
        background: block.isDone ? 'rgba(16,185,129,0.08)' : cat.bg,
        border: `1px solid ${block.isDone ? 'rgba(16,185,129,0.35)' : cat.color + '40'}`,
        borderRadius: 10, padding: '0.4rem 0.65rem',
        cursor: 'pointer', transition: 'all 0.2s',
        display: 'flex', alignItems: 'flex-start', gap: '0.5rem',
        overflow: 'hidden',
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = cat.color + 'aa')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = block.isDone ? 'rgba(16,185,129,0.35)' : cat.color + '40')}
    >
      {/* Checkbox */}
      <div style={{
        width: 18, height: 18, borderRadius: 5, flexShrink: 0, marginTop: 2,
        background: block.isDone ? '#10b981' : 'transparent',
        border: `2px solid ${block.isDone ? '#10b981' : cat.color}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.15s',
      }}>
        {block.isDone && <span style={{ color: '#fff', fontSize: '0.65rem', fontWeight: 900 }}>✓</span>}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          color: block.isDone ? '#64748b' : '#e2e8f0',
          fontWeight: 600, fontSize: '0.8rem', lineHeight: 1.3,
          textDecoration: block.isDone ? 'line-through' : 'none',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {cat.icon} {block.activity}
        </div>
        {height > 60 && (
          <div style={{ color: '#475569', fontSize: '0.7rem', marginTop: 2 }}>
            {block.startTime} – {block.endTime}
            {block.sourceType && <span style={{ marginLeft: 6, color: cat.color, opacity: 0.8 }}>• {block.sourceType.replace('_', ' ')}</span>}
          </div>
        )}
      </div>
    </div>
  )
}

export default function Schedule() {
  const [day, setDay] = useState<ScheduleDay | null>(null)
  const [loading, setLoading] = useState(true)
  const [regenerating, setRegenerating] = useState(false)
  const [streak, setStreak] = useState(0)
  const [toast, setToast] = useState('')
  const navigate = useNavigate()

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const loadToday = useCallback(async () => {
    try {
      setLoading(true)
      const res: any = await api.get('/schedule/today')
      setDay(res.data.day)

      // Compute streak from range
      const range: any = await api.get('/schedule?from=' + new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10))
      const days: ScheduleDay[] = range.data.days.reverse()
      let s = 0
      for (const d of days) {
        if (d.completionPct >= 70) s++
        else break
      }
      setStreak(s)
    } catch { showToast('Failed to load schedule') } finally { setLoading(false) }
  }, [])

  useEffect(() => { loadToday() }, [loadToday])

  const handleToggle = async (blockId: string, done: boolean) => {
    try {
      await api.patch(`/schedule/blocks/${blockId}/complete`, { isDone: done })
      setDay(prev => {
        if (!prev) return prev
        const blocks = prev.blocks.map(b => b.id === blockId ? { ...b, isDone: done } : b)
        const total = blocks.length
        const doneCount = blocks.filter(b => b.isDone).length
        return { ...prev, blocks, completionPct: total ? Math.round(doneCount / total * 100) : 0 }
      })
    } catch { showToast('Failed to update block') }
  }

  const handleRegenerate = async () => {
    setRegenerating(true)
    try {
      const res: any = await api.post('/schedule/regenerate', {})
      setDay(res.data.day)
      showToast('✅ Schedule regenerated!')
    } catch { showToast('❌ Regeneration failed') } finally { setRegenerating(false) }
  }

  const totalHeight = 17 * 60 * 1.2 // 06:00 - 23:00 in px

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#0f0f23 0%,#1a1a3e 50%,#0f0f23 100%)', fontFamily: 'Inter,system-ui,sans-serif' }}>
      <Navbar />

      {toast && (
        <div style={{ position: 'fixed', top: 80, right: 24, zIndex: 1000, background: 'rgba(30,30,60,0.95)', border: '1px solid rgba(99,102,241,0.4)', borderRadius: 10, padding: '0.75rem 1.25rem', color: '#e2e8f0', fontSize: '0.88rem', fontWeight: 500, backdropFilter: 'blur(12px)' }}>
          {toast}
        </div>
      )}

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '2rem 1.5rem' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 900, color: '#e2e8f0' }}>📅 My Schedule</h1>
            <p style={{ margin: '0.3rem 0 0', color: '#64748b', fontSize: '0.85rem' }}>
              {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
              {streak > 0 && <span style={{ marginLeft: '0.75rem', color: '#f59e0b', fontWeight: 700 }}>🔥 {streak}-day streak</span>}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={handleRegenerate} disabled={regenerating}
              style={{ background: regenerating ? 'rgba(99,102,241,0.3)' : 'linear-gradient(135deg,#6366f1,#8b5cf6)', border: 'none', borderRadius: 9, padding: '0.55rem 1.1rem', color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: regenerating ? 'wait' : 'pointer' }}>
              {regenerating ? '⏳ Regenerating…' : '🔄 Regenerate'}
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: '#475569' }}>Loading your schedule…</div>
        ) : !day ? (
          <div style={{ textAlign: 'center', padding: '4rem 2rem', border: '1px dashed rgba(99,102,241,0.2)', borderRadius: 16 }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📭</div>
            <div style={{ color: '#94a3b8', fontWeight: 600, fontSize: '1rem', marginBottom: '0.5rem' }}>No schedule for today yet</div>
            <div style={{ color: '#475569', fontSize: '0.83rem', marginBottom: '1.25rem' }}>Click "Regenerate" to generate your personalised time-blocked plan</div>
            <button onClick={handleRegenerate} disabled={regenerating}
              style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', border: 'none', borderRadius: 10, padding: '0.65rem 1.5rem', color: '#fff', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' }}>
              {regenerating ? '⏳ Generating…' : '✨ Generate My Schedule'}
            </button>
          </div>
        ) : (
          <>
            <CompletionBar pct={day.completionPct} />

            {day.generatedReason && (
              <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 10, padding: '0.6rem 1rem', marginBottom: '1.25rem', color: '#94a3b8', fontSize: '0.8rem' }}>
                ℹ️ {day.generatedReason}
              </div>
            )}

            {/* Category legend */}
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
              {Object.entries(CAT_META).map(([k, v]) => (
                <span key={k} style={{ background: v.bg, border: `1px solid ${v.color}40`, borderRadius: 6, padding: '0.15rem 0.55rem', color: v.color, fontSize: '0.72rem', fontWeight: 600 }}>
                  {v.icon} {v.label}
                </span>
              ))}
            </div>

            {/* Timeline */}
            <div style={{ background: 'rgba(15,15,35,0.6)', border: '1px solid rgba(99,102,241,0.12)', borderRadius: 16, padding: '1rem 0.5rem', overflowX: 'hidden', overflowY: 'auto', maxHeight: '70vh' }}>
              <div style={{ position: 'relative', height: totalHeight, minHeight: 400 }}>
                {/* Hour lines */}
                {HOURS.map(h => (
                  <div key={h} style={{ position: 'absolute', left: 0, right: 0, top: (h - 6) * 60 * 1.2, display: 'flex', alignItems: 'center', gap: '0.5rem', pointerEvents: 'none' }}>
                    <span style={{ width: 52, textAlign: 'right', color: '#334155', fontSize: '0.7rem', fontWeight: 600, flexShrink: 0 }}>
                      {String(h).padStart(2, '0')}:00
                    </span>
                    <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.04)' }} />
                  </div>
                ))}

                {/* Blocks */}
                {day.blocks.map(block => (
                  <BlockCard key={block.id} block={block} onToggle={handleToggle} />
                ))}

                {/* "Now" indicator */}
                {(() => {
                  const now = new Date()
                  const mins = now.getHours() * 60 + now.getMinutes()
                  if (mins < 6 * 60 || mins > 23 * 60) return null
                  const top = (mins - 6 * 60) * 1.2
                  return (
                    <div style={{ position: 'absolute', left: 0, right: 0, top, display: 'flex', alignItems: 'center', gap: 4, pointerEvents: 'none', zIndex: 10 }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#f43f5e', flexShrink: 0, marginLeft: 52 }} />
                      <div style={{ flex: 1, height: 2, background: '#f43f5e', opacity: 0.7 }} />
                    </div>
                  )
                })()}
              </div>
            </div>

            {/* Summary */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '0.75rem', marginTop: '1rem' }}>
              {[
                { label: 'Total Blocks', value: day.blocks.length, icon: '📋' },
                { label: 'Completed', value: day.blocks.filter(b => b.isDone).length, icon: '✅' },
                { label: 'Remaining', value: day.blocks.filter(b => !b.isDone).length, icon: '⏳' },
              ].map(s => (
                <div key={s.label} style={{ background: 'rgba(20,20,50,0.6)', border: '1px solid rgba(99,102,241,0.12)', borderRadius: 12, padding: '0.85rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.3rem' }}>{s.icon}</div>
                  <div style={{ color: '#e2e8f0', fontWeight: 800, fontSize: '1.4rem' }}>{s.value}</div>
                  <div style={{ color: '#475569', fontSize: '0.72rem', marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

import { useState } from 'react'

interface PlanTabProps {
  daily: string[]
  weekly: string[]
  monthly: string[]
  priorityFocus?: string
}

const TABS = ['Daily', 'Weekly', 'Monthly'] as const

export default function PlanTab({ daily, weekly, monthly, priorityFocus }: PlanTabProps) {
  const [active, setActive] = useState<typeof TABS[number]>('Daily')

  const items = active === 'Daily' ? daily : active === 'Weekly' ? weekly : monthly

  return (
    <div>
      {priorityFocus && (
        <div style={{
          background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)',
          borderRadius: '8px', padding: '0.5rem 1rem', marginBottom: '1rem',
          color: '#818cf8', fontSize: '0.8rem', fontWeight: 600,
        }}>
          🎯 Priority Focus: {priorityFocus}
        </div>
      )}

      {/* Tab switcher */}
      <div style={{
        display: 'flex', gap: '0.5rem', marginBottom: '1rem',
        background: 'rgba(15,15,35,0.5)', borderRadius: '10px', padding: '4px',
      }}>
        {TABS.map((tab) => (
          <button key={tab} onClick={() => setActive(tab)} style={{
            flex: 1, padding: '0.45rem', border: 'none', borderRadius: '7px',
            fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer',
            transition: 'all 0.2s',
            background: active === tab ? 'rgba(99,102,241,0.8)' : 'transparent',
            color: active === tab ? '#fff' : '#64748b',
          }}>
            {tab}
          </button>
        ))}
      </div>

      {/* Task list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {items.length === 0 ? (
          <p style={{ color: '#64748b', fontSize: '0.85rem' }}>No tasks yet — run predictions first.</p>
        ) : items.map((task, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
            background: 'rgba(15,15,35,0.4)', borderRadius: '10px',
            padding: '0.65rem 0.85rem',
            border: '1px solid rgba(99,102,241,0.1)',
            transition: 'background 0.2s',
          }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(99,102,241,0.08)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(15,15,35,0.4)')}
          >
            <span style={{
              minWidth: '22px', height: '22px', borderRadius: '50%',
              background: 'rgba(99,102,241,0.2)', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              fontSize: '0.7rem', color: '#818cf8', fontWeight: 700, flexShrink: 0,
            }}>{i + 1}</span>
            <span style={{ color: '#cbd5e1', fontSize: '0.85rem', lineHeight: 1.5 }}>{task}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

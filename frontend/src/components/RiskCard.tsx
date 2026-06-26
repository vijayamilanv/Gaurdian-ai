interface RiskCardProps {
  title: string
  value: number       // 0-100
  type: 'placement' | 'backlog' | 'burnout' | 'project'
  risks?: string[]
  subtitle?: string
}

const COLORS = {
  placement: { good: '#10b981', mid: '#f59e0b', bad: '#ef4444' },
  backlog:   { good: '#10b981', mid: '#f59e0b', bad: '#ef4444' },
  burnout:   { good: '#10b981', mid: '#f59e0b', bad: '#ef4444' },
  project:   { good: '#10b981', mid: '#f59e0b', bad: '#ef4444' },
}

function getColor(value: number, type: RiskCardProps['type']) {
  const c = COLORS[type]
  if (type === 'placement') {
    return value >= 70 ? c.good : value >= 45 ? c.mid : c.bad
  }
  return value <= 25 ? c.good : value <= 55 ? c.mid : c.bad
}

function getLabel(value: number, type: RiskCardProps['type']) {
  if (type === 'placement') {
    return value >= 70 ? 'Strong' : value >= 45 ? 'Moderate' : 'At Risk'
  }
  return value <= 25 ? 'Low Risk' : value <= 55 ? 'Moderate' : 'High Risk'
}

export default function RiskCard({ title, value, type, risks = [], subtitle }: RiskCardProps) {
  const color = getColor(value, type)
  const label = getLabel(value, type)
  const circumference = 2 * Math.PI * 36
  const offset = circumference - (value / 100) * circumference

  return (
    <div style={{
      background: 'rgba(26,26,62,0.7)',
      border: '1px solid rgba(99,102,241,0.15)',
      borderRadius: '16px',
      padding: '1.5rem',
      backdropFilter: 'blur(8px)',
      transition: 'transform 0.2s, box-shadow 0.2s',
    }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.boxShadow = `0 8px 32px ${color}22`
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
        {/* Mini donut */}
        <svg width="84" height="84" style={{ flexShrink: 0 }}>
          <circle cx="42" cy="42" r="36" fill="none" stroke="rgba(99,102,241,0.1)" strokeWidth="8" />
          <circle
            cx="42" cy="42" r="36" fill="none"
            stroke={color} strokeWidth="8"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            transform="rotate(-90 42 42)"
            style={{ transition: 'stroke-dashoffset 1s ease' }}
          />
          <text x="42" y="46" textAnchor="middle"
            fill="#e2e8f0" fontSize="14" fontWeight="700">{value}%</text>
        </svg>

        <div>
          <div style={{ color: '#94a3b8', fontSize: '0.8rem', marginBottom: '0.25rem' }}>{title}</div>
          <div style={{
            color, fontSize: '1rem', fontWeight: 700,
            display: 'flex', alignItems: 'center', gap: '0.4rem'
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block'
            }} />
            {label}
          </div>
          {subtitle && <div style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '0.2rem' }}>{subtitle}</div>}
        </div>
      </div>

      {risks.length > 0 && (
        <div style={{ borderTop: '1px solid rgba(99,102,241,0.1)', paddingTop: '0.75rem' }}>
          {risks.slice(0, 2).map((r, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'flex-start', gap: '0.5rem',
              marginTop: i > 0 ? '0.4rem' : 0,
            }}>
              <span style={{ color: '#f59e0b', fontSize: '0.7rem', marginTop: '2px' }}>⚠</span>
              <span style={{ color: '#94a3b8', fontSize: '0.75rem', lineHeight: 1.4 }}>{r}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface SkillBadgeProps {
  name: string
  variant?: 'present' | 'missing' | 'neutral'
}

const VARIANTS = {
  present: {
    background: 'rgba(16,185,129,0.15)',
    border: '1px solid rgba(16,185,129,0.3)',
    color: '#34d399',
  },
  missing: {
    background: 'rgba(239,68,68,0.12)',
    border: '1px solid rgba(239,68,68,0.25)',
    color: '#f87171',
  },
  neutral: {
    background: 'rgba(99,102,241,0.12)',
    border: '1px solid rgba(99,102,241,0.25)',
    color: '#818cf8',
  },
}

export default function SkillBadge({ name, variant = 'neutral' }: SkillBadgeProps) {
  const style = VARIANTS[variant]
  return (
    <span style={{
      ...style,
      borderRadius: '999px',
      padding: '0.25rem 0.65rem',
      fontSize: '0.75rem',
      fontWeight: 600,
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.3rem',
      whiteSpace: 'nowrap',
    }}>
      {variant === 'present' && '✓ '}
      {variant === 'missing' && '+ '}
      {name}
    </span>
  )
}

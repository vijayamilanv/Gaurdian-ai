import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  RadialBarChart, RadialBar, ResponsiveContainer, PolarAngleAxis,
} from 'recharts'
import Navbar from '../components/Navbar'
import RiskCard from '../components/RiskCard'
import SkillBadge from '../components/SkillBadge'
import PlanTab from '../components/PlanTab'
import { api } from '../lib/api'

interface PipelineResult {
  result: {
    current_status?: { overallReadiness?: number; activityGrade?: string }
    predictions?: {
      placement?: { percentage: number; topRisks: string[] }
      backlog?: { percentage: number; topRisks: string[] }
      burnout?: { score: number; level: string; topRisks: string[] }
      projectFailure?: { percentage: number; topRisks: string[] }
    }
    skill_gap?: {
      presentSkills: string[]
      missingSkills: string[]
      coveragePercent: number
      topMissingSkills: string[]
      recommendedResources: Record<string, string>
    }
    weaknesses?: { profileScore: number; weakAreas: { area: string; severity: string; detail: string; action: string }[] }
    plan?: { daily: string[]; weekly: string[]; monthly: string[]; priorityFocus: string }
  }
}

export default function Dashboard() {
  const queryClient = useQueryClient()
  const [runError, setRunError] = useState('')

  const { data, isLoading } = useQuery<PipelineResult>({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const res = await api.post('/predictions/run', {})
      return res.data
    },
    staleTime: 1000 * 60 * 10,
    retry: 1,
  })

  const { mutate: rerun, isPending: rerunning } = useMutation({
    mutationFn: () => api.post('/predictions/run', {}),
    onSuccess: (res) => {
      queryClient.setQueryData(['dashboard'], res.data)
      setRunError('')
    },
    onError: (err: any) => {
      setRunError(err.response?.data?.message || 'AI service unavailable')
    },
  })

  const result = data?.result
  const predictions = result?.predictions
  const skillGap = result?.skill_gap
  const plan = result?.plan
  const weaknesses = result?.weaknesses
  const status = result?.current_status

  const placementPct  = predictions?.placement?.percentage  ?? 0
  const backlogPct    = predictions?.backlog?.percentage    ?? 0
  const burnoutScore  = predictions?.burnout?.score         ?? 0
  const projectPct    = predictions?.projectFailure?.percentage ?? 0

  const gaugeData = [{ value: placementPct, fill: placementPct >= 70 ? '#10b981' : placementPct >= 45 ? '#f59e0b' : '#ef4444' }]

  if (isLoading) return (
    <div style={{ minHeight: '100vh', background: '#0f0f23', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 60, height: 60, borderRadius: '50%', margin: '0 auto 1rem',
          border: '3px solid rgba(99,102,241,0.2)', borderTopColor: '#6366f1',
          animation: 'spin 1s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        <p style={{ color: '#64748b' }}>Running predictions…</p>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#0f0f23', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <Navbar />

      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem 1.5rem' }}>

        {/* Header row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ color: '#e2e8f0', fontSize: '1.75rem', fontWeight: 800, margin: 0 }}>
              Your <span style={{ color: '#6366f1' }}>Success</span> Dashboard
            </h1>
            <p style={{ color: '#64748b', marginTop: '0.3rem', fontSize: '0.9rem' }}>
              {status?.activityGrade ? `Activity Grade: ${status.activityGrade}` : 'AI-powered predictions based on your profile'}
            </p>
          </div>
          <button onClick={() => rerun()} disabled={rerunning} style={{
            padding: '0.7rem 1.5rem', borderRadius: '10px', border: 'none', cursor: rerunning ? 'not-allowed' : 'pointer',
            background: rerunning ? 'rgba(99,102,241,0.3)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            color: '#fff', fontWeight: 700, fontSize: '0.9rem',
            boxShadow: rerunning ? 'none' : '0 4px 20px rgba(99,102,241,0.4)',
            transition: 'all 0.2s',
          }}>
            {rerunning ? '⟳ Running…' : '⟳ Re-run Predictions'}
          </button>
        </div>

        {runError && (
          <div style={{
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: '10px', padding: '0.75rem 1rem', marginBottom: '1.5rem', color: '#f87171',
          }}>
            ⚠️ {runError} — Make sure the AI service is running on port 8000.
          </div>
        )}

        {/* Hero row: Placement gauge + 3 key stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>

          {/* Placement gauge card */}
          <div style={{
            background: 'rgba(26,26,62,0.7)', border: '1px solid rgba(99,102,241,0.2)',
            borderRadius: '20px', padding: '1.5rem', backdropFilter: 'blur(8px)',
            gridColumn: 'span 1',
          }}>
            <div style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              PLACEMENT PROBABILITY
            </div>
            <div style={{ height: '180px', position: 'relative' }}>
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart
                  cx="50%" cy="80%" innerRadius="60%" outerRadius="90%"
                  barSize={16} data={gaugeData}
                  startAngle={180} endAngle={0}
                >
                  <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
                  <RadialBar background={{ fill: 'rgba(99,102,241,0.08)' }}
                    dataKey="value" cornerRadius={8} angleAxisId={0} />
                </RadialBarChart>
              </ResponsiveContainer>
              <div style={{
                position: 'absolute', bottom: '10px', left: '50%', transform: 'translateX(-50%)',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '2.5rem', fontWeight: 900, color: gaugeData[0].fill, lineHeight: 1 }}>
                  {placementPct.toFixed(0)}%
                </div>
                <div style={{ color: '#64748b', fontSize: '0.8rem' }}>
                  {placementPct >= 70 ? '🟢 Strong' : placementPct >= 45 ? '🟡 Moderate' : '🔴 Needs Work'}
                </div>
              </div>
            </div>
            {predictions?.placement?.topRisks?.slice(0, 2).map((r, i) => (
              <div key={i} style={{ color: '#94a3b8', fontSize: '0.75rem', marginTop: '0.4rem' }}>
                ⚠ {r}
              </div>
            ))}
          </div>

          {/* Profile readiness */}
          <div style={{
            background: 'rgba(26,26,62,0.7)', border: '1px solid rgba(99,102,241,0.2)',
            borderRadius: '20px', padding: '1.5rem', backdropFilter: 'blur(8px)',
          }}>
            <div style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: 600, marginBottom: '1rem' }}>PROFILE SCORE</div>
            <div style={{ fontSize: '3rem', fontWeight: 900, color: '#6366f1' }}>
              {weaknesses?.profileScore ?? '--'}
              <span style={{ fontSize: '1.2rem', color: '#475569' }}>/100</span>
            </div>
            <div style={{ marginTop: '1rem' }}>
              {weaknesses?.weakAreas?.slice(0, 3).map((w, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  marginTop: i > 0 ? '0.5rem' : 0,
                }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                    background: w.severity === 'critical' ? '#ef4444' : w.severity === 'high' ? '#f59e0b' : '#6366f1',
                  }} />
                  <span style={{ color: '#94a3b8', fontSize: '0.78rem' }}>{w.area}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Skill coverage */}
          <div style={{
            background: 'rgba(26,26,62,0.7)', border: '1px solid rgba(99,102,241,0.2)',
            borderRadius: '20px', padding: '1.5rem', backdropFilter: 'blur(8px)',
          }}>
            <div style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: 600, marginBottom: '1rem' }}>SKILL COVERAGE</div>
            <div style={{ fontSize: '3rem', fontWeight: 900, color: '#10b981' }}>
              {skillGap?.coveragePercent?.toFixed(0) ?? '--'}
              <span style={{ fontSize: '1.2rem', color: '#475569' }}>%</span>
            </div>
            <div style={{ marginTop: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
              {skillGap?.topMissingSkills?.slice(0, 4).map((s) => (
                <SkillBadge key={s} name={s} variant="missing" />
              ))}
            </div>
          </div>
        </div>

        {/* Risk Breakdown */}
        <div style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ color: '#e2e8f0', fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem' }}>
            Risk Breakdown
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
            <RiskCard title="Placement Risk" value={placementPct} type="placement"
              risks={predictions?.placement?.topRisks} subtitle="Probability of getting placed" />
            <RiskCard title="Backlog Risk" value={backlogPct} type="backlog"
              risks={predictions?.backlog?.topRisks} subtitle="Risk of academic backlogs" />
            <RiskCard title="Burnout Risk" value={burnoutScore} type="burnout"
              risks={predictions?.burnout?.topRisks}
              subtitle={`Level: ${predictions?.burnout?.level ?? 'low'}`} />
            <RiskCard title="Project Failure" value={projectPct} type="project"
              risks={predictions?.projectFailure?.topRisks} subtitle="Project completion risk" />
          </div>
        </div>

        {/* Bottom row: Skill Gap + Action Plan */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>

          {/* Skill Gap */}
          <div style={{
            background: 'rgba(26,26,62,0.7)', border: '1px solid rgba(99,102,241,0.2)',
            borderRadius: '20px', padding: '1.5rem', backdropFilter: 'blur(8px)',
          }}>
            <h2 style={{ color: '#e2e8f0', fontSize: '1rem', fontWeight: 700, marginBottom: '1rem' }}>
              Skill Gap Analysis
            </h2>
            {skillGap?.presentSkills?.length > 0 && (
              <>
                <div style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.5rem' }}>YOU HAVE</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '1rem' }}>
                  {skillGap.presentSkills.slice(0, 6).map(s => <SkillBadge key={s} name={s} variant="present" />)}
                </div>
              </>
            )}
            <div style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.5rem' }}>MISSING (TOP PRIORITY)</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {skillGap?.topMissingSkills?.slice(0, 5).map(s => (
                <a key={s} href={skillGap.recommendedResources?.[s] || '#'} target="_blank" rel="noopener noreferrer"
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '0.6rem 0.85rem', borderRadius: '10px', textDecoration: 'none',
                    background: 'rgba(15,15,35,0.5)', border: '1px solid rgba(239,68,68,0.2)',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.08)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(15,15,35,0.5)'}
                >
                  <SkillBadge name={s} variant="missing" />
                  <span style={{ color: '#475569', fontSize: '0.75rem' }}>Learn →</span>
                </a>
              ))}
            </div>
          </div>

          {/* Action Plan */}
          <div style={{
            background: 'rgba(26,26,62,0.7)', border: '1px solid rgba(99,102,241,0.2)',
            borderRadius: '20px', padding: '1.5rem', backdropFilter: 'blur(8px)',
          }}>
            <h2 style={{ color: '#e2e8f0', fontSize: '1rem', fontWeight: 700, marginBottom: '1rem' }}>
              Action Plan
            </h2>
            <PlanTab
              daily={plan?.daily ?? []}
              weekly={plan?.weekly ?? []}
              monthly={plan?.monthly ?? []}
              priorityFocus={plan?.priorityFocus}
            />
          </div>
        </div>
      </main>
    </div>
  )
}

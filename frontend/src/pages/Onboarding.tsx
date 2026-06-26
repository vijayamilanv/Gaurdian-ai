import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'

const STEPS = ['Academic', 'Skills', 'Projects', 'Goals'] as const
type Step = typeof STEPS[number]

const ROLE_OPTIONS = ['Software Engineer', 'Full Stack Developer', 'Data Engineer', 'ML Engineer', 'DevOps Engineer', 'Frontend Developer', 'Backend Developer']

export default function Onboarding() {
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const navigate = useNavigate()

  // Form state
  const [cgpa, setCgpa] = useState('')
  const [attendance, setAttendance] = useState('')
  const [dsaSolved, setDsaSolved] = useState('')
  const [skillInput, setSkillInput] = useState('')
  const [proficiency, setProficiency] = useState('3')
  const [skills, setSkills] = useState<{ skillName: string; proficiency: number }[]>([])
  const [projects, setProjects] = useState<{ title: string; description: string; techStack: string[] }[]>([])
  const [projTitle, setProjTitle] = useState('')
  const [projDesc, setProjDesc] = useState('')
  const [projTech, setProjTech] = useState('')
  const [targetRoles, setTargetRoles] = useState<string[]>([])

  const addSkill = () => {
    if (skillInput.trim() && !skills.find(s => s.skillName.toLowerCase() === skillInput.toLowerCase())) {
      setSkills([...skills, { skillName: skillInput.trim(), proficiency: Number(proficiency) }])
      setSkillInput('')
    }
  }

  const addProject = () => {
    if (projTitle.trim()) {
      setProjects([...projects, {
        title: projTitle.trim(),
        description: projDesc.trim(),
        techStack: projTech.split(',').map(t => t.trim()).filter(Boolean),
      }])
      setProjTitle(''); setProjDesc(''); setProjTech('')
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.put('/profile', {
        cgpa: cgpa ? Number(cgpa) : undefined,
        attendance: attendance ? Number(attendance) : undefined,
        dsaSolved: dsaSolved ? Number(dsaSolved) : undefined,
        targetRoles,
        skills,
        projects,
      })
      navigate('/dashboard')
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const inputStyle = {
    width: '100%', padding: '0.75rem 1rem', borderRadius: '10px',
    background: 'rgba(15,15,35,0.6)', border: '1px solid rgba(99,102,241,0.2)',
    color: '#e2e8f0', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' as const,
    marginTop: '0.4rem',
  }

  const labelStyle = { color: '#94a3b8', fontSize: '0.8rem', fontWeight: 600 as const, display: 'block' as const }

  return (
    <div style={{
      minHeight: '100vh', background: 'radial-gradient(ellipse at top, #1a1a3e 0%, #0f0f23 70%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Inter, system-ui, sans-serif', padding: '2rem 1rem',
    }}>
      <div style={{ width: '100%', maxWidth: '560px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{ color: '#e2e8f0', fontSize: '1.6rem', fontWeight: 800 }}>
            Build Your <span style={{ color: '#6366f1' }}>Profile</span>
          </h1>
          <p style={{ color: '#64748b', fontSize: '0.9rem' }}>Step {step + 1} of {STEPS.length} — {STEPS[step]}</p>
        </div>

        {/* Progress bar */}
        <div style={{ background: 'rgba(99,102,241,0.1)', borderRadius: '99px', height: '4px', marginBottom: '2rem' }}>
          <div style={{
            height: '100%', borderRadius: '99px',
            background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
            width: `${((step + 1) / STEPS.length) * 100}%`,
            transition: 'width 0.4s ease',
          }} />
        </div>

        {/* Card */}
        <div style={{
          background: 'rgba(26,26,62,0.8)', border: '1px solid rgba(99,102,241,0.2)',
          borderRadius: '20px', backdropFilter: 'blur(20px)', padding: '2rem',
          boxShadow: '0 25px 50px rgba(0,0,0,0.4)',
        }}>
          {/* Step 0: Academic */}
          {step === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div><label style={labelStyle}>CGPA (out of 10)</label>
                <input type="number" min="0" max="10" step="0.1" value={cgpa}
                  onChange={e => setCgpa(e.target.value)} placeholder="e.g. 7.8" style={inputStyle} /></div>
              <div><label style={labelStyle}>Attendance (%)</label>
                <input type="number" min="0" max="100" value={attendance}
                  onChange={e => setAttendance(e.target.value)} placeholder="e.g. 82" style={inputStyle} /></div>
              <div><label style={labelStyle}>DSA Problems Solved</label>
                <input type="number" min="0" value={dsaSolved}
                  onChange={e => setDsaSolved(e.target.value)} placeholder="e.g. 120" style={inputStyle} /></div>
            </div>
          )}

          {/* Step 1: Skills */}
          {step === 1 && (
            <div>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <input value={skillInput} onChange={e => setSkillInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addSkill())}
                  placeholder="e.g. React, Python…" style={{ ...inputStyle, flex: 1, marginTop: 0 }} />
                <select value={proficiency} onChange={e => setProficiency(e.target.value)}
                  style={{ ...inputStyle, width: '90px', marginTop: 0 }}>
                  {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}★</option>)}
                </select>
                <button onClick={addSkill} style={{
                  padding: '0 1rem', borderRadius: '10px', border: 'none', cursor: 'pointer',
                  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', fontWeight: 700,
                }}>Add</button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', minHeight: '60px' }}>
                {skills.map((s, i) => (
                  <span key={i} style={{
                    background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)',
                    borderRadius: '999px', padding: '0.3rem 0.75rem',
                    color: '#818cf8', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem',
                  }}>
                    {s.skillName} ({s.proficiency}★)
                    <button onClick={() => setSkills(skills.filter((_, j) => j !== i))}
                      style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 0 }}>×</button>
                  </span>
                ))}
                {skills.length === 0 && <p style={{ color: '#475569', fontSize: '0.85rem' }}>No skills added yet</p>}
              </div>
            </div>
          )}

          {/* Step 2: Projects */}
          {step === 2 && (
            <div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
                <input value={projTitle} onChange={e => setProjTitle(e.target.value)}
                  placeholder="Project title" style={{ ...inputStyle, marginTop: 0 }} />
                <input value={projDesc} onChange={e => setProjDesc(e.target.value)}
                  placeholder="Short description (optional)" style={{ ...inputStyle, marginTop: 0 }} />
                <input value={projTech} onChange={e => setProjTech(e.target.value)}
                  placeholder="Tech stack (comma separated): React, Node.js, PostgreSQL"
                  style={{ ...inputStyle, marginTop: 0 }} />
                <button onClick={addProject} style={{
                  padding: '0.65rem', borderRadius: '10px', border: 'none', cursor: 'pointer',
                  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', fontWeight: 700,
                }}>+ Add Project</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {projects.map((p, i) => (
                  <div key={i} style={{
                    background: 'rgba(15,15,35,0.5)', borderRadius: '10px',
                    padding: '0.75rem', border: '1px solid rgba(99,102,241,0.15)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <div>
                      <div style={{ color: '#e2e8f0', fontWeight: 600, fontSize: '0.9rem' }}>{p.title}</div>
                      <div style={{ color: '#64748b', fontSize: '0.75rem' }}>{p.techStack.join(', ')}</div>
                    </div>
                    <button onClick={() => setProjects(projects.filter((_, j) => j !== i))}
                      style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1.1rem' }}>×</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Goals */}
          {step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '0.5rem' }}>Select your target roles:</p>
              {ROLE_OPTIONS.map(role => (
                <label key={role} style={{
                  display: 'flex', alignItems: 'center', gap: '0.75rem',
                  background: targetRoles.includes(role) ? 'rgba(99,102,241,0.12)' : 'rgba(15,15,35,0.4)',
                  border: `1px solid ${targetRoles.includes(role) ? 'rgba(99,102,241,0.4)' : 'rgba(99,102,241,0.1)'}`,
                  borderRadius: '10px', padding: '0.75rem 1rem', cursor: 'pointer',
                  transition: 'all 0.2s',
                }}>
                  <input type="checkbox" checked={targetRoles.includes(role)}
                    onChange={() => setTargetRoles(prev =>
                      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
                    )}
                    style={{ accentColor: '#6366f1' }}
                  />
                  <span style={{ color: '#cbd5e1', fontSize: '0.9rem' }}>{role}</span>
                </label>
              ))}
            </div>
          )}

          {/* Navigation */}
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.75rem' }}>
            {step > 0 && (
              <button onClick={() => setStep(s => s - 1)} style={{
                flex: 1, padding: '0.75rem', borderRadius: '10px', cursor: 'pointer',
                background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)',
                color: '#818cf8', fontWeight: 600,
              }}>← Back</button>
            )}
            {step < STEPS.length - 1 ? (
              <button onClick={() => setStep(s => s + 1)} style={{
                flex: 2, padding: '0.75rem', borderRadius: '10px', border: 'none', cursor: 'pointer',
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', fontWeight: 700,
                boxShadow: '0 4px 20px rgba(99,102,241,0.3)',
              }}>Next →</button>
            ) : (
              <button onClick={handleSave} disabled={saving} style={{
                flex: 2, padding: '0.75rem', borderRadius: '10px', border: 'none', cursor: 'pointer',
                background: saving ? 'rgba(99,102,241,0.4)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                color: '#fff', fontWeight: 700,
              }}>{saving ? 'Saving…' : '🚀 Run Predictions'}</button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

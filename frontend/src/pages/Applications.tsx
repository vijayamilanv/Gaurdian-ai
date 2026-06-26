import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { api } from '../lib/api'

interface Application {
  id: string
  companyName: string
  role: string | null
  status: 'applied' | 'interview' | 'offer' | 'rejected'
  appliedDate: string | null
  package: string | null
  location: string | null
  createdAt: string
}

const COLUMNS = [
  { key: 'applied',   label: 'Applied',    color: '#6366f1', bg: 'rgba(99,102,241,0.08)'  },
  { key: 'interview', label: 'Interview',  color: '#f59e0b', bg: 'rgba(245,158,11,0.08)'  },
  { key: 'offer',     label: 'Offer',      color: '#10b981', bg: 'rgba(16,185,129,0.08)'  },
  { key: 'rejected',  label: 'Rejected',   color: '#ef4444', bg: 'rgba(239,68,68,0.08)'   },
] as const

type Status = typeof COLUMNS[number]['key']

const cardStyle = (color: string): React.CSSProperties => ({
  background: 'rgba(26,26,62,0.8)',
  border: `1px solid ${color}33`,
  borderRadius: '12px',
  padding: '1rem',
  marginBottom: '0.75rem',
  backdropFilter: 'blur(8px)',
  cursor: 'pointer',
  transition: 'all 0.2s',
})

export default function Applications() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [showForm, setShowForm] = useState(false)
  const [editApp, setEditApp] = useState<Application | null>(null)
  const [form, setForm] = useState({ companyName: '', role: '', location: '', package: '', appliedDate: '' })
  const [dragging, setDragging] = useState<string | null>(null)

  const { data, isLoading } = useQuery<{ applications: Application[] }>({
    queryKey: ['applications'],
    queryFn: () => api.get('/applications').then(r => r.data),
  })

  const createMut = useMutation({
    mutationFn: (body: object) => api.post('/applications', body),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['applications'] }); setShowForm(false); setForm({ companyName: '', role: '', location: '', package: '', appliedDate: '' }) },
  })

  const patchMut = useMutation({
    mutationFn: ({ id, ...body }: { id: string } & object) => api.patch(`/applications/${id}`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['applications'] }),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/applications/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['applications'] }),
  })

  const apps = data?.applications ?? []
  const grouped = Object.fromEntries(COLUMNS.map(c => [c.key, apps.filter(a => a.status === c.key)])) as Record<Status, Application[]>

  const handleDrop = (status: Status, e: React.DragEvent) => {
    e.preventDefault()
    if (dragging) patchMut.mutate({ id: dragging, status })
    setDragging(null)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '0.65rem 0.9rem', borderRadius: '8px',
    background: 'rgba(15,15,35,0.7)', border: '1px solid rgba(99,102,241,0.2)',
    color: '#e2e8f0', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0f0f23', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <Navbar />
      <main style={{ maxWidth: '1400px', margin: '0 auto', padding: '2rem 1.5rem' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <div>
            <h1 style={{ color: '#e2e8f0', fontSize: '1.6rem', fontWeight: 800, margin: 0 }}>
              Application <span style={{ color: '#6366f1' }}>Tracker</span>
            </h1>
            <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: '0.25rem' }}>
              {apps.length} applications tracked · Drag cards to update status
            </p>
          </div>
          <button onClick={() => setShowForm(true)} style={{
            padding: '0.7rem 1.4rem', borderRadius: '10px', border: 'none', cursor: 'pointer',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', fontWeight: 700,
            boxShadow: '0 4px 20px rgba(99,102,241,0.35)',
          }}>+ Add Application</button>
        </div>

        {/* Add form */}
        {showForm && (
          <div style={{
            background: 'rgba(26,26,62,0.9)', border: '1px solid rgba(99,102,241,0.25)',
            borderRadius: '16px', padding: '1.5rem', marginBottom: '1.5rem',
            backdropFilter: 'blur(12px)',
          }}>
            <h3 style={{ color: '#e2e8f0', margin: '0 0 1rem', fontWeight: 700 }}>New Application</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
              {[
                { key: 'companyName', label: 'Company *', placeholder: 'e.g. Google' },
                { key: 'role', label: 'Role', placeholder: 'e.g. SDE-1' },
                { key: 'location', label: 'Location', placeholder: 'e.g. Bangalore' },
                { key: 'package', label: 'Package', placeholder: 'e.g. 18 LPA' },
                { key: 'appliedDate', label: 'Applied Date', placeholder: '' },
              ].map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>{label}</label>
                  <input
                    type={key === 'appliedDate' ? 'date' : 'text'}
                    placeholder={placeholder}
                    value={(form as any)[key]}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    style={inputStyle}
                  />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
              <button onClick={() => createMut.mutate(form)} disabled={!form.companyName || createMut.isPending} style={{
                padding: '0.6rem 1.5rem', borderRadius: '8px', border: 'none', cursor: 'pointer',
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', fontWeight: 700,
              }}>{createMut.isPending ? 'Adding…' : 'Add'}</button>
              <button onClick={() => setShowForm(false)} style={{
                padding: '0.6rem 1rem', borderRadius: '8px', cursor: 'pointer',
                background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)', color: '#818cf8', fontWeight: 600,
              }}>Cancel</button>
            </div>
          </div>
        )}

        {/* Kanban board */}
        {isLoading ? (
          <div style={{ color: '#64748b', textAlign: 'center', padding: '4rem' }}>Loading applications…</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
            {COLUMNS.map(col => (
              <div
                key={col.key}
                onDragOver={e => e.preventDefault()}
                onDrop={e => handleDrop(col.key, e)}
                style={{
                  background: col.bg, border: `1px solid ${col.color}22`,
                  borderRadius: '16px', padding: '1.25rem', minHeight: '400px',
                  transition: 'box-shadow 0.2s',
                }}
              >
                {/* Column header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: col.color, display: 'inline-block' }} />
                  <span style={{ color: col.color, fontWeight: 700, fontSize: '0.9rem' }}>{col.label}</span>
                  <span style={{
                    marginLeft: 'auto', background: `${col.color}22`, color: col.color,
                    borderRadius: '999px', padding: '0.1rem 0.6rem', fontSize: '0.75rem', fontWeight: 700,
                  }}>{grouped[col.key].length}</span>
                </div>

                {/* Cards */}
                {grouped[col.key].map(app => (
                  <div
                    key={app.id}
                    draggable
                    onDragStart={() => setDragging(app.id)}
                    onDragEnd={() => setDragging(null)}
                    style={{ ...cardStyle(col.color), opacity: dragging === app.id ? 0.5 : 1 }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 6px 24px ${col.color}22` }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '0.95rem' }}>{app.companyName}</div>
                        {app.role && <div style={{ color: '#94a3b8', fontSize: '0.8rem', marginTop: '0.2rem' }}>{app.role}</div>}
                        {app.location && <div style={{ color: '#64748b', fontSize: '0.75rem' }}>📍 {app.location}</div>}
                        {app.package && <div style={{ color: '#10b981', fontSize: '0.75rem', fontWeight: 600 }}>💰 {app.package}</div>}
                        {app.appliedDate && (
                          <div style={{ color: '#475569', fontSize: '0.72rem', marginTop: '0.4rem' }}>
                            Applied: {new Date(app.appliedDate).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => deleteMut.mutate(app.id)}
                        style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: '1rem', padding: '0', lineHeight: 1 }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                        onMouseLeave={e => (e.currentTarget.style.color = '#475569')}
                      >×</button>
                    </div>
                    <button
                      onClick={() => navigate(`/applications/${app.id}`)}
                      style={{
                        marginTop: '0.75rem', width: '100%', padding: '0.4rem', borderRadius: '6px',
                        background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)',
                        color: '#818cf8', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
                      }}
                    >View Details →</button>
                  </div>
                ))}

                {grouped[col.key].length === 0 && (
                  <div style={{ color: '#334155', fontSize: '0.8rem', textAlign: 'center', marginTop: '2rem' }}>
                    No applications here
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

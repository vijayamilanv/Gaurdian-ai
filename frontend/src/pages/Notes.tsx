import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Navbar from '../components/Navbar'
import { api } from '../lib/api'

interface Note {
  id: string
  title: string | null
  content: string
  applicationId: string | null
  companyName: string | null
  createdAt: string
  updatedAt: string
}

export default function Notes() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ title: '', content: '' })
  const [search, setSearch] = useState('')

  const { data, isLoading } = useQuery<{ notes: Note[] }>({
    queryKey: ['notes'],
    queryFn: () => api.get('/notes').then(r => r.data),
  })

  const createMut = useMutation({
    mutationFn: (body: object) => api.post('/notes', body),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['notes'] }); setShowForm(false); setForm({ title: '', content: '' }) },
  })

  const patchMut = useMutation({
    mutationFn: ({ id, ...body }: { id: string } & object) => api.patch(`/notes/${id}`, body),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['notes'] }); setEditId(null) },
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/notes/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notes'] }),
  })

  const notes = (data?.notes ?? []).filter(n =>
    !search || n.title?.toLowerCase().includes(search.toLowerCase()) || n.content.toLowerCase().includes(search.toLowerCase())
  )

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '0.65rem 0.9rem', borderRadius: '8px',
    background: 'rgba(15,15,35,0.7)', border: '1px solid rgba(99,102,241,0.2)',
    color: '#e2e8f0', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box',
    fontFamily: 'Inter, system-ui, sans-serif',
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0f0f23', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <Navbar />
      <main style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem 1.5rem' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div>
            <h1 style={{ color: '#e2e8f0', fontSize: '1.6rem', fontWeight: 800, margin: 0 }}>
              My <span style={{ color: '#6366f1' }}>Notes</span>
            </h1>
            <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: '0.25rem' }}>{notes.length} notes</p>
          </div>
          <button onClick={() => setShowForm(true)} style={{
            padding: '0.7rem 1.4rem', borderRadius: '10px', border: 'none', cursor: 'pointer',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', fontWeight: 700,
            boxShadow: '0 4px 20px rgba(99,102,241,0.35)',
          }}>+ New Note</button>
        </div>

        {/* Search */}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Search notes…"
          style={{ ...inputStyle, marginBottom: '1.25rem' }}
        />

        {/* Create form */}
        {showForm && (
          <div style={{
            background: 'rgba(26,26,62,0.9)', border: '1px solid rgba(99,102,241,0.25)',
            borderRadius: '16px', padding: '1.5rem', marginBottom: '1.5rem',
          }}>
            <input
              value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Title (optional)"
              style={{ ...inputStyle, marginBottom: '0.75rem' }}
            />
            <textarea
              value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
              placeholder="Write your note in markdown… *bold*, # Heading, - list item"
              rows={6}
              style={{ ...inputStyle, resize: 'vertical', marginBottom: '0.75rem' }}
            />
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={() => createMut.mutate(form)} disabled={!form.content || createMut.isPending} style={{
                padding: '0.6rem 1.5rem', borderRadius: '8px', border: 'none', cursor: 'pointer',
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', fontWeight: 700,
              }}>{createMut.isPending ? 'Saving…' : 'Save Note'}</button>
              <button onClick={() => setShowForm(false)} style={{
                padding: '0.6rem 1rem', borderRadius: '8px', cursor: 'pointer',
                background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)', color: '#818cf8', fontWeight: 600,
              }}>Cancel</button>
            </div>
          </div>
        )}

        {/* Notes list */}
        {isLoading ? (
          <div style={{ color: '#64748b', textAlign: 'center', padding: '3rem' }}>Loading notes…</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {notes.length === 0 && (
              <div style={{ color: '#334155', textAlign: 'center', padding: '4rem', background: 'rgba(26,26,62,0.4)', borderRadius: '16px' }}>
                No notes yet — create your first one!
              </div>
            )}
            {notes.map(note => (
              <div key={note.id} style={{
                background: 'rgba(26,26,62,0.8)', border: '1px solid rgba(99,102,241,0.15)',
                borderRadius: '14px', padding: '1.25rem', backdropFilter: 'blur(8px)',
              }}>
                {editId === note.id ? (
                  <>
                    <input
                      defaultValue={note.title ?? ''}
                      id={`title-${note.id}`}
                      style={{ ...inputStyle, marginBottom: '0.6rem' }}
                    />
                    <textarea
                      defaultValue={note.content}
                      id={`content-${note.id}`}
                      rows={5}
                      style={{ ...inputStyle, resize: 'vertical', marginBottom: '0.6rem' }}
                    />
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button onClick={() => {
                        const title = (document.getElementById(`title-${note.id}`) as HTMLInputElement).value
                        const content = (document.getElementById(`content-${note.id}`) as HTMLTextAreaElement).value
                        patchMut.mutate({ id: note.id, title, content })
                      }} style={{
                        padding: '0.4rem 1rem', borderRadius: '6px', border: 'none', cursor: 'pointer',
                        background: 'rgba(99,102,241,0.6)', color: '#fff', fontWeight: 600, fontSize: '0.8rem',
                      }}>Save</button>
                      <button onClick={() => setEditId(null)} style={{
                        padding: '0.4rem 0.8rem', borderRadius: '6px', cursor: 'pointer',
                        background: 'transparent', border: '1px solid rgba(99,102,241,0.2)', color: '#64748b', fontSize: '0.8rem',
                      }}>Cancel</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        {note.title && <div style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '1rem', marginBottom: '0.4rem' }}>{note.title}</div>}
                        {note.companyName && (
                          <span style={{
                            background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)',
                            color: '#818cf8', borderRadius: '999px', padding: '0.15rem 0.6rem', fontSize: '0.72rem', fontWeight: 600,
                            display: 'inline-block', marginBottom: '0.5rem',
                          }}>📋 {note.companyName}</span>
                        )}
                        <div style={{
                          color: '#94a3b8', fontSize: '0.85rem', lineHeight: 1.6,
                          maxHeight: '80px', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {note.content}
                        </div>
                        <div style={{ color: '#475569', fontSize: '0.72rem', marginTop: '0.6rem' }}>
                          {new Date(note.updatedAt).toLocaleDateString()} · {new Date(note.updatedAt).toLocaleTimeString()}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.4rem', marginLeft: '0.75rem' }}>
                        <button onClick={() => setEditId(note.id)} style={{
                          background: 'none', border: '1px solid rgba(99,102,241,0.2)',
                          color: '#818cf8', borderRadius: '6px', padding: '0.3rem 0.6rem', cursor: 'pointer', fontSize: '0.75rem',
                        }}>✏ Edit</button>
                        <button onClick={() => deleteMut.mutate(note.id)} style={{
                          background: 'none', border: '1px solid rgba(239,68,68,0.2)',
                          color: '#f87171', borderRadius: '6px', padding: '0.3rem 0.6rem', cursor: 'pointer', fontSize: '0.75rem',
                        }}>🗑</button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

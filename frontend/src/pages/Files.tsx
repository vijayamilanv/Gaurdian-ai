import { useState, useEffect, useRef } from 'react'
import Navbar from '../components/Navbar'
import { api } from '../lib/api'

type FileType = 'resume' | 'certificate' | 'offer_letter' | 'resource' | 'other'

interface FileAsset {
  id: string
  label: string
  type: FileType
  mimeType: string | null
  sizeBytes: number | null
  folder: string | null
  isShared: boolean
  createdAt: string
  r2Key: string
}

const TYPE_META: Record<FileType, { label: string; icon: string; color: string }> = {
  resume:       { label: 'Resume',       icon: '📄', color: '#6366f1' },
  certificate:  { label: 'Certificate',  icon: '🏆', color: '#f59e0b' },
  offer_letter: { label: 'Offer Letter', icon: '📨', color: '#10b981' },
  resource:     { label: 'Resource',     icon: '📚', color: '#8b5cf6' },
  other:        { label: 'Other',        icon: '📎', color: '#64748b' },
}

function formatBytes(bytes: number | null) {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function FileCard({ file, onDelete, onDownload }: { file: FileAsset; onDelete: () => void; onDownload: () => void }) {
  const meta = TYPE_META[file.type] ?? TYPE_META.other
  return (
    <div style={{
      background: 'rgba(30,30,60,0.6)', border: '1px solid rgba(99,102,241,0.12)',
      borderRadius: '12px', padding: '1rem', display: 'flex', alignItems: 'center',
      gap: '0.75rem', transition: 'all 0.2s', cursor: 'pointer',
    }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(99,102,241,0.35)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(99,102,241,0.12)')}
    >
      <div style={{
        width: 44, height: 44, borderRadius: '10px', flexShrink: 0,
        background: `${meta.color}22`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem',
      }}>{meta.icon}</div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: '#e2e8f0', fontWeight: 600, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {file.label}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
          <span style={{
            background: `${meta.color}22`, color: meta.color,
            borderRadius: '4px', padding: '0.1rem 0.4rem', fontSize: '0.7rem', fontWeight: 600,
          }}>{meta.label}</span>
          {file.folder && (
            <span style={{ color: '#64748b', fontSize: '0.72rem' }}>📁 {file.folder}</span>
          )}
          <span style={{ color: '#475569', fontSize: '0.72rem' }}>{formatBytes(file.sizeBytes)}</span>
          <span style={{ color: '#475569', fontSize: '0.72rem' }}>
            {new Date(file.createdAt).toLocaleDateString()}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
        <button onClick={onDownload} title="Download" style={{
          background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)',
          borderRadius: '7px', padding: '0.35rem 0.6rem', cursor: 'pointer',
          color: '#818cf8', fontSize: '0.8rem', transition: 'all 0.15s',
        }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.2)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.1)')}
        >⬇ Download</button>
        <button onClick={onDelete} title="Delete" style={{
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)',
          borderRadius: '7px', padding: '0.35rem 0.6rem', cursor: 'pointer',
          color: '#f87171', fontSize: '0.8rem', transition: 'all 0.15s',
        }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.18)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.08)')}
        >🗑</button>
      </div>
    </div>
  )
}

export default function Files() {
  const [files, setFiles] = useState<FileAsset[]>([])
  const [r2On, setR2On] = useState(false)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [filter, setFilter] = useState<FileType | 'all'>('all')
  const [dragOver, setDragOver] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ label: '', type: 'resume' as FileType, folder: '' })
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [toast, setToast] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const loadFiles = async () => {
    try {
      setLoading(true)
      const res: any = await api.get('/files')
      setFiles(res.data.files)
      setR2On(res.data.r2Configured)
    } catch { showToast('Failed to load files') } finally { setLoading(false) }
  }

  useEffect(() => { loadFiles() }, [])

  const handleFilePick = (file: File) => {
    setPendingFile(file)
    setForm(f => ({ ...f, label: file.name.replace(/\.[^/.]+$/, '') }))
    setShowForm(true)
  }

  const handleUpload = async () => {
    if (!pendingFile || !form.label) return
    setUploading(true)
    try {
      // 1. Init upload — get presigned PUT URL
      const initRes: any = await api.post('/files/init-upload', {
        label:     form.label,
        type:      form.type,
        mimeType:  pendingFile.type || 'application/octet-stream',
        sizeBytes: pendingFile.size,
        folder:    form.folder || undefined,
      })
      const { uploadUrl, message } = initRes.data

      if (uploadUrl) {
        // 2. Direct PUT to R2
        await fetch(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': pendingFile.type || 'application/octet-stream' },
          body: pendingFile,
        })
        showToast('✅ File uploaded to R2!')
      } else {
        showToast(message || '✅ File metadata saved (R2 not configured — upload skipped)')
      }

      setShowForm(false)
      setPendingFile(null)
      setForm({ label: '', type: 'resume', folder: '' })
      loadFiles()
    } catch { showToast('❌ Upload failed') } finally { setUploading(false) }
  }

  const handleDownload = async (file: FileAsset) => {
    if (!r2On) { showToast('R2 not configured — no download available'); return }
    try {
      const res: any = await api.get(`/files/${file.id}/download`)
      const { downloadUrl } = res.data
      if (downloadUrl) window.open(downloadUrl, '_blank')
      else showToast('Download URL unavailable')
    } catch { showToast('❌ Could not generate download URL') }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this file?')) return
    try {
      await api.delete(`/files/${id}`)
      setFiles(f => f.filter(x => x.id !== id))
      showToast('🗑 File deleted')
    } catch { showToast('❌ Delete failed') }
  }

  const filtered = filter === 'all' ? files : files.filter(f => f.type === filter)

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f0f23 0%, #1a1a3e 50%, #0f0f23 100%)', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <Navbar />

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: '80px', right: '24px', zIndex: 1000,
          background: 'rgba(30,30,60,0.95)', border: '1px solid rgba(99,102,241,0.4)',
          borderRadius: '10px', padding: '0.75rem 1.25rem', color: '#e2e8f0',
          fontSize: '0.88rem', fontWeight: 500, backdropFilter: 'blur(12px)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        }}>{toast}</div>
      )}

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem 1.5rem' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, color: '#e2e8f0' }}>
              📁 File Manager
            </h1>
            <p style={{ margin: '0.25rem 0 0', color: '#64748b', fontSize: '0.85rem' }}>
              {files.length} file{files.length !== 1 ? 's' : ''} · {r2On ? '☁️ R2 connected' : '⚠️ R2 not configured — metadata only'}
            </p>
          </div>
          <button onClick={() => fileInputRef.current?.click()} style={{
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            border: 'none', borderRadius: '10px', padding: '0.6rem 1.25rem',
            color: '#fff', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer',
          }}>+ Upload File</button>
          <input ref={fileInputRef} type="file" hidden onChange={e => e.target.files?.[0] && handleFilePick(e.target.files[0])} />
        </div>

        {/* Drag and drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => {
            e.preventDefault(); setDragOver(false)
            const file = e.dataTransfer.files[0]
            if (file) handleFilePick(file)
          }}
          style={{
            border: `2px dashed ${dragOver ? '#6366f1' : 'rgba(99,102,241,0.25)'}`,
            borderRadius: '14px', padding: '1.5rem', textAlign: 'center',
            marginBottom: '1.25rem', transition: 'all 0.2s',
            background: dragOver ? 'rgba(99,102,241,0.08)' : 'rgba(15,15,35,0.3)',
          }}
        >
          <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>☁️</div>
          <div style={{ color: '#64748b', fontSize: '0.85rem' }}>
            Drag & drop a file here, or <span style={{ color: '#6366f1', cursor: 'pointer' }} onClick={() => fileInputRef.current?.click()}>browse</span>
          </div>
          <div style={{ color: '#475569', fontSize: '0.75rem', marginTop: '0.25rem' }}>Max 50 MB · PDF, DOCX, PNG, JPG, etc.</div>
        </div>

        {/* Upload form modal */}
        {showForm && pendingFile && (
          <div style={{
            background: 'rgba(20,20,50,0.97)', border: '1px solid rgba(99,102,241,0.3)',
            borderRadius: '14px', padding: '1.5rem', marginBottom: '1.25rem',
            backdropFilter: 'blur(12px)',
          }}>
            <h3 style={{ margin: '0 0 1rem', color: '#e2e8f0', fontSize: '1rem' }}>
              📎 {pendingFile.name} ({formatBytes(pendingFile.size)})
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <div>
                <label style={{ color: '#94a3b8', fontSize: '0.78rem', display: 'block', marginBottom: '0.3rem' }}>Label *</label>
                <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                  style={{ width: '100%', background: 'rgba(30,30,60,0.8)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '8px', padding: '0.5rem 0.75rem', color: '#e2e8f0', fontSize: '0.88rem', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ color: '#94a3b8', fontSize: '0.78rem', display: 'block', marginBottom: '0.3rem' }}>Type</label>
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as FileType }))}
                  style={{ width: '100%', background: 'rgba(30,30,60,0.8)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '8px', padding: '0.5rem 0.75rem', color: '#e2e8f0', fontSize: '0.88rem' }}>
                  {Object.entries(TYPE_META).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ color: '#94a3b8', fontSize: '0.78rem', display: 'block', marginBottom: '0.3rem' }}>Folder (optional)</label>
              <input value={form.folder} onChange={e => setForm(f => ({ ...f, folder: e.target.value }))}
                placeholder="e.g. Google, FAANG Prep..."
                style={{ width: '100%', background: 'rgba(30,30,60,0.8)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '8px', padding: '0.5rem 0.75rem', color: '#e2e8f0', fontSize: '0.88rem', boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowForm(false); setPendingFile(null) }}
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '0.5rem 1rem', color: '#94a3b8', cursor: 'pointer', fontSize: '0.85rem' }}>
                Cancel
              </button>
              <button onClick={handleUpload} disabled={uploading || !form.label}
                style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', border: 'none', borderRadius: '8px', padding: '0.5rem 1.25rem', color: '#fff', cursor: uploading ? 'wait' : 'pointer', fontSize: '0.85rem', fontWeight: 700, opacity: (!form.label || uploading) ? 0.6 : 1 }}>
                {uploading ? '⏳ Uploading…' : '⬆ Upload'}
              </button>
            </div>
          </div>
        )}

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          {(['all', ...Object.keys(TYPE_META)] as const).map(t => (
            <button key={t} onClick={() => setFilter(t as any)}
              style={{
                background: filter === t ? 'rgba(99,102,241,0.2)' : 'rgba(30,30,60,0.5)',
                border: `1px solid ${filter === t ? 'rgba(99,102,241,0.5)' : 'rgba(99,102,241,0.12)'}`,
                borderRadius: '8px', padding: '0.3rem 0.75rem',
                color: filter === t ? '#818cf8' : '#64748b',
                cursor: 'pointer', fontSize: '0.8rem', fontWeight: filter === t ? 700 : 400, transition: 'all 0.15s',
              }}>
              {t === 'all' ? `All (${files.length})` : `${TYPE_META[t as FileType].icon} ${TYPE_META[t as FileType].label} (${files.filter(f => f.type === t).length})`}
            </button>
          ))}
        </div>

        {/* File list */}
        {loading ? (
          <div style={{ textAlign: 'center', color: '#475569', padding: '3rem' }}>Loading files…</div>
        ) : filtered.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '4rem 2rem',
            border: '1px dashed rgba(99,102,241,0.15)', borderRadius: '14px',
            color: '#475569',
          }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📭</div>
            <div style={{ fontSize: '1rem', fontWeight: 600, color: '#64748b' }}>No files yet</div>
            <div style={{ fontSize: '0.82rem', marginTop: '0.3rem' }}>Drag & drop or click "Upload File" to get started</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {filtered.map(file => (
              <FileCard
                key={file.id}
                file={file}
                onDelete={() => handleDelete(file.id)}
                onDownload={() => handleDownload(file)}
              />
            ))}
          </div>
        )}

        {/* R2 setup notice */}
        {!r2On && (
          <div style={{
            marginTop: '1.5rem', padding: '1rem 1.25rem',
            background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
            borderRadius: '12px',
          }}>
            <div style={{ color: '#fbbf24', fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.4rem' }}>⚠️ Cloudflare R2 not configured</div>
            <div style={{ color: '#92400e', fontSize: '0.8rem', lineHeight: 1.6 }}>
              File metadata is saved to the database but actual file storage requires R2 credentials.<br />
              Add <code style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '4px', padding: '0.1rem 0.3rem' }}>R2_ENDPOINT</code>, <code style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '4px', padding: '0.1rem 0.3rem' }}>R2_BUCKET</code>, <code style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '4px', padding: '0.1rem 0.3rem' }}>R2_ACCESS_KEY_ID</code>, and <code style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '4px', padding: '0.1rem 0.3rem' }}>R2_SECRET_ACCESS_KEY</code> to <code style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '4px', padding: '0.1rem 0.3rem' }}>backend/.env</code>.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

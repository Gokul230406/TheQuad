import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { GitBranch, Search, Filter, ChevronRight } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

const STATUS_OPTIONS = [
  'all', 'failed', 'diagnosing', 'fix_pending', 'awaiting_approval',
  'fixing', 'fixed', 'failed_to_fix', 'retrying'
]

const CATEGORY_ICONS = {
  dependency_error: '📦', test_failure: '🧪', build_error: '🔨',
  config_error: '⚙️', network_error: '🌐', permissions_error: '🔒', unknown: '❓'
}

export default function History() {
  const navigate = useNavigate()
  const [events, setEvents] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')

  useEffect(() => { fetchEvents() }, [page, filter])

  async function fetchEvents() {
    setLoading(true)
    try {
      let url = `/api/dashboard/events?page=${page}&limit=20`
      if (filter !== 'all') url += `&status=${filter}`
      const r = await fetch(url)
      const d = await r.json()
      setEvents(d.events || [])
      setTotal(d.total || 0)
    } catch (_) {}
    setLoading(false)
  }

  const filtered = search
    ? events.filter(e =>
        e.repo_full_name?.toLowerCase().includes(search.toLowerCase()) ||
        e.root_cause?.toLowerCase().includes(search.toLowerCase()) ||
        e.branch?.toLowerCase().includes(search.toLowerCase())
      )
    : events

  const totalPages = Math.ceil(total / 20)

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">📋 Pipeline History</h1>
        <p className="page-subtitle">Complete log of all pipeline failures and remediation actions</p>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 200px' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="input" placeholder="Search repos, errors..."
            value={search} onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: 32 }} />
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {STATUS_OPTIONS.map(s => (
            <button key={s} onClick={() => { setFilter(s); setPage(1) }}
              className="btn btn-ghost btn-sm"
              style={{ textTransform: 'capitalize',
                ...(filter === s ? { background: 'rgba(124,58,237,0.2)', borderColor: 'var(--primary)', color: 'var(--primary-light)' } : {}) }}>
              {s.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Showing {filtered.length} of {total} events
        </span>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Repository</th>
              <th>Branch</th>
              <th>Category</th>
              <th>Root Cause</th>
              <th>Status</th>
              <th>Risk</th>
              <th>Time</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40 }}>
                <div className="spinner" style={{ margin: '0 auto' }} />
              </td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8}>
                <div className="empty-state">
                  <div className="empty-state-icon">📭</div>
                  <div className="empty-state-title">No events found</div>
                </div>
              </td></tr>
            ) : filtered.map(e => (
              <tr key={e.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/events/${e.id}`)}>
                <td>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{e.repo_full_name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono' }}>
                    #{e.commit_sha}
                  </div>
                </td>
                <td>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
                    <GitBranch size={12} />
                    <span style={{ color: 'var(--accent)' }}>{e.branch}</span>
                  </span>
                </td>
                <td>
                  {e.failure_category ? (
                    <span style={{ fontSize: 12 }}>
                      {CATEGORY_ICONS[e.failure_category] || '❓'} {e.failure_category?.replace(/_/g, ' ')}
                    </span>
                  ) : '—'}
                </td>
                <td style={{ maxWidth: 200 }}>
                  <div style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                    {e.root_cause || '—'}
                  </div>
                </td>
                <td><span className={`badge badge-${e.status}`}>{e.status?.replace(/_/g, ' ')}</span></td>
                <td>
                  {e.risk_level ? (
                    <span className={`badge risk-${e.risk_level}`}>
                      {e.risk_score != null ? `${Math.round(e.risk_score * 100)}% ` : ''}{e.risk_level}
                    </span>
                  ) : '—'}
                </td>
                <td style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                </td>
                <td><ChevronRight size={14} style={{ color: 'var(--text-muted)' }} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 20 }}>
          <button className="btn btn-ghost btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
          <span style={{ padding: '5px 14px', fontSize: 13, color: 'var(--text-secondary)' }}>
            {page} / {totalPages}
          </span>
          <button className="btn btn-ghost btn-sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
        </div>
      )}
    </div>
  )
}

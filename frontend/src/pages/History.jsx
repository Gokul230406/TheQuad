import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { GitBranch, Search, ChevronRight, Filter } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

const STATUS_OPTIONS = [
  'all', 'failed', 'diagnosing', 'fix_pending', 'awaiting_approval',
  'fixing', 'fixed', 'failed_to_fix', 'retrying'
]

const CATEGORY_ICONS = {
  dependency_error: '📦', test_failure: '🧪', build_error: '🔨',
  config_error: '⚙️', network_error: '🌐', permissions_error: '🔒', unknown: '❓'
}

const STATUS_COLORS = {
  fixed: 'var(--success-bright)',
  failed: 'var(--danger-bright)',
  diagnosing: 'var(--neon-blue)',
  fixing: 'var(--primary-bright)',
  awaiting_approval: 'var(--warning-bright)',
  retrying: 'var(--accent-bright)',
  failed_to_fix: 'var(--danger-bright)',
  fix_pending: 'var(--primary-light)',
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
    <div className="animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">
          <div className="page-title-icon">📋</div>
          Pipeline History
        </h1>
        <p className="page-subtitle">Complete audit log of all pipeline failures and AI remediation actions</p>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: 22, padding: '18px 20px' }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Search */}
          <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 0 }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', flexShrink: 0 }} />
            <input
              className="input"
              placeholder="Search repos, branches, errors…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft: 34 }}
            />
          </div>

          {/* Status filter pills */}
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
            <Filter size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            {STATUS_OPTIONS.map(s => (
              <button
                key={s}
                onClick={() => { setFilter(s); setPage(1) }}
                className="btn btn-ghost btn-sm"
                style={{
                  textTransform: 'capitalize',
                  letterSpacing: '0.01em',
                  ...(filter === s ? {
                    background: 'rgba(109,40,217,0.18)',
                    borderColor: 'rgba(139,92,246,0.5)',
                    color: 'var(--primary-light)',
                    boxShadow: '0 0 10px rgba(109,40,217,0.15)',
                  } : {})
                }}
              >
                {s.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--primary-bright)' }} />
          Showing <strong style={{ color: 'var(--text-secondary)' }}>{filtered.length}</strong> of <strong style={{ color: 'var(--text-secondary)' }}>{total}</strong> events
        </div>
      </div>

      {/* Table */}
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
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: 48 }}>
                  <div className="spinner" style={{ margin: '0 auto', width: 32, height: 32 }} />
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <div className="empty-state">
                    <div className="empty-state-icon">📭</div>
                    <div className="empty-state-title">No events found</div>
                    <div className="empty-state-text">Try adjusting your search or filter criteria</div>
                  </div>
                </td>
              </tr>
            ) : filtered.map((e, i) => (
              <tr
                key={e.id}
                style={{ cursor: 'pointer', animationDelay: `${i * 20}ms` }}
                onClick={() => navigate(`/events/${e.id}`)}
                className="animate-fade-in"
              >
                <td>
                  <div style={{ fontWeight: 700, fontSize: 13, letterSpacing: '-0.02em' }}>{e.repo_full_name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono', marginTop: 2 }}>
                    #{e.commit_sha?.slice(0, 7)}
                  </div>
                </td>
                <td>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
                    <GitBranch size={11} style={{ color: 'var(--text-muted)' }} />
                    <span style={{ color: 'var(--accent-light)' }}>{e.branch}</span>
                  </span>
                </td>
                <td>
                  {e.failure_category ? (
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {CATEGORY_ICONS[e.failure_category] || '❓'} {e.failure_category?.replace(/_/g, ' ')}
                    </span>
                  ) : <span style={{ color: 'var(--text-ghost)' }}>—</span>}
                </td>
                <td style={{ maxWidth: 200 }}>
                  <div style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                    {e.root_cause || <span style={{ color: 'var(--text-ghost)' }}>—</span>}
                  </div>
                </td>
                <td><span className={`badge badge-${e.status}`}>{e.status?.replace(/_/g, ' ')}</span></td>
                <td>
                  {e.risk_level ? (
                    <span className={`badge risk-${e.risk_level}`}>
                      {e.risk_score != null ? `${Math.round(e.risk_score * 100)}% ` : ''}{e.risk_level}
                    </span>
                  ) : <span style={{ color: 'var(--text-ghost)' }}>—</span>}
                </td>
                <td style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                </td>
                <td>
                  <div style={{
                    width: 28, height: 28, borderRadius: 8,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(139,92,246,0.05)',
                    border: '1px solid var(--border)',
                  }}>
                    <ChevronRight size={13} style={{ color: 'var(--text-muted)' }} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, marginTop: 24 }}>
          <button className="btn btn-ghost btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
            ← Prev
          </button>
          <span style={{
            padding: '6px 16px', fontSize: 13, color: 'var(--text-secondary)',
            background: 'rgba(0,0,0,0.2)', borderRadius: 100,
            border: '1px solid var(--border)',
          }}>
            {page} / {totalPages}
          </span>
          <button className="btn btn-ghost btn-sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
            Next →
          </button>
        </div>
      )}
    </div>
  )
}

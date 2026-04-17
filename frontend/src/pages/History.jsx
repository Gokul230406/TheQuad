import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Filter, GitBranch, Loader2, RefreshCw, Search } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'

const STATUS_OPTIONS = [
  'all',
  'failed',
  'diagnosing',
  'fix_pending',
  'awaiting_approval',
  'fixing',
  'fixed',
  'failed_to_fix',
  'retrying',
]

function statusVariant(status) {
  if (status === 'fixed') return 'success'
  if (status === 'awaiting_approval') return 'warning'
  if (status === 'failed' || status === 'failed_to_fix') return 'danger'
  return 'secondary'
}

function parseApiDate(value) {
  if (!value) return null
  const raw = String(value)
  const hasTimezone = /[zZ]$|[+-]\d{2}:\d{2}$/.test(raw)
  return new Date(hasTimezone ? raw : `${raw}Z`)
}

export default function History() {
  const navigate = useNavigate()
  const [events, setEvents] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetchEvents()
  }, [page, filter])

  async function fetchEvents() {
    setLoading(true)
    try {
      let url = `/api/dashboard/events?page=${page}&limit=20`
      if (filter !== 'all') url += `&status=${filter}`

      const response = await fetch(url)
      const data = await response.json()
      setEvents(data.events || [])
      setTotal(data.total || 0)
    } catch (_) {
      return
    } finally {
      setLoading(false)
    }
  }

  function rowKeyDown(event, id) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      navigate(`/events/${id}`)
    }
  }

  const filtered = search
    ? events.filter((event) =>
        event.repo_full_name?.toLowerCase().includes(search.toLowerCase()) ||
        event.root_cause?.toLowerCase().includes(search.toLowerCase()) ||
        event.branch?.toLowerCase().includes(search.toLowerCase())
      )
    : events

  const totalPages = Math.ceil(total / 20)

  return (
    <div className="page-stack">
      <div className="page-header-block">
        <div>
          <h1>Incident History</h1>
          <p>Auditable timeline of detected failures and remediation outcomes.</p>
        </div>
        <Badge variant="secondary">{total} total incidents</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            <Filter size={15} />
            Filters
          </CardTitle>
          <CardDescription>Search by repository, branch, or root-cause text.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="history-filters">
            <div className="history-filters-top">
              <div className="history-search-wrap">
                <Search size={14} />
                <input
                  className="ui-input"
                  placeholder="Search incidents"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Search incidents"
                />
              </div>
              <div className="history-toolbar-actions">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fetchEvents()}
                  disabled={loading}
                  aria-label="Refresh incident list"
                >
                  {loading ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
                  Refresh
                </Button>
              </div>
            </div>
            <div className="history-pills">
              {STATUS_OPTIONS.map((status) => (
                <Button
                  key={status}
                  variant={filter === status ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => {
                    setFilter(status)
                    setPage(1)
                  }}
                >
                  {status.replace(/_/g, ' ')}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Repository</th>
                <th>Branch</th>
                <th>Root cause</th>
                <th>Status</th>
                <th>Risk</th>
                <th>Time</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="table-empty">Loading incident timeline...</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="table-empty">No incidents match current filters.</td>
                </tr>
              ) : (
                filtered.map((event) => (
                  <tr
                    key={event.id}
                    className="table-click"
                    tabIndex={0}
                    role="link"
                    onClick={() => navigate(`/events/${event.id}`)}
                    onKeyDown={(e) => rowKeyDown(e, event.id)}
                    aria-label={`Open incident ${event.repo_full_name || 'unknown'}`}
                  >
                    <td>
                      <div className="history-repo-cell">
                        <strong>{event.repo_full_name}</strong>
                        <span>{event.commit_sha?.slice(0, 7)}</span>
                      </div>
                    </td>
                    <td>
                      <span className="history-branch-cell">
                        <GitBranch size={12} />
                        {event.branch}
                      </span>
                    </td>
                    <td>
                      <span className="history-root-cause-cell" title={event.root_cause || undefined}>
                        {event.root_cause || '-'}
                      </span>
                    </td>
                    <td>
                      <Badge variant={statusVariant(event.status)}>{String(event.status || 'unknown').replace(/_/g, ' ')}</Badge>
                    </td>
                    <td>{event.risk_level || '-'}</td>
                    <td>
                      {(() => {
                        const createdAt = parseApiDate(event.created_at)
                        if (!createdAt || Number.isNaN(createdAt.getTime())) return '-'
                        return formatDistanceToNow(createdAt, { addSuffix: true })
                      })()}
                    </td>
                    <td>
                      <ChevronRight size={14} aria-hidden />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="page-pagination">
          <Button variant="ghost" size="sm" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>
            Previous
          </Button>
          <span>{page} / {totalPages}</span>
          <Button variant="ghost" size="sm" disabled={page === totalPages} onClick={() => setPage((value) => value + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  )
}

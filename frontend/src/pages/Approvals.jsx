import React, { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleGauge,
  Clock3,
  Eye,
  FileCode2,
  Shield,
  ShieldCheck,
  XCircle,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import toast from 'react-hot-toast'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Progress } from '../components/ui/progress'

function riskVariant(level) {
  if (level === 'low') return 'success'
  if (level === 'high') return 'danger'
  return 'warning'
}

function parseApiDate(value) {
  if (!value) return null
  const raw = String(value)
  const hasTimezone = /[zZ]$|[+-]\d{2}:\d{2}$/.test(raw)
  return new Date(hasTimezone ? raw : `${raw}Z`)
}

function ApprovalItem({ approval, onApprove, onReject, onLoadDetails }) {
  const [expanded, setExpanded] = useState(false)
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [details, setDetails] = useState(null)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [scriptDraft, setScriptDraft] = useState(approval.fix_script || '')

  useEffect(() => {
    let active = true

    async function loadDetails() {
      if (!expanded || details) return
      setDetailsLoading(true)
      const payload = await onLoadDetails(approval.id)
      if (active && payload) setDetails(payload)
      if (active) setDetailsLoading(false)
    }

    loadDetails()

    return () => {
      active = false
    }
  }, [expanded, details, approval.id, onLoadDetails])

  const entry = details || approval

  useEffect(() => {
    setScriptDraft(entry.fix_script || '')
  }, [entry.fix_script])

  async function handleApprove() {
    setLoading(true)
    await onApprove(approval.id, note, scriptDraft)
    setLoading(false)
  }

  async function handleReject() {
    setLoading(true)
    await onReject(approval.id, note)
    setLoading(false)
  }

  const riskPct = Math.round((entry.risk_score || 0) * 100)
  const estimatedDuration = Math.round(entry.estimated_duration_seconds || 0)

  return (
    <Card className="approvals-item">
      <CardContent>
        <div className="approvals-item-head">
          <div>
            <div className="approvals-item-title-row">
              <h3>{approval.repo_full_name}</h3>
              <Badge variant="warning">Pending review</Badge>
            </div>
            <p>{entry.branch} · {entry.commit_sha?.slice(0, 7) || 'unknown'}</p>
          </div>
          <div className="approvals-item-meta">
            <Badge variant={riskVariant(entry.risk_level)}>
              <Shield size={11} />
              {entry.risk_level || 'unknown'} risk
            </Badge>
            <span>
              <Clock3 size={12} />
              {(() => {
                const createdAt = parseApiDate(entry.created_at)
                if (!createdAt || Number.isNaN(createdAt.getTime())) return 'unknown'
                return formatDistanceToNow(createdAt, { addSuffix: true })
              })()}
            </span>
          </div>
        </div>

        <div className="approvals-item-grid">
          <div>
            <p className="approvals-label">Root cause</p>
            <div className="approvals-surface">{entry.root_cause || 'No diagnosis available.'}</div>
          </div>
          <div>
            <p className="approvals-label">Proposed fix</p>
            <div className="approvals-surface">{entry.proposed_fix || 'No proposed fix available.'}</div>
          </div>
        </div>

        <div className="approvals-risk-row">
          <div>
            <p className="approvals-label">Risk score</p>
            <div className="approvals-risk-value">{riskPct}%</div>
          </div>
          <Progress value={riskPct} />
        </div>

        <div className="approvals-timing-row">
          <span className="approvals-label">Estimated execution time</span>
          <div className="approvals-timing-value">
            <Badge variant="outline">{entry.timing_level || 'unknown'}</Badge>
            <strong>{estimatedDuration > 0 ? `${estimatedDuration}s` : '--'}</strong>
          </div>
        </div>

        {entry.timing_reasons?.length > 0 && (
          <div className="approvals-risks">
            {entry.timing_reasons.map((reason, index) => (
              <div key={`timing-${index}`}>
                <Clock3 size={12} />
                <span>{reason}</span>
              </div>
            ))}
          </div>
        )}

        {entry.risk_reasons?.length > 0 && (
          <div className="approvals-risks">
            {entry.risk_reasons.map((reason, index) => (
              <div key={index}>
                <AlertTriangle size={12} />
                <span>{reason}</span>
              </div>
            ))}
          </div>
        )}

        <Button variant="ghost" size="sm" onClick={() => setExpanded((value) => !value)}>
          <Eye size={13} />
          {expanded ? 'Hide fix script' : 'View fix script'}
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </Button>

        {expanded && detailsLoading && <div className="approvals-loading-note">Loading latest approval details...</div>}
        {expanded && (
          <div className="approvals-script-editor">
            <div className="approvals-script-head">
              <span className="approvals-label">Proposed script (editable before approval)</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setScriptDraft(entry.fix_script || '')}
                disabled={loading}
              >
                Reset
              </Button>
            </div>
            <textarea
              className="approvals-code-editor"
              value={scriptDraft}
              onChange={(e) => setScriptDraft(e.target.value)}
              rows={10}
              spellCheck={false}
            />
          </div>
        )}

        <textarea
          className="ui-input"
          placeholder="Optional reviewer note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        <div className="approvals-actions">
          <Button variant="success" onClick={handleApprove} disabled={loading}>
            <CheckCircle2 size={14} />
            Approve and execute
          </Button>
          <Button variant="danger" onClick={handleReject} disabled={loading}>
            <XCircle size={14} />
            Reject
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export default function Approvals({ onCountChange }) {
  const [approvals, setApprovals] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('pending')
  const [detailsCache, setDetailsCache] = useState({})

  useEffect(() => {
    fetchApprovals()
  }, [tab])

  async function fetchApprovals() {
    setLoading(true)

    try {
      const url = tab === 'pending' ? '/api/approvals/pending' : '/api/approvals/history/all'
      const response = await fetch(url)
      const data = await response.json()
      setApprovals(data.approvals || [])
      if (tab === 'pending') onCountChange?.(data.total || 0)
    } catch (_) {
      setApprovals([])
    } finally {
      setLoading(false)
    }
  }

  const fetchApprovalDetails = useCallback(async (id) => {
    if (detailsCache[id]) return detailsCache[id]

    try {
      const response = await fetch(`/api/approvals/${id}`)
      if (!response.ok) return null
      const data = await response.json()
      setDetailsCache((prev) => ({ ...prev, [id]: data }))
      return data
    } catch (_) {
      return null
    }
  }, [detailsCache])

  async function handleApprove(id, note, editedFixScript) {
    try {
      const response = await fetch(`/api/approvals/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewer: 'admin', note, edited_fix_script: editedFixScript }),
      })

      if (response.ok) {
        toast.success('Fix approved and queued for execution.')
        fetchApprovals()
      } else {
        toast.error('Approval request failed.')
      }
    } catch (_) {
      toast.error('Network error while approving.')
    }
  }

  async function handleReject(id, note) {
    try {
      const response = await fetch(`/api/approvals/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewer: 'admin', note }),
      })

      if (response.ok) {
        toast.success('Fix rejected.')
        fetchApprovals()
      } else {
        toast.error('Reject request failed.')
      }
    } catch (_) {
      toast.error('Network error while rejecting.')
    }
  }

  const pending = approvals.filter((item) => item.status === 'pending')

  return (
    <div className="page-stack">
      <div className="page-header-block">
        <div>
          <h1>Human Approval Center</h1>
          <p>Review high-risk AI-generated fixes before they execute.</p>
        </div>
        <div className="page-header-badges">
          <Badge variant="secondary">
            <CircleGauge size={12} />
            Risk-controlled workflow
          </Badge>
          <Badge variant="outline">
            <ShieldCheck size={12} />
            {pending.length} pending
          </Badge>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            <FileCode2 size={16} />
            Approval policy
          </CardTitle>
          <CardDescription>
            Fixes with elevated execution risk require manual review against repository controls.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="page-tab-row">
        <Button variant={tab === 'pending' ? 'default' : 'ghost'} size="sm" onClick={() => setTab('pending')}>
          Pending {pending.length > 0 ? `(${pending.length})` : ''}
        </Button>
        <Button variant={tab === 'history' ? 'default' : 'ghost'} size="sm" onClick={() => setTab('history')}>
          Decision history
        </Button>
      </div>

      {loading ? (
        <div className="page-loader">Loading approvals...</div>
      ) : tab === 'pending' ? (
        pending.length === 0 ? (
          <Card>
            <CardContent className="empty-block">No pending approvals right now.</CardContent>
          </Card>
        ) : (
          pending.map((approval) => (
            <ApprovalItem
              key={approval.id}
              approval={approval}
              onApprove={handleApprove}
              onReject={handleReject}
              onLoadDetails={fetchApprovalDetails}
            />
          ))
        )
      ) : (
        <Card>
          <CardContent className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Repository</th>
                  <th>Branch</th>
                  <th>Risk</th>
                  <th>Timing</th>
                  <th>Status</th>
                  <th>Reviewer</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {approvals.map((item) => (
                  <tr key={item.id}>
                    <td>{item.repo_full_name}</td>
                    <td>{item.branch}</td>
                    <td>
                      <Badge variant={riskVariant(item.risk_level)}>{Math.round((item.risk_score || 0) * 100)}%</Badge>
                    </td>
                    <td>{item.estimated_duration_seconds ? `${Math.round(item.estimated_duration_seconds)}s` : '-'}</td>
                    <td>{item.status}</td>
                    <td>{item.reviewed_by || '-'}</td>
                    <td>
                      {(() => {
                        const createdAt = parseApiDate(item.created_at)
                        if (!createdAt || Number.isNaN(createdAt.getTime())) return '-'
                        return formatDistanceToNow(createdAt, { addSuffix: true })
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

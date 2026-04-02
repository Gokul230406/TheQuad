import React, { useState, useEffect } from 'react'
import { Shield, CheckCircle2, XCircle, AlertTriangle, ChevronDown, ChevronUp, Clock } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import toast from 'react-hot-toast'

function RiskMeter({ score }) {
  const percent = Math.round(score * 100)
  const color = score <= 0.3 ? 'var(--success)' : score <= 0.7 ? 'var(--warning)' : 'var(--danger)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ fontSize: 28, fontWeight: 800, color }}>{percent}</div>
      <div>
        <div className="risk-bar">
          <div className="risk-bar-fill" style={{ width: `${percent}%`, background: color }} />
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>RISK SCORE</div>
      </div>
    </div>
  )
}

function ApprovalCard({ approval, onApprove, onReject }) {
  const [expanded, setExpanded] = useState(false)
  const [reviewNote, setReviewNote] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleApprove() {
    setLoading(true)
    await onApprove(approval.id, reviewNote)
    setLoading(false)
  }
  async function handleReject() {
    setLoading(true)
    await onReject(approval.id, reviewNote)
    setLoading(false)
  }

  return (
    <div className="card animate-slide-in" style={{ marginBottom: 16, borderColor: 'rgba(245,158,11,0.3)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
        <div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
            <span className="badge badge-awaiting_approval"><AlertTriangle size={10} /> High Risk</span>
            <span className={`badge risk-${approval.risk_level}`}>
              <Shield size={10} /> {approval.risk_level}
            </span>
          </div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{approval.repo_full_name}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>
            Branch: <strong style={{ color: 'var(--accent)' }}>{approval.branch}</strong>
            &nbsp;• Commit: <code style={{ color: 'var(--primary-light)' }}>#{approval.commit_sha}</code>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <RiskMeter score={approval.risk_score} />
          <Clock size={14} style={{ color: 'var(--text-muted)' }} />
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {formatDistanceToNow(new Date(approval.created_at), { addSuffix: true })}
          </span>
        </div>
      </div>

      {/* Root Cause */}
      <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
        borderRadius: 8, padding: '10px 14px', marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--danger-light)', marginBottom: 4 }}>ROOT CAUSE</div>
        <div style={{ fontSize: 13 }}>{approval.root_cause}</div>
      </div>

      {/* Proposed Fix */}
      <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)',
        borderRadius: 8, padding: '10px 14px', marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--success-light)', marginBottom: 4 }}>PROPOSED FIX</div>
        <div style={{ fontSize: 13 }}>{approval.proposed_fix}</div>
      </div>

      {/* Risk Reasons */}
      {approval.risk_reasons?.length > 0 && (
        <div className="risk-reasons" style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--warning)', marginBottom: 4 }}>⚠️ RISK FACTORS</div>
          {approval.risk_reasons.map((r, i) => (
            <div key={i} className="risk-reason-item">{r}</div>
          ))}
        </div>
      )}

      {/* Expand fix script */}
      <button className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }}
        onClick={() => setExpanded(!expanded)}>
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        {expanded ? 'Hide' : 'View'} Fix Script
      </button>

      {expanded && (
        <div className="code-block" style={{ marginBottom: 12 }}>
          {approval.fix_script}
        </div>
      )}

      {/* Reviewer Note */}
      <textarea
        className="input"
        placeholder="Add review note (optional)..."
        value={reviewNote}
        onChange={e => setReviewNote(e.target.value)}
        style={{ resize: 'vertical', minHeight: 60, marginBottom: 12 }}
      />

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-success" onClick={handleApprove} disabled={loading}>
          <CheckCircle2 size={15} />
          {loading ? 'Processing...' : 'Approve & Execute'}
        </button>
        <button className="btn btn-danger" onClick={handleReject} disabled={loading}>
          <XCircle size={15} />
          Reject Fix
        </button>
      </div>
    </div>
  )
}

export default function Approvals({ onCountChange }) {
  const [approvals, setApprovals] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('pending')

  useEffect(() => { fetchApprovals() }, [tab])

  async function fetchApprovals() {
    setLoading(true)
    try {
      const url = tab === 'pending' ? '/api/approvals/pending' : '/api/approvals/history/all'
      const r = await fetch(url)
      const d = await r.json()
      setApprovals(d.approvals || [])
      if (tab === 'pending') onCountChange?.(d.total || 0)
    } catch (_) {}
    setLoading(false)
  }

  async function handleApprove(id, note) {
    try {
      const r = await fetch(`/api/approvals/${id}/approve`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewer: 'admin', note })
      })
      if (r.ok) {
        toast.success('Fix approved and executing in Docker!')
        fetchApprovals()
      } else {
        toast.error('Failed to approve fix')
      }
    } catch (_) { toast.error('Network error') }
  }

  async function handleReject(id, note) {
    try {
      const r = await fetch(`/api/approvals/${id}/reject`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewer: 'admin', note })
      })
      if (r.ok) {
        toast.success('Fix rejected')
        fetchApprovals()
      } else {
        toast.error('Failed to reject')
      }
    } catch (_) { toast.error('Network error') }
  }

  const pending = approvals.filter(a => a.status === 'pending')
  const history = approvals.filter(a => a.status !== 'pending')

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">
          🛡️ Human Approval Center
          {pending.length > 0 && (
            <span style={{ marginLeft: 12, background: 'var(--danger)', color: '#fff',
              borderRadius: '100px', padding: '2px 10px', fontSize: 16 }}>
              {pending.length}
            </span>
          )}
        </h1>
        <p className="page-subtitle">Review high-risk AI-generated fixes before execution</p>
      </div>

      {/* Info panel */}
      <div className="card" style={{ marginBottom: 24, borderColor: 'rgba(124,58,237,0.3)',
        background: 'rgba(124,58,237,0.05)' }}>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            <span style={{ color: 'var(--primary-light)', fontWeight: 700 }}>Guardian AI</span> evaluates
            every fix on 5 risk factors: script pattern analysis, branch protection, fix type,
            complexity, and LLM confidence. High-risk fixes (score &gt; 0.7) require your approval.
          </div>
        </div>
      </div>

      <div className="tabs">
        <button className={`tab ${tab === 'pending' ? 'active' : ''}`} onClick={() => setTab('pending')}>
          ⏳ Pending ({pending.length})
        </button>
        <button className={`tab ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>
          📋 History
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <div className="spinner" />
        </div>
      ) : tab === 'pending' ? (
        pending.length === 0 ? (
          <div className="empty-state">
            <CheckCircle2 size={48} style={{ opacity: 0.3, marginBottom: 16 }} />
            <div className="empty-state-title">No pending approvals</div>
            <div className="empty-state-text">All AI-generated fixes have been automatically applied or are awaiting new failures.</div>
          </div>
        ) : (
          pending.map(a => (
            <ApprovalCard key={a.id} approval={a} onApprove={handleApprove} onReject={handleReject} />
          ))
        )
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Repository</th>
                <th>Branch</th>
                <th>Root Cause</th>
                <th>Risk</th>
                <th>Status</th>
                <th>Reviewer</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {approvals.map(a => (
                <tr key={a.id}>
                  <td style={{ fontWeight: 600 }}>{a.repo_full_name}</td>
                  <td><code style={{ color: 'var(--accent)', fontSize: 12 }}>{a.branch}</code></td>
                  <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.root_cause}
                  </td>
                  <td>
                    <span className={`badge risk-${a.risk_level}`}>
                      {Math.round(a.risk_score * 100)}% {a.risk_level}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${a.status === 'approved' ? 'badge-fixed' : a.status === 'rejected' ? 'badge-failed' : 'badge-awaiting_approval'}`}>
                      {a.status}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{a.reviewed_by || '—'}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                    {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

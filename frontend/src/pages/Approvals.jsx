import React, { useState, useEffect } from 'react'
import { Shield, CheckCircle2, XCircle, AlertTriangle, ChevronDown, ChevronUp, Clock, Eye, ShieldAlert } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import toast from 'react-hot-toast'

function RiskMeter({ score }) {
  const percent = Math.round(score * 100)
  const color = score <= 0.3 ? 'var(--success-bright)' : score <= 0.7 ? 'var(--warning-bright)' : 'var(--danger-bright)'
  const glow = score <= 0.3 ? 'var(--success-glow)' : score <= 0.7 ? 'var(--warning-glow)' : 'var(--danger-glow)'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ position: 'relative', width: 56, height: 56 }}>
        {/* SVG ring */}
        <svg width="56" height="56" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="28" cy="28" r="22" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
          <circle
            cx="28" cy="28" r="22"
            fill="none"
            stroke={color}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={`${138 * percent / 100} 138`}
            style={{ filter: `drop-shadow(0 0 4px ${color})`, transition: 'stroke-dasharray 0.8s ease' }}
          />
        </svg>
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column',
        }}>
          <span style={{ fontSize: 14, fontWeight: 800, color, lineHeight: 1 }}>{percent}</span>
        </div>
      </div>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color, marginBottom: 2 }}>RISK SCORE</div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
          {percent <= 30 ? 'Low risk' : percent <= 70 ? 'Moderate' : 'High risk'}
        </div>
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

  const riskPct = Math.round(approval.risk_score * 100)

  return (
    <div className="card animate-slide-in" style={{
      marginBottom: 20,
      borderColor: 'rgba(245,158,11,0.25)',
      background: 'linear-gradient(145deg, rgba(10,22,40,0.98), rgba(25,15,5,0.95))',
    }}>
      {/* Top accent bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg, var(--warning-bright), var(--danger-bright))`,
        borderRadius: '18px 18px 0 0',
        boxShadow: '0 0 12px rgba(217,119,6,0.4)',
      }} />

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16, paddingTop: 6 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 7, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
            <span className="badge badge-awaiting_approval"><AlertTriangle size={9} /> Needs Approval</span>
            <span className={`badge risk-${approval.risk_level}`}><Shield size={9} /> {approval.risk_level}</span>
          </div>
          <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4, letterSpacing: '-0.03em' }}>{approval.repo_full_name}</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <span>Branch: <code style={{ color: 'var(--accent-light)' }}>{approval.branch}</code></span>
            <span>Commit: <code style={{ color: 'var(--primary-light)', fontFamily: 'JetBrains Mono', fontSize: 11 }}>#{approval.commit_sha?.slice(0, 7)}</code></span>
          </div>
        </div>
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 14 }}>
          <RiskMeter score={approval.risk_score} />
          <div style={{ textAlign: 'right' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)' }}>
              <Clock size={11} />
              {formatDistanceToNow(new Date(approval.created_at), { addSuffix: true })}
            </div>
          </div>
        </div>
      </div>

      {/* Root cause */}
      <div style={{
        background: 'rgba(220,38,38,0.06)',
        border: '1px solid rgba(220,38,38,0.15)',
        borderRadius: 12, padding: '12px 16px', marginBottom: 12
      }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--danger-light)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          🔍 Root Cause
        </div>
        <div style={{ fontSize: 13.5, color: 'var(--text-primary)', lineHeight: 1.6 }}>{approval.root_cause}</div>
      </div>

      {/* Proposed fix */}
      <div style={{
        background: 'rgba(5,150,105,0.06)',
        border: '1px solid rgba(5,150,105,0.15)',
        borderRadius: 12, padding: '12px 16px', marginBottom: 12
      }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--success-light)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          🔧 Proposed Fix
        </div>
        <div style={{ fontSize: 13.5, color: 'var(--text-primary)', lineHeight: 1.6 }}>{approval.proposed_fix}</div>
      </div>

      {/* Risk reasons */}
      {approval.risk_reasons?.length > 0 && (
        <div className="risk-reasons" style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--warning-bright)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            ⚠️ Risk Factors
          </div>
          {approval.risk_reasons.map((r, i) => (
            <div key={i} className="risk-reason-item">
              <AlertTriangle size={12} style={{ color: 'var(--warning-bright)', flexShrink: 0, marginTop: 1 }} />
              {r}
            </div>
          ))}
        </div>
      )}

      {/* Fix script toggle */}
      <button className="btn btn-ghost btn-sm" style={{ marginBottom: 12, gap: 7 }}
        onClick={() => setExpanded(!expanded)}>
        <Eye size={13} />
        {expanded ? 'Hide' : 'View'} Fix Script
        {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>

      {expanded && (
        <div className="code-block animate-slide-in" style={{ marginBottom: 14, fontSize: 11.5 }}>
          {approval.fix_script}
        </div>
      )}

      {/* Review note */}
      <textarea
        className="input"
        placeholder="Add a review note (optional)…"
        value={reviewNote}
        onChange={e => setReviewNote(e.target.value)}
        style={{ minHeight: 64, marginBottom: 14, fontSize: 13 }}
      />

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn btn-success" onClick={handleApprove} disabled={loading} style={{ flex: 1, padding: '11px 18px' }}>
          <CheckCircle2 size={15} />
          {loading ? 'Processing…' : 'Approve & Execute'}
        </button>
        <button className="btn btn-danger" onClick={handleReject} disabled={loading} style={{ padding: '11px 18px' }}>
          <XCircle size={15} />
          Reject
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
      if (r.ok) { toast.success('Fix approved & executing in Docker!'); fetchApprovals() }
      else toast.error('Failed to approve fix')
    } catch (_) { toast.error('Network error') }
  }

  async function handleReject(id, note) {
    try {
      const r = await fetch(`/api/approvals/${id}/reject`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewer: 'admin', note })
      })
      if (r.ok) { toast.success('Fix rejected'); fetchApprovals() }
      else toast.error('Failed to reject')
    } catch (_) { toast.error('Network error') }
  }

  const pending = approvals.filter(a => a.status === 'pending')
  const historyItems = approvals.filter(a => a.status !== 'pending')

  return (
    <div className="animate-fade-in">
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 className="page-title">
            <div className="page-title-icon">🛡️</div>
            Human Approval Center
            {pending.length > 0 && (
              <span style={{
                background: 'var(--grad-danger)',
                color: '#fff', borderRadius: '100px',
                padding: '3px 12px', fontSize: 14, fontWeight: 800,
                boxShadow: 'var(--shadow-glow-purple)',
              }}>{pending.length}</span>
            )}
          </h1>
          <p className="page-subtitle">Review high-risk AI-generated fixes before execution</p>
        </div>
      </div>

      {/* Guardian info panel */}
      <div className="card" style={{ marginBottom: 24, borderColor: 'rgba(139,92,246,0.25)', background: 'linear-gradient(135deg, rgba(109,40,217,0.07), rgba(8,145,178,0.04))' }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          <div style={{ width: 44, height: 44, borderRadius: 14, background: 'var(--grad-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0, boxShadow: 'var(--shadow-glow-purple)' }}>🛡️</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 5, letterSpacing: '-0.02em' }}>Guardian AI Evaluation</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              <span style={{ color: 'var(--primary-light)', fontWeight: 700 }}>Guardian AI</span> evaluates every fix on 5 risk dimensions:
              script pattern analysis, branch protection, fix type, complexity, and LLM confidence.
              Fixes scoring <span style={{ color: 'var(--danger-light)', fontWeight: 600 }}>&gt; 70%</span> require your approval.
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button className={`tab ${tab === 'pending' ? 'active' : ''}`} onClick={() => setTab('pending')}>
          ⏳ Pending {pending.length > 0 && `(${pending.length})`}
        </button>
        <button className={`tab ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>
          📋 History
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <div className="spinner" style={{ width: 40, height: 40 }} />
        </div>
      ) : tab === 'pending' ? (
        pending.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">✅</div>
            <div className="empty-state-title">No pending approvals</div>
            <div className="empty-state-text">All AI-generated fixes have been processed. New high-risk fixes will appear here automatically.</div>
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
                  <td style={{ fontWeight: 700 }}>{a.repo_full_name}</td>
                  <td><code style={{ color: 'var(--accent-light)', fontSize: 12 }}>{a.branch}</code></td>
                  <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)', fontSize: 12 }}>
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

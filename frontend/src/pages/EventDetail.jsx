import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, GitBranch, Shield, CheckCircle2, XCircle, RefreshCw, Clock } from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'

const FLOW_STEPS = [
  { key: 'failed', label: 'Failure Detected' },
  { key: 'diagnosing', label: 'Diagnosing' },
  { key: 'fix_pending', label: 'Fix Generated' },
  { key: 'awaiting_approval', label: 'Awaiting Approval', optional: true },
  { key: 'fixing', label: 'Executing Fix' },
  { key: 'retrying', label: 'Re-running CI' },
  { key: 'fixed', label: 'Fixed ✓' },
]

const STATUS_ORDER = ['failed', 'diagnosing', 'fix_pending', 'awaiting_approval', 'fixing', 'retrying', 'fixed']

function StepIndicator({ status }) {
  const currentIdx = STATUS_ORDER.indexOf(status)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 24 }}>
      {FLOW_STEPS.map((step, i) => {
        const stepIdx = STATUS_ORDER.indexOf(step.key)
        const isDone = currentIdx > stepIdx && currentIdx !== -1
        const isActive = step.key === status
        const isPending = stepIdx > currentIdx
        return (
          <React.Fragment key={step.key}>
            <div className={`flow-step ${isActive ? 'active' : isDone ? 'done' : 'pending'}`}>
              <span style={{ fontSize: 16 }}>
                {isDone ? '✅' : isActive ? '⚡' : step.optional ? '⬜' : '◯'}
              </span>
              <span>{step.label}</span>
            </div>
            {i < FLOW_STEPS.length - 1 && (
              <span className="flow-arrow" style={{ color: isDone ? 'var(--success)' : 'var(--text-muted)' }}>→</span>
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

export default function EventDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [event, setEvent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('overview')

  useEffect(() => {
    fetchEvent()
    const interval = setInterval(fetchEvent, 5000) // Poll for updates
    return () => clearInterval(interval)
  }, [id])

  async function fetchEvent() {
    try {
      const r = await fetch(`/api/dashboard/events/${id}`)
      if (r.ok) setEvent(await r.json())
    } catch (_) {}
    setLoading(false)
  }

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
      <div className="spinner" style={{ width: 40, height: 40 }} />
    </div>
  )
  if (!event) return (
    <div>
      <button className="btn btn-ghost" onClick={() => navigate(-1)}><ArrowLeft size={16} /> Back</button>
      <div className="empty-state" style={{ marginTop: 40 }}>Event not found</div>
    </div>
  )

  const riskColor = { low: 'var(--success)', medium: 'var(--warning)', high: 'var(--danger)' }[event.risk_level] || 'var(--text-muted)'
  const diagnosis = event.metadata?.diagnosis
  const fix = event.metadata?.fix
  const risk = event.metadata?.risk

  return (
    <div>
      {/* Back button + header */}
      <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)} style={{ marginBottom: 16 }}>
        <ArrowLeft size={14} /> Back to History
      </button>

      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 className="page-title" style={{ fontSize: 22 }}>{event.repo_full_name}</h1>
            <div style={{ display: 'flex', gap: 12, marginTop: 6, flexWrap: 'wrap', fontSize: 13, color: 'var(--text-secondary)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <GitBranch size={13} /> {event.branch}
              </span>
              <span style={{ fontFamily: 'JetBrains Mono', color: 'var(--accent)' }}>#{event.commit_sha}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <Clock size={13} /> {format(new Date(event.created_at), 'MMM d, yyyy HH:mm')}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className={`badge badge-${event.status}`} style={{ fontSize: 13, padding: '4px 12px' }}>
              {event.status?.replace(/_/g, ' ')}
            </span>
            {event.risk_level && (
              <span className={`badge risk-${event.risk_level}`}>
                <Shield size={11} /> {event.risk_level} risk
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Pipeline Flow */}
      <StepIndicator status={event.status} />

      {/* Commit message */}
      <div className="card" style={{ marginBottom: 20, padding: '12px 16px' }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Commit: </span>
        <span style={{ fontSize: 13 }}>{event.commit_message}</span>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button className={`tab ${tab === 'overview' ? 'active' : ''}`} onClick={() => setTab('overview')}>Overview</button>
        <button className={`tab ${tab === 'diagnosis' ? 'active' : ''}`} onClick={() => setTab('diagnosis')}>Diagnosis</button>
        <button className={`tab ${tab === 'fix' ? 'active' : ''}`} onClick={() => setTab('fix')}>Fix & Risk</button>
        <button className={`tab ${tab === 'logs' ? 'active' : ''}`} onClick={() => setTab('logs')}>Logs</button>
      </div>

      {/* Tab content */}
      {tab === 'overview' && (
        <div className="grid-2">
          <div className="card">
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Root Cause</div>
            {event.root_cause ? (
              <div style={{ fontSize: 14, lineHeight: 1.6 }}>{event.root_cause}</div>
            ) : <div style={{ color: 'var(--text-muted)' }}>Diagnosing...</div>}

            {event.failure_category && (
              <div style={{ marginTop: 12 }}>
                <span className="badge badge-diagnosing">{event.failure_category?.replace(/_/g, ' ')}</span>
              </div>
            )}
          </div>

          <div className="card">
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Proposed Fix</div>
            {event.proposed_fix ? (
              <div style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--success-light)' }}>{event.proposed_fix}</div>
            ) : <div style={{ color: 'var(--text-muted)' }}>Generating fix...</div>}
          </div>

          <div className="card">
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Outcomes</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--text-secondary)' }}>Fix Applied</span>
                <span>{event.fix_applied ? <CheckCircle2 size={16} color="var(--success)" /> : <XCircle size={16} color="var(--text-muted)" />}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--text-secondary)' }}>CI Re-run Triggered</span>
                <span>{event.re_run_triggered ? <CheckCircle2 size={16} color="var(--success)" /> : <XCircle size={16} color="var(--text-muted)" />}</span>
              </div>
            </div>
          </div>

          <div className="card">
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Risk Analysis</div>
            {event.risk_score != null ? (
              <>
                <div style={{ fontSize: 32, fontWeight: 800, color: riskColor }}>{Math.round(event.risk_score * 100)}<span style={{ fontSize: 16 }}>/100</span></div>
                <div className="risk-bar" style={{ marginTop: 8, width: '100%' }}>
                  <div className="risk-bar-fill" style={{ width: `${event.risk_score * 100}%`, background: riskColor }} />
                </div>
                <div style={{ marginTop: 8 }}>
                  <span className={`badge risk-${event.risk_level}`}>{event.risk_level} risk</span>
                </div>
              </>
            ) : <div style={{ color: 'var(--text-muted)' }}>—</div>}
          </div>
        </div>
      )}

      {tab === 'diagnosis' && diagnosis && (
        <div className="card">
          <div style={{ display: 'grid', gap: 16 }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4 }}>ROOT CAUSE</div>
              <div style={{ fontSize: 14 }}>{diagnosis.root_cause}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4 }}>SUMMARY</div>
              <div style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text-secondary)' }}>{diagnosis.summary}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4 }}>CONFIDENCE</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div className="risk-bar">
                  <div className="risk-bar-fill" style={{ width: `${(diagnosis.confidence || 0) * 100}%`, background: 'var(--primary)' }} />
                </div>
                <span style={{ fontSize: 14, fontWeight: 700 }}>{Math.round((diagnosis.confidence || 0) * 100)}%</span>
              </div>
            </div>
            {diagnosis.error_lines?.length > 0 && (
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 8 }}>KEY ERROR LINES</div>
                <div className="code-block">
                  {diagnosis.error_lines.join('\n')}
                </div>
              </div>
            )}
            {diagnosis.affected_files?.length > 0 && (
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 8 }}>AFFECTED FILES</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {diagnosis.affected_files.map((f, i) => (
                    <code key={i} style={{ fontSize: 12, background: 'rgba(0,0,0,0.3)', padding: '3px 8px', borderRadius: 6, color: 'var(--accent)' }}>{f}</code>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'fix' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {fix && (
            <div className="card">
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: 'var(--success-light)' }}>🔧 FIX SCRIPT</div>
              <div className="code-block">{fix.fix_script || event.fix_script || '—'}</div>
              {event.fix_output && (
                <>
                  <div style={{ fontSize: 13, fontWeight: 700, margin: '16px 0 8px', color: 'var(--accent)' }}>📤 EXECUTION OUTPUT</div>
                  <div className="code-block">{event.fix_output}</div>
                </>
              )}
            </div>
          )}
          {risk && (
            <div className="card">
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>🛡️ GUARDIAN RISK REPORT</div>
              <div className="grid-2">
                {Object.entries(risk.breakdown || {}).map(([key, val]) => (
                  <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                    <span style={{ color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{key.replace(/_/g, ' ')}</span>
                    <span style={{ fontWeight: 700 }}>{typeof val === 'number' ? `${Math.round(val * 100)}%` : val}</span>
                  </div>
                ))}
              </div>
              <div className="risk-reasons" style={{ marginTop: 12 }}>
                {(risk.reasons || []).map((r, i) => <div key={i} className="risk-reason-item">{r}</div>)}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'logs' && (
        <div className="card">
          <div style={{ marginBottom: 8, fontSize: 12, color: 'var(--text-muted)' }}>Raw pipeline logs</div>
          <div className="code-block" style={{ maxHeight: 500 }}>{event.raw_logs || 'No logs available'}</div>
        </div>
      )}
    </div>
  )
}

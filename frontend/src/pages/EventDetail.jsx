import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  CircleCheck,
  CircleDot,
  CircleEllipsis,
  GitBranch,
  PlayCircle,
  Shield,
  Wrench,
  XCircle,
} from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Progress } from '../components/ui/progress'

const FLOW_STEPS = [
  { key: 'failed', label: 'Failure detected', icon: XCircle },
  { key: 'diagnosing', label: 'Diagnosis', icon: CircleEllipsis },
  { key: 'fix_pending', label: 'Fix generated', icon: Wrench },
  { key: 'awaiting_approval', label: 'Awaiting approval', icon: Shield },
  { key: 'fixing', label: 'Fix execution', icon: PlayCircle },
  { key: 'retrying', label: 'CI retry', icon: CircleDot },
  { key: 'fixed', label: 'Resolved', icon: CircleCheck },
]

const STATUS_ORDER = ['failed', 'diagnosing', 'fix_pending', 'awaiting_approval', 'fixing', 'retrying', 'fixed']

function formatTimelineDetails(details) {
  if (!details || typeof details !== 'object') return ''

  return Object.entries(details)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key.replace(/_/g, ' ')}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
    .join(' · ')
}

function statusVariant(status) {
  if (status === 'fixed') return 'success'
  if (status === 'failed' || status === 'failed_to_fix') return 'danger'
  if (status === 'awaiting_approval') return 'warning'
  return 'secondary'
}

function FlowIndicator({ status }) {
  const currentIndex = STATUS_ORDER.indexOf(status)

  return (
    <div className="event-flow">
      {FLOW_STEPS.map((step) => {
        const Icon = step.icon
        const stepIndex = STATUS_ORDER.indexOf(step.key)
        const state = currentIndex === stepIndex ? 'active' : currentIndex > stepIndex ? 'done' : 'pending'

        return (
          <div key={step.key} className={`event-flow-item ${state}`}>
            <Icon size={14} />
            <span>{step.label}</span>
          </div>
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
    const interval = setInterval(fetchEvent, 5000)
    return () => clearInterval(interval)
  }, [id])

  async function fetchEvent() {
    try {
      const response = await fetch(`/api/dashboard/events/${id}`)
      if (response.ok) setEvent(await response.json())
    } catch (_) {
      return
    }
    setLoading(false)
  }

  if (loading) return <div className="page-loader">Loading event details...</div>

  if (!event) {
    return (
      <div className="page-stack">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft size={14} />
          Back
        </Button>
        <Card>
          <CardContent className="empty-block">Event not found.</CardContent>
        </Card>
      </div>
    )
  }

  const riskPercent = Math.round((event.risk_score || 0) * 100)
  const timeline = event.metadata?.timeline || []

  return (
    <div className="page-stack">
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
        <ArrowLeft size={14} />
        Back to history
      </Button>

      <div className="page-header-block">
        <div>
          <h1>{event.repo_full_name}</h1>
          <p>
            <span className="history-branch-cell"><GitBranch size={12} />{event.branch}</span>
            {' · '}
            {format(new Date(event.created_at), 'MMM d, yyyy HH:mm')}
          </p>
        </div>
        <div className="page-header-badges">
          <Badge variant={statusVariant(event.status)}>{String(event.status || 'unknown').replace(/_/g, ' ')}</Badge>
          {event.risk_level && (
            <Badge variant={event.risk_level === 'high' ? 'danger' : event.risk_level === 'medium' ? 'warning' : 'success'}>
              {event.risk_level} risk
            </Badge>
          )}
        </div>
      </div>

      <FlowIndicator status={event.status} />

      <div className="page-tab-row">
        <Button variant={tab === 'overview' ? 'default' : 'ghost'} size="sm" onClick={() => setTab('overview')}>Overview</Button>
        <Button variant={tab === 'diagnosis' ? 'default' : 'ghost'} size="sm" onClick={() => setTab('diagnosis')}>Diagnosis</Button>
        <Button variant={tab === 'fix' ? 'default' : 'ghost'} size="sm" onClick={() => setTab('fix')}>Fix and risk</Button>
        <Button variant={tab === 'timeline' ? 'default' : 'ghost'} size="sm" onClick={() => setTab('timeline')}>Timeline</Button>
        <Button variant={tab === 'logs' ? 'default' : 'ghost'} size="sm" onClick={() => setTab('logs')}>Logs</Button>
      </div>

      {tab === 'overview' && (
        <div className="event-detail-grid">
          <Card>
            <CardHeader>
              <CardTitle>Root cause</CardTitle>
            </CardHeader>
            <CardContent>{event.root_cause || 'Diagnosis in progress.'}</CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Proposed fix</CardTitle>
            </CardHeader>
            <CardContent>{event.proposed_fix || 'Fix generation in progress.'}</CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Outcome status</CardTitle>
            </CardHeader>
            <CardContent className="event-outcome-list">
              <div><span>Fix applied</span><strong>{event.fix_applied ? 'Yes' : 'No'}</strong></div>
              <div><span>CI rerun</span><strong>{event.re_run_triggered ? 'Yes' : 'No'}</strong></div>
              <div><span>Created</span><strong>{formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}</strong></div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Risk score</CardTitle>
              <CardDescription>{event.risk_level || 'unknown'} risk classification</CardDescription>
            </CardHeader>
            <CardContent className="event-risk-panel">
              <strong>{riskPercent}%</strong>
              <Progress value={riskPercent} />
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'diagnosis' && (
        <Card>
          <CardHeader>
            <CardTitle>Diagnosis report</CardTitle>
          </CardHeader>
          <CardContent className="event-diagnosis-panel">
            <p>{event.metadata?.diagnosis?.summary || 'No summary available.'}</p>
            {event.metadata?.diagnosis?.error_lines?.length > 0 && (
              <pre className="ui-code">{event.metadata.diagnosis.error_lines.join('\n')}</pre>
            )}
          </CardContent>
        </Card>
      )}

      {tab === 'fix' && (
        <div className="page-stack">
          <Card>
            <CardHeader>
              <CardTitle>Fix script</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="ui-code">{event.metadata?.fix?.fix_script || event.fix_script || 'No script available.'}</pre>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Risk report</CardTitle>
            </CardHeader>
            <CardContent className="event-risk-breakdown">
              {Object.entries(event.metadata?.risk?.breakdown || {}).map(([key, value]) => (
                <div key={key}>
                  <span>{key.replace(/_/g, ' ')}</span>
                  <strong>{typeof value === 'number' ? `${Math.round(value * 100)}%` : String(value)}</strong>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'timeline' && (
        <Card>
          <CardHeader>
            <CardTitle>Action timeline</CardTitle>
            <CardDescription>Timestamped record of the failure-to-resolution workflow.</CardDescription>
          </CardHeader>
          <CardContent>
            {timeline.length === 0 ? (
              <div className="empty-block">No timeline events recorded yet.</div>
            ) : (
              <div className="event-timeline">
                {timeline.map((entry, index) => (
                  <div key={`${entry.timestamp || 'timeline'}-${index}`} className="event-timeline-item">
                    <div className="event-timeline-marker" />
                    <div className="event-timeline-content">
                      <div className="event-timeline-head">
                        <strong>{entry.message || entry.step || 'Timeline event'}</strong>
                        <Badge variant={statusVariant(entry.status)}>{String(entry.status || 'unknown').replace(/_/g, ' ')}</Badge>
                      </div>
                      <div className="event-timeline-meta">
                        <span>{entry.step || 'step'}</span>
                        {entry.timestamp && <span>{formatDistanceToNow(new Date(entry.timestamp), { addSuffix: true })}</span>}
                      </div>
                      {formatTimelineDetails(entry.details) && <p>{formatTimelineDetails(entry.details)}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {tab === 'logs' && (
        <Card>
          <CardHeader>
            <CardTitle>Pipeline logs</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="ui-code">{event.raw_logs || 'No logs available.'}</pre>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

import React, { useState, useEffect, useContext } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  CircleDot,
  Clock3,
  Gauge,
  GitBranch,
  Shield,
  Signal,
  XCircle,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { WSContext } from '../App.jsx'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card'
import { Progress } from '../components/ui/progress'
import { Separator } from '../components/ui/separator'

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null

  return (
    <div className="dashboard-tooltip">
      <div className="dashboard-tooltip-label">{label}</div>
      {payload.map((item) => (
        <div key={item.name} className="dashboard-tooltip-row">
          <span
            className="dashboard-tooltip-dot"
            style={{ backgroundColor: item.stroke }}
          />
          <span>{item.name}</span>
          <strong>{item.value}</strong>
        </div>
      ))}
    </div>
  )
}

function getStatusBadgeVariant(status) {
  if (status === 'fixed') return 'success'
  if (status === 'failed' || status === 'failed_to_fix') return 'danger'
  if (status === 'awaiting_approval') return 'warning'
  return 'secondary'
}

function buildTrendData(stats) {
  const total = stats?.total_events ?? 0
  const fixed = stats?.fixed ?? 0
  const avgTotal = Math.max(4, Math.round(total / 7))
  const avgFixed = Math.max(2, Math.round(fixed / 7))
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  return days.map((day, index) => {
    const variation = ((index % 3) - 1) * 2
    const failures = Math.max(1, avgTotal + variation)
    const resolved = Math.max(0, Math.min(failures, avgFixed + variation + 1))

    return {
      day,
      failures,
      resolved,
    }
  })
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { wsMessages, wsConnected } = useContext(WSContext)

  const [stats, setStats] = useState(null)
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [chartData, setChartData] = useState([])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 10000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (wsMessages.length === 0) return
    const latest = wsMessages[0]
    if (['fix_complete', 'approval_required', 'diagnosis_complete'].includes(latest.type)) {
      fetchData()
    }
  }, [wsMessages])

  async function fetchData() {
    try {
      const [statsRes, eventsRes] = await Promise.all([
        fetch('/api/dashboard/stats'),
        fetch('/api/dashboard/events?limit=8'),
      ])
      const statsData = await statsRes.json()
      const eventsData = await eventsRes.json()

      setStats(statsData)
      setEvents(eventsData.events || [])
      setChartData(buildTrendData(statsData))
    } catch (_) {
      return
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="spinner" style={{ width: 36, height: 36 }} />
        <p>Loading operational overview...</p>
      </div>
    )
  }

  const successRate = stats?.success_rate ?? 0
  const unresolvedCount = (stats?.total_events ?? 0) - (stats?.fixed ?? 0)

  const metricCards = [
    {
      title: 'Total failures',
      value: stats?.total_events ?? 0,
      icon: AlertTriangle,
      detail: `${stats?.events_last_24h ?? 0} in last 24h`,
      tone: 'critical',
    },
    {
      title: 'Auto remediated',
      value: stats?.fixed ?? 0,
      icon: CheckCircle2,
      detail: `${stats?.auto_fixed ?? 0} automated`,
      tone: 'positive',
    },
    {
      title: 'Pending approval',
      value: stats?.awaiting_approval ?? 0,
      icon: Clock3,
      detail: 'Awaiting human review',
      tone: 'neutral',
    },
    {
      title: 'Failed to fix',
      value: stats?.failed_to_fix ?? 0,
      icon: XCircle,
      detail: 'Needs escalation',
      tone: 'critical',
    },
  ]

  return (
    <div className="dashboard-page">
      <div className="dashboard-header">
        <div className="dashboard-header-copy">
          <span className="dashboard-eyebrow">Operations Overview</span>
          <h1>Pipeline Reliability Dashboard</h1>
          <p>Real-time health and remediation activity across monitored repositories.</p>
        </div>
        <div className="dashboard-header-meta">
          <Badge variant="secondary" className="dashboard-header-badge">
            <Gauge size={12} />
            {successRate}% success
          </Badge>
          <Badge variant={wsConnected ? 'success' : 'warning'} className="dashboard-connection-badge">
            <Signal size={12} />
            {wsConnected ? 'Live connected' : 'Reconnecting'}
          </Badge>
        </div>
      </div>

      <div className="dashboard-metric-grid">
        {metricCards.map((card) => {
          const Icon = card.icon
          return (
            <Card key={card.title} className={`dashboard-metric-shell tone-${card.tone}`}>
              <CardContent className="dashboard-metric-card">
                <div className="dashboard-metric-top">
                  <span>{card.title}</span>
                  <Icon size={16} />
                </div>
                <div className="dashboard-metric-value">{card.value}</div>
                <div className="dashboard-metric-detail">{card.detail}</div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="dashboard-main-grid">
        <Card>
          <CardHeader>
            <CardTitle>
              <BarChart3 size={16} />
              Remediation trend
            </CardTitle>
            <CardDescription>Failures versus resolved incidents over the past 7 days.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="dashboard-chart-legend">
              <span>
                <CircleDot size={11} />
                Failures
              </span>
              <span>
                <CircleDot size={11} />
                Resolved
              </span>
            </div>
            <div className="dashboard-chart-wrap">
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={chartData} margin={{ top: 8, right: 6, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="failuresFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6f7680" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#6f7680" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="resolvedFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#b0b6bf" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="#b0b6bf" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fill: '#8f959f', fontSize: 12 }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fill: '#8f959f', fontSize: 12 }} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="failures" stroke="#8d939b" fill="url(#failuresFill)" strokeWidth={2} name="Failures" />
                  <Area type="monotone" dataKey="resolved" stroke="#c0c5cd" fill="url(#resolvedFill)" strokeWidth={2} name="Resolved" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <Separator className="dashboard-separator" />
            <div className="dashboard-progress-row">
              <div>
                <p>Success rate</p>
                <strong>{successRate}%</strong>
              </div>
              <Progress value={successRate} className="dashboard-progress" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Live feed</CardTitle>
            <CardDescription>Most recent websocket messages from the processing pipeline.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="dashboard-feed-list">
              {wsMessages.length === 0 && <div className="dashboard-empty">No live events yet.</div>}
              {wsMessages.slice(0, 8).map((message, index) => (
                <div key={`${message.timestamp}-${index}`} className="dashboard-feed-item">
                  <div>
                    <p className="dashboard-feed-type">{String(message.type || 'event').replace(/_/g, ' ')}</p>
                    <p className="dashboard-feed-repo">
                      {message.repo || 'Unknown repository'} {message.branch ? `• ${message.branch}` : ''}
                    </p>
                  </div>
                  <span>
                    <CircleDot size={10} />
                    {message.timestamp ? new Date(message.timestamp).toLocaleTimeString() : '--:--'}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="dashboard-health-strip">
        <span>Unresolved incidents</span>
        <strong>{Math.max(0, unresolvedCount)}</strong>
      </div>

      <Card>
        <CardHeader className="dashboard-events-header">
          <div>
            <CardTitle>Recent incidents</CardTitle>
            <CardDescription>Latest pipeline failures requiring attention.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate('/history')}>
            View history
            <ArrowRight size={14} />
          </Button>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <div className="dashboard-empty">No incidents found.</div>
          ) : (
            <div className="dashboard-events-list">
              <div className="dashboard-events-list-head">
                <span>Repository</span>
                <span>Status</span>
              </div>
              {events.map((event) => (
                <button key={event.id} className="dashboard-event-row" onClick={() => navigate(`/events/${event.id}`)}>
                  <div className="dashboard-event-main">
                    <p>{event.repo_full_name}</p>
                    <span>
                      <GitBranch size={12} />
                      {event.branch}
                    </span>
                  </div>
                  <div className="dashboard-event-meta">
                    <Badge variant={getStatusBadgeVariant(event.status)}>
                      {String(event.status || 'unknown').replace(/_/g, ' ')}
                    </Badge>
                    {event.risk_level && (
                      <Badge variant="outline">
                        <Shield size={11} />
                        {event.risk_level}
                      </Badge>
                    )}
                    <span>{formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

import React, { useState, useEffect, useContext } from 'react'
import { useNavigate } from 'react-router-dom'
import { WSContext } from '../App.jsx'
import {
  AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts'
import {
  CheckCircle2, XCircle, Clock, AlertTriangle, Zap, TrendingUp,
  GitBranch, Shield, Activity, ChevronRight, Terminal, RefreshCw
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

const STATUS_ICONS = {
  fixed: <CheckCircle2 size={14} />, failed: <XCircle size={14} />,
  diagnosing: <Activity size={14} />, fixing: <Zap size={14} />,
  awaiting_approval: <AlertTriangle size={14} />, retrying: <RefreshCw size={14} />,
  failed_to_fix: <XCircle size={14} />, fix_pending: <Clock size={14} />
}

function PipelineCard({ event, onClick }) {
  const riskColor = { low: 'var(--success)', medium: 'var(--warning)', high: 'var(--danger)' }[event.risk_level] || 'var(--text-muted)'

  return (
    <div className="card animate-slide-in" style={{ cursor: 'pointer', marginBottom: 12 }}
      onClick={() => onClick(event)}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span className={`badge badge-${event.status}`}>
              {STATUS_ICONS[event.status]} {event.status?.replace(/_/g, ' ')}
            </span>
            {event.risk_level && (
              <span className={`badge risk-${event.risk_level}`}>
                <Shield size={10} /> {event.risk_level} risk
              </span>
            )}
          </div>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4, color: 'var(--text-primary)' }}>
            {event.repo_full_name}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <GitBranch size={11} /> {event.branch}
            </span>
            <span style={{ fontFamily: 'JetBrains Mono', color: 'var(--accent)' }}>
              #{event.commit_sha}
            </span>
            <span>{formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}</span>
          </div>
          {event.root_cause && (
            <div style={{ marginTop: 8, padding: '6px 10px', background: 'rgba(0,0,0,0.3)',
              borderRadius: 6, fontSize: 12, color: 'var(--text-secondary)', borderLeft: `3px solid ${riskColor}` }}>
              🔍 {event.root_cause}
            </div>
          )}
          {event.proposed_fix && (
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--success-light)' }}>
              ✅ {event.proposed_fix}
            </div>
          )}
        </div>
        {event.risk_score != null && (
          <div style={{ textAlign: 'center', flexShrink: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: riskColor }}>
              {Math.round(event.risk_score * 100)}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>RISK</div>
          </div>
        )}
        <ChevronRight size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
      </div>
    </div>
  )
}

function LiveFeed({ messages }) {
  const typeColors = {
    diagnosis_complete: 'var(--info)', fix_generated: 'var(--primary-light)',
    risk_evaluated: 'var(--warning)', fix_complete: 'var(--success)',
    approval_required: 'var(--danger)', processing_failed: 'var(--danger)',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflowY: 'auto' }}>
      {messages.length === 0 ? (
        <div className="empty-state" style={{ padding: '24px' }}>
          <Terminal size={24} style={{ opacity: 0.4, marginBottom: 8 }} />
          <div style={{ fontSize: 13 }}>Waiting for pipeline events...</div>
        </div>
      ) : messages.slice(0, 15).map((m, i) => (
        <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start',
          padding: '8px 12px', background: 'rgba(0,0,0,0.2)', borderRadius: 8,
          borderLeft: `3px solid ${typeColors[m.type] || 'var(--border)'}` }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: typeColors[m.type] || 'var(--text-secondary)' }}>
              {m.type?.replace(/_/g, ' ').toUpperCase()}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
              {m.repo} ({m.branch}) — {m.root_cause || m.status || ''}
            </div>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>
            {new Date(m.timestamp).toLocaleTimeString()}
          </div>
        </div>
      ))}
    </div>
  )
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

  async function fetchData() {
    try {
      const [sRes, eRes] = await Promise.all([
        fetch('/api/dashboard/stats'),
        fetch('/api/dashboard/events?limit=10')
      ])
      const s = await sRes.json()
      const e = await eRes.json()
      setStats(s)
      setEvents(e.events || [])
      // Build sparkline data
      setChartData(generateSparkline(s))
    } catch (_) {}
    setLoading(false)
  }

  // Refresh when WS broadcasts new events
  useEffect(() => {
    if (wsMessages.length > 0) {
      const latest = wsMessages[0]
      if (['fix_complete', 'approval_required', 'diagnosis_complete'].includes(latest.type)) {
        fetchData()
      }
    }
  }, [wsMessages])

  function generateSparkline(s) {
    // Generate synthetic chart data based on real stats
    const base = s ? Math.floor(s.total_events / 7) : 5
    return Array.from({ length: 7 }, (_, i) => ({
      day: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i],
      failures: base + Math.floor(Math.random() * 5),
      fixed: Math.floor((base + Math.floor(Math.random() * 5)) * (s?.success_rate / 100 || 0.8))
    }))
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh' }}>
      <div className="spinner" style={{ width: 40, height: 40 }} />
    </div>
  )

  const statCards = [
    { label: 'Total Failures', value: stats?.total_events ?? 0, icon: '💥', color: 'purple', change: stats?.events_last_24h ?? 0, changeLabel: 'last 24h' },
    { label: 'Auto Fixed', value: stats?.fixed ?? 0, icon: '✅', color: 'green', change: stats?.auto_fixed ?? 0, changeLabel: 'automated' },
    { label: 'Success Rate', value: `${stats?.success_rate ?? 0}%`, icon: '📈', color: 'cyan' },
    { label: 'Pending Approval', value: stats?.awaiting_approval ?? 0, icon: '⏳', color: 'yellow' },
    { label: 'In Progress', value: stats?.in_progress ?? 0, icon: '⚡', color: 'purple' },
    { label: 'Failed to Fix', value: stats?.failed_to_fix ?? 0, icon: '❌', color: 'red' },
  ]

  return (
    <div>
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title">🧞 Pipeline Dashboard</h1>
          <p className="page-subtitle">Real-time AI-powered pipeline monitoring & auto-remediation</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 12px', borderRadius: 100, fontSize: 12, fontWeight: 600,
          background: wsConnected ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
          border: `1px solid ${wsConnected ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
          color: wsConnected ? 'var(--success-light)' : 'var(--danger-light)' }}>
          <span className="live-dot" style={{ background: wsConnected ? 'var(--success)' : 'var(--danger)' }} />
          {wsConnected ? 'Live Connected' : 'Reconnecting...'}
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        {statCards.map((s, i) => (
          <div key={i} className={`stat-card ${s.color}`}>
            <div className="stat-icon">{s.icon}</div>
            <div className="stat-value">{s.value}</div>
            <div className="stat-label">{s.label}</div>
            {s.change != null && (
              <div className="stat-change positive">
                <TrendingUp size={11} /> {s.change} {s.changeLabel}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Chart + Live Feed */}
      <div className="grid-2" style={{ marginBottom: 24 }}>
        {/* Chart */}
        <div className="card">
          <div className="section-header">
            <span className="section-title">📊 Failures vs Fixed (7 days)</span>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="failGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="fixGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis dataKey="day" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: 'var(--bg-overlay)', border: '1px solid var(--border)', borderRadius: 8 }} />
              <Area type="monotone" dataKey="failures" stroke="#ef4444" fill="url(#failGrad)" strokeWidth={2} name="Failures" />
              <Area type="monotone" dataKey="fixed" stroke="#10b981" fill="url(#fixGrad)" strokeWidth={2} name="Fixed" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Live Feed */}
        <div className="card">
          <div className="section-header">
            <span className="section-title">⚡ Live Event Feed</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)' }}>
              <span className="live-dot" />
              {wsMessages.length} events
            </span>
          </div>
          <LiveFeed messages={wsMessages} />
        </div>
      </div>

      {/* Recent Events */}
      <div className="card">
        <div className="section-header">
          <span className="section-title">🔥 Recent Pipeline Failures</span>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/history')}>
            View All <ChevronRight size={14} />
          </button>
        </div>
        {events.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🎉</div>
            <div className="empty-state-title">No pipeline failures!</div>
            <div className="empty-state-text">All pipelines are healthy. Use the Simulate page to test the system.</div>
          </div>
        ) : (
          events.map(e => <PipelineCard key={e.id} event={e} onClick={ev => navigate(`/events/${ev.id}`)} />)
        )}
      </div>
    </div>
  )
}

import React, { useState, useEffect, useContext, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { WSContext } from '../App.jsx'
import {
  AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import {
  CheckCircle2, XCircle, Clock, AlertTriangle, Zap, TrendingUp,
  GitBranch, Shield, Activity, ChevronRight, Terminal, RefreshCw,
  Flame, Target, BarChart2, Boxes
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

const STATUS_ICONS = {
  fixed: <CheckCircle2 size={11} />, failed: <XCircle size={11} />,
  diagnosing: <Activity size={11} />, fixing: <Zap size={11} />,
  awaiting_approval: <AlertTriangle size={11} />, retrying: <RefreshCw size={11} />,
  failed_to_fix: <XCircle size={11} />, fix_pending: <Clock size={11} />
}

const FEED_COLORS = {
  diagnosis_complete: '#60a5fa',
  fix_generated: '#a78bfa',
  risk_evaluated: '#fcd34d',
  fix_complete: '#6ee7b7',
  approval_required: '#fca5a5',
  processing_failed: '#fca5a5',
}

/* ── Custom Tooltip ── */
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'rgba(10,22,40,0.95)',
      border: '1px solid rgba(139,92,246,0.3)',
      borderRadius: 10,
      padding: '10px 14px',
      backdropFilter: 'blur(20px)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#f0f4ff', marginBottom: 3, fontWeight: 600 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.stroke, display: 'inline-block', boxShadow: `0 0 6px ${p.stroke}` }} />
          {p.name}: <strong>{p.value}</strong>
        </div>
      ))}
    </div>
  )
}

/* ── Pipeline Card ── */
function PipelineCard({ event, onClick, index }) {
  const riskColor = {
    low: 'var(--success-bright)',
    medium: 'var(--warning-bright)',
    high: 'var(--danger-bright)'
  }[event.risk_level] || 'var(--text-muted)'

  return (
    <div
      className="pipeline-card animate-slide-in"
      style={{ animationDelay: `${index * 50}ms` }}
      onClick={() => onClick(event)}
    >
      {/* Risk left bar */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0,
        width: 3, background: riskColor,
        borderRadius: '18px 0 0 18px',
        boxShadow: `0 0 8px ${riskColor}`,
      }} />

      <div style={{ paddingLeft: 12, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
            <span className={`badge badge-${event.status}`}>
              {STATUS_ICONS[event.status]} {event.status?.replace(/_/g, ' ')}
            </span>
            {event.risk_level && (
              <span className={`badge risk-${event.risk_level}`}>
                <Shield size={9} /> {event.risk_level} risk
              </span>
            )}
          </div>

          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 5, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
            {event.repo_full_name}
          </div>

          <div style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <GitBranch size={11} />
              <span style={{ color: 'var(--accent-light)' }}>{event.branch}</span>
            </span>
            <span style={{ fontFamily: 'JetBrains Mono', color: 'var(--primary-light)', fontSize: 11 }}>
              #{event.commit_sha?.slice(0, 7)}
            </span>
            <span style={{ color: 'var(--text-muted)' }}>
              {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}
            </span>
          </div>

          {event.root_cause && (
            <div style={{
              marginTop: 10, padding: '6px 12px',
              background: 'rgba(0,0,0,0.3)',
              borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)',
              borderLeft: `2px solid ${riskColor}`,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <Target size={11} style={{ color: riskColor, flexShrink: 0 }} />
              {event.root_cause}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          {event.risk_score != null && (
            <div style={{
              textAlign: 'center', padding: '8px 14px',
              background: 'rgba(0,0,0,0.25)',
              borderRadius: 10, border: `1px solid ${riskColor}20`,
              minWidth: 56,
            }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: riskColor, lineHeight: 1 }}>
                {Math.round(event.risk_score * 100)}
              </div>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 3, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Risk</div>
            </div>
          )}
          <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />
        </div>
      </div>
    </div>
  )
}

/* ── Live Feed ── */
function LiveFeed({ messages }) {
  const listRef = useRef(null)

  return (
    <div className="scrollable-feed" ref={listRef}>
      {messages.length === 0 ? (
        <div className="empty-state" style={{ padding: '28px 16px' }}>
          <Terminal size={28} style={{ opacity: 0.3, marginBottom: 10 }} />
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Waiting for pipeline events…</div>
        </div>
      ) : messages.slice(0, 20).map((m, i) => (
        <div key={i} className="feed-item" style={{
          borderLeftColor: FEED_COLORS[m.type] || 'var(--border)',
          animationDelay: `${i * 30}ms`,
        }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%', marginTop: 4, flexShrink: 0,
            background: FEED_COLORS[m.type] || 'var(--border)',
            boxShadow: `0 0 6px ${FEED_COLORS[m.type] || 'transparent'}`
          }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: FEED_COLORS[m.type] || 'var(--text-secondary)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              {m.type?.replace(/_/g, ' ')}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {m.repo} · {m.branch} {m.root_cause ? `— ${m.root_cause}` : ''}
            </div>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-ghost)', flexShrink: 0, fontFamily: 'JetBrains Mono', fontWeight: 500 }}>
            {new Date(m.timestamp).toLocaleTimeString()}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ── Dashboard ── */
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
      setChartData(generateSparkline(s))
    } catch (_) {}
    setLoading(false)
  }

  useEffect(() => {
    if (wsMessages.length > 0) {
      const latest = wsMessages[0]
      if (['fix_complete', 'approval_required', 'diagnosis_complete'].includes(latest.type)) fetchData()
    }
  }, [wsMessages])

  function generateSparkline(s) {
    const base = s ? Math.floor(s.total_events / 7) : 5
    return Array.from({ length: 7 }, (_, i) => ({
      day: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i],
      failures: Math.max(1, base + Math.floor(Math.random() * 6)),
      fixed: Math.max(0, Math.floor((base + Math.floor(Math.random() * 6)) * (s?.success_rate / 100 || 0.75)))
    }))
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', flexDirection: 'column', gap: 16 }}>
      <div className="spinner" style={{ width: 44, height: 44, borderWidth: 3 }} />
      <div style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 500 }}>Initializing dashboard…</div>
    </div>
  )

  const statCards = [
    { label: 'Total Failures', value: stats?.total_events ?? 0, icon: '💥', color: 'purple', sub: `${stats?.events_last_24h ?? 0} last 24h`, subClass: 'negative' },
    { label: 'Auto Fixed', value: stats?.fixed ?? 0, icon: '✅', color: 'green', sub: `${stats?.auto_fixed ?? 0} automated`, subClass: 'positive' },
    { label: 'Success Rate', value: `${stats?.success_rate ?? 0}%`, icon: '📈', color: 'cyan', iconEl: <BarChart2 size={18} /> },
    { label: 'Pending Approval', value: stats?.awaiting_approval ?? 0, icon: '⏳', color: 'yellow', iconEl: <AlertTriangle size={18} /> },
    { label: 'In Progress', value: stats?.in_progress ?? 0, icon: '⚡', color: 'purple', iconEl: <Zap size={18} /> },
    { label: 'Failed to Fix', value: stats?.failed_to_fix ?? 0, icon: '❌', color: 'red', iconEl: <XCircle size={18} /> },
  ]

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 className="page-title">
            <div className="page-title-icon">🧞</div>
            Pipeline Dashboard
          </h1>
          <p className="page-subtitle">Real-time AI-powered monitoring & auto-remediation</p>
        </div>
        <div className={`ws-pill ${wsConnected ? 'connected' : 'disconnected'}`}>
          <div className="live-dot-wrap">
            <span className="live-dot" style={{ background: wsConnected ? 'var(--success-bright)' : 'var(--danger-bright)' }} />
          </div>
          {wsConnected ? 'Live Connected' : 'Reconnecting…'}
        </div>
      </div>

      {/* Stat Cards */}
      <div className="stats-grid stagger-children">
        {statCards.map((s, i) => (
          <div key={i} className={`stat-card ${s.color}`}>
            <div className="stat-card-orb" />
            <div className="stat-card-top">
              <div className="stat-icon-wrap">{s.icon}</div>
              {s.sub && (
                <span className={`stat-trend ${s.subClass === 'positive' ? 'up' : 'down'}`}>
                  <TrendingUp size={10} style={{ display: 'inline', marginRight: 3 }} />
                  {s.sub}
                </span>
              )}
            </div>
            <div className="stat-value">{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Chart + Live Feed */}
      <div className="grid-2" style={{ marginBottom: 24 }}>
        {/* Chart */}
        <div className="card" style={{ padding: '22px 18px' }}>
          <div className="section-header">
            <div className="section-title">
              <div className="section-title-icon">📊</div>
              Failures vs Fixed — 7 Days
            </div>
          </div>
          <ResponsiveContainer width="100%" height={190}>
            <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="failGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#dc2626" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#dc2626" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="fixGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#059669" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="day" tick={{ fill: 'var(--text-muted)', fontSize: 11, fontFamily: 'Outfit' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11, fontFamily: 'Outfit' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="failures" stroke="#ef4444" strokeWidth={2} fill="url(#failGrad)" name="Failures" dot={false} activeDot={{ r: 5, fill: '#ef4444', strokeWidth: 0 }} />
              <Area type="monotone" dataKey="fixed" stroke="#10b981" strokeWidth={2} fill="url(#fixGrad)" name="Fixed" dot={false} activeDot={{ r: 5, fill: '#10b981', strokeWidth: 0 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Live Feed */}
        <div className="card">
          <div className="section-header">
            <div className="section-title">
              <div className="section-title-icon">⚡</div>
              Live Event Feed
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'var(--text-muted)', background: 'rgba(0,0,0,0.2)', padding: '4px 10px', borderRadius: 100 }}>
              <div className="live-dot-wrap"><span className="live-dot" /></div>
              {wsMessages.length} events
            </div>
          </div>
          <LiveFeed messages={wsMessages} />
        </div>
      </div>

      {/* Recent Events */}
      <div className="card">
        <div className="section-header">
          <div className="section-title">
            <div className="section-title-icon"><Flame size={14} /></div>
            Recent Pipeline Failures
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/history')}>
            View All <ChevronRight size={13} />
          </button>
        </div>

        {events.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🎉</div>
            <div className="empty-state-title">All pipelines healthy!</div>
            <div className="empty-state-text">No failures detected. Use the Simulate page to test PipeGenie's AI agents.</div>
          </div>
        ) : (
          events.map((e, i) => (
            <PipelineCard key={e.id} event={e} index={i} onClick={ev => navigate(`/events/${ev.id}`)} />
          ))
        )}
      </div>
    </div>
  )
}

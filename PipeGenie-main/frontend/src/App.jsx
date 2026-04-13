import React, { useState, useEffect, useRef } from 'react'
import { BrowserRouter, Routes, Route, NavLink, useNavigate } from 'react-router-dom'
import Dashboard from './pages/Dashboard.jsx'
import Approvals from './pages/Approvals.jsx'
import History from './pages/History.jsx'
import Simulate from './pages/Simulate.jsx'
import EventDetail from './pages/EventDetail.jsx'
import { LayoutDashboard, ShieldAlert, History as HistoryIcon, Zap, Settings, Activity } from 'lucide-react'
import Background3D from './components/Background3D.jsx'

const WS_URL = `ws://localhost:8000/api/dashboard/ws`

export const WSContext = React.createContext(null)

function Sidebar({ pendingCount, liveCount }) {
  const navItems = [
    { path: '/', icon: <LayoutDashboard size={18} />, label: 'Dashboard', exact: true },
    { path: '/approvals', icon: <ShieldAlert size={18} />, label: 'Approvals', badge: pendingCount },
    { path: '/history', icon: <HistoryIcon size={18} />, label: 'History' },
    { path: '/simulate', icon: <Zap size={18} />, label: 'Simulate' },
  ]

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">🧞</div>
        <span className="sidebar-logo-text">PipeGenie</span>
      </div>

      {/* Live indicator */}
      <div style={{ padding: '8px 12px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8,
        background: 'rgba(16,185,129,0.08)', borderRadius: 8, border: '1px solid rgba(16,185,129,0.2)' }}>
        <span className="live-dot" />
        <span style={{ fontSize: 12, color: 'var(--success-light)' }}>
          {liveCount > 0 ? `${liveCount} processing` : 'System live'}
        </span>
      </div>

      <nav className="sidebar-nav">
        {navItems.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.exact}
            className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
          >
            {item.icon}
            <span>{item.label}</span>
            {item.badge > 0 && (
              <span style={{ marginLeft: 'auto', background: 'var(--danger)', color: '#fff',
                borderRadius: '100px', padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>
                {item.badge}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <div style={{ marginTop: 'auto', padding: '16px 0 0' }}>
        <div style={{ padding: '12px', background: 'rgba(124,58,237,0.08)',
          borderRadius: 10, border: '1px solid rgba(124,58,237,0.15)' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600 }}>
            AI ENGINE
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Activity size={14} style={{ color: 'var(--primary-light)' }} />
            <span style={{ fontSize: 12, color: 'var(--primary-light)' }}>Mistral + LangChain</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            ChromaDB Vector Memory
          </div>
        </div>
      </div>
    </aside>
  )
}

export default function App() {
  const [wsMessages, setWsMessages] = useState([])
  const [wsConnected, setWsConnected] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [liveCount, setLiveCount] = useState(0)
  const wsRef = useRef(null)

  useEffect(() => {
    connectWS()
    fetchPendingCount()
    return () => wsRef.current?.close()
  }, [])

  function connectWS() {
    try {
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.onopen = () => {
        setWsConnected(true)
        // heartbeat
        setInterval(() => ws.readyState === 1 && ws.send('ping'), 25000)
      }
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          if (msg.type === 'pong') return
          setWsMessages(prev => [msg, ...prev.slice(0, 99)])
          if (['diagnosing', 'fixing', 'retrying'].includes(msg.status)) {
            setLiveCount(c => c + 1)
          } else {
            setLiveCount(c => Math.max(0, c - 1))
          }
          if (msg.type === 'approval_required') {
            setPendingCount(c => c + 1)
          }
          if (msg.type === 'fix_rejected' || msg.type === 'fix_complete') {
            setPendingCount(c => Math.max(0, c - 1))
          }
        } catch (_) {}
      }
      ws.onclose = () => {
        setWsConnected(false)
        setTimeout(connectWS, 3000) // Reconnect
      }
      ws.onerror = () => ws.close()
    } catch (_) {}
  }

  async function fetchPendingCount() {
    try {
      const r = await fetch('/api/approvals/pending')
      const d = await r.json()
      setPendingCount(d.total || 0)
    } catch (_) {}
  }

  return (
    <WSContext.Provider value={{ wsMessages, wsConnected }}>
      <BrowserRouter>
        <Background3D />
        <div className="app-layout">
          <Sidebar pendingCount={pendingCount} liveCount={liveCount} />
          <main className="main-content">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/approvals" element={<Approvals onCountChange={setPendingCount} />} />
              <Route path="/history" element={<History />} />
              <Route path="/simulate" element={<Simulate />} />
              <Route path="/events/:id" element={<EventDetail />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </WSContext.Provider>
  )
}

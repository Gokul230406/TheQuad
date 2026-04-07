import React, { useEffect, useRef, useState } from 'react'
import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom'
import {
  Activity,
  FlaskConical,
  History as HistoryIcon,
  LayoutDashboard,
  Moon,
  Sun,
  ShieldAlert,
  Wifi,
  WifiOff,
} from 'lucide-react'
import Dashboard from './pages/Dashboard.jsx'
import Approvals from './pages/Approvals.jsx'
import History from './pages/History.jsx'
import Simulate from './pages/Simulate.jsx'
import EventDetail from './pages/EventDetail.jsx'

const WS_URL = 'ws://localhost:8000/api/dashboard/ws'

export const WSContext = React.createContext(null)

function Sidebar({ pendingCount, liveCount, wsConnected, theme, onToggleTheme }) {
  const navItems = [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
    { path: '/approvals', label: 'Approvals', icon: ShieldAlert, badge: pendingCount },
    { path: '/history', label: 'History', icon: HistoryIcon },
    { path: '/simulate', label: 'Simulate', icon: FlaskConical },
  ]

  return (
    <aside className="app-sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-brand-mark">
          <Activity size={18} />
        </div>
        <div>
          <p className="sidebar-brand-title">PipeGenie</p>
          <p className="sidebar-brand-subtitle">Reliability Ops Console</p>
        </div>
      </div>

      <div className="sidebar-live-status">
        {wsConnected ? <Wifi size={14} /> : <WifiOff size={14} />}
        <span>{wsConnected ? 'Live connection' : 'Reconnecting'}</span>
        <button type="button" className="theme-toggle" onClick={onToggleTheme} aria-label="Toggle theme">
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
        </button>
      </div>

      <div className="sidebar-nav-list">
        {navItems.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.exact}
              className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}
            >
              <span className="sidebar-nav-icon">
                <Icon size={15} />
              </span>
              <span>{item.label}</span>
              {item.badge > 0 && <span className="sidebar-nav-badge">{item.badge}</span>}
            </NavLink>
          )
        })}
      </div>

      <div className="sidebar-footer-stats">
        <div>
          <p>Pending approvals</p>
          <strong>{pendingCount}</strong>
        </div>
        <div>
          <p>Active workflows</p>
          <strong>{liveCount}</strong>
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
  const pingIntervalRef = useRef(null)
  const [theme, setTheme] = useState(() => {
    const storedTheme = localStorage.getItem('pg-theme')
    if (storedTheme === 'light' || storedTheme === 'dark') return storedTheme
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('pg-theme', theme)
  }, [theme])

  useEffect(() => {
    connectWS()
    fetchPendingCount()

    return () => {
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current)
      }
      wsRef.current?.close()
    }
  }, [])

  function connectWS() {
    try {
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.onopen = () => {
        setWsConnected(true)

        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current)
        }

        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === 1) ws.send('ping')
        }, 25000)
      }

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          if (msg.type === 'pong') return

          setWsMessages((prev) => [msg, ...prev.slice(0, 99)])

          if (['diagnosing', 'fixing', 'retrying'].includes(msg.status)) {
            setLiveCount((count) => count + 1)
          } else {
            setLiveCount((count) => Math.max(0, count - 1))
          }

          if (msg.type === 'approval_required') {
            setPendingCount((count) => count + 1)
          }

          if (msg.type === 'fix_rejected' || msg.type === 'fix_complete') {
            setPendingCount((count) => Math.max(0, count - 1))
          }
        } catch (_) {
          return
        }
      }

      ws.onclose = () => {
        setWsConnected(false)
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current)
          pingIntervalRef.current = null
        }
        setTimeout(connectWS, 3000)
      }

      ws.onerror = () => ws.close()
    } catch (_) {
      return
    }
  }

  async function fetchPendingCount() {
    try {
      const response = await fetch('/api/approvals/pending')
      const data = await response.json()
      setPendingCount(data.total || 0)
    } catch (_) {
      return
    }
  }

  return (
    <WSContext.Provider value={{ wsMessages, wsConnected }}>
      <BrowserRouter>
        <div className="app-shell">
          <Sidebar
            pendingCount={pendingCount}
            liveCount={liveCount}
            wsConnected={wsConnected}
            theme={theme}
            onToggleTheme={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
          />
          <main className="app-main">
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

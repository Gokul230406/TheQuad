import React, { useState, useEffect, useRef } from 'react'
import { BrowserRouter, Routes, Route, NavLink, useNavigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import Dashboard from './pages/Dashboard.jsx'
import Approvals from './pages/Approvals.jsx'
import History from './pages/History.jsx'
import Simulate from './pages/Simulate.jsx'
import EventDetail from './pages/EventDetail.jsx'
import {
  LayoutDashboard, ShieldAlert, History as HistoryIcon,
  Zap, Activity, Cpu, Wifi, WifiOff
} from 'lucide-react'

const WS_URL = `ws://localhost:8000/api/dashboard/ws`

export const WSContext = React.createContext(null)

/* ── 3D WebGL Particle Background ── */
function ThreeBackground() {
  const canvasRef = useRef(null)
  const rafRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    let W = window.innerWidth
    let H = window.innerHeight
    canvas.width = W
    canvas.height = H

    // Particle system
    const PARTICLE_COUNT = 90
    const particles = Array.from({ length: PARTICLE_COUNT }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      z: Math.random() * 800 + 200,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
      vz: (Math.random() - 0.5) * 0.3,
      color: Math.random() > 0.5 ? [109, 40, 217] : [8, 145, 178],
      size: Math.random() * 1.5 + 0.5,
    }))

    // Mouse parallax
    let mx = W / 2, my = H / 2
    const onMouse = (e) => { mx = e.clientX; my = e.clientY }
    window.addEventListener('mousemove', onMouse)

    const onResize = () => {
      W = window.innerWidth; H = window.innerHeight
      canvas.width = W; canvas.height = H
    }
    window.addEventListener('resize', onResize)

    const CONNECTION_DIST = 140
    let t = 0

    function project(p) {
      const fov = 600
      const px = mx - W / 2
      const py = my - H / 2
      const rx = p.x + px * (1000 / p.z) * 0.018
      const ry = p.y + py * (1000 / p.z) * 0.018
      const scale = fov / (fov + p.z)
      return {
        sx: W / 2 + (rx - W / 2) * scale,
        sy: H / 2 + (ry - H / 2) * scale,
        scale,
        alpha: Math.max(0, Math.min(1, 1 - p.z / 1000)) * 0.8
      }
    }

    function draw() {
      t += 0.005
      ctx.clearRect(0, 0, W, H)

      // Deep space gradient background
      const bg = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H))
      bg.addColorStop(0, '#040a1a')
      bg.addColorStop(0.5, '#020712')
      bg.addColorStop(1, '#020408')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, W, H)

      // Animated nebula blobs
      const nebulaColors = [
        { cx: W * 0.2, cy: H * 0.3, r: 280, color: [109, 40, 217, 0.04] },
        { cx: W * 0.8, cy: H * 0.6, r: 320, color: [8, 145, 178, 0.035] },
        { cx: W * 0.5, cy: H * 0.8, r: 200, color: [109, 40, 217, 0.025] },
      ]
      nebulaColors.forEach(n => {
        const grad = ctx.createRadialGradient(
          n.cx + Math.sin(t * 0.4) * 30, n.cy + Math.cos(t * 0.3) * 30, 0,
          n.cx, n.cy, n.r
        )
        grad.addColorStop(0, `rgba(${n.color[0]},${n.color[1]},${n.color[2]},${n.color[3]})`)
        grad.addColorStop(1, 'transparent')
        ctx.fillStyle = grad
        ctx.fillRect(0, 0, W, H)
      })

      // Update and draw particles
      const projected = particles.map((p, i) => {
        p.x += p.vx
        p.y += p.vy
        p.z += p.vz

        if (p.x < 0) p.x = W
        if (p.x > W) p.x = 0
        if (p.y < 0) p.y = H
        if (p.y > H) p.y = 0
        if (p.z < 50) p.z = 1000
        if (p.z > 1000) p.z = 50

        return { ...project(p), i, color: p.color, size: p.size }
      })

      // Draw connections
      for (let i = 0; i < projected.length; i++) {
        for (let j = i + 1; j < projected.length; j++) {
          const a = projected[i], b = projected[j]
          const dx = a.sx - b.sx, dy = a.sy - b.sy
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < CONNECTION_DIST) {
            const alpha = (1 - dist / CONNECTION_DIST) * 0.25 * Math.min(a.alpha, b.alpha)
            const mx2 = (a.sx + b.sx) / 2, my2 = (a.sy + b.sy) / 2
            const grad = ctx.createLinearGradient(a.sx, a.sy, b.sx, b.sy)
            grad.addColorStop(0, `rgba(${a.color.join(',')},${alpha})`)
            grad.addColorStop(0.5, `rgba(139,92,246,${alpha * 0.6})`)
            grad.addColorStop(1, `rgba(${b.color.join(',')},${alpha})`)
            ctx.beginPath()
            ctx.moveTo(a.sx, a.sy)
            ctx.lineTo(b.sx, b.sy)
            ctx.strokeStyle = grad
            ctx.lineWidth = 0.7
            ctx.stroke()
          }
        }
      }

      // Draw particles
      projected.forEach(p => {
        const r = p.size * p.scale * 2.5
        const grd = ctx.createRadialGradient(p.sx, p.sy, 0, p.sx, p.sy, r * 3)
        grd.addColorStop(0, `rgba(${p.color.join(',')},${p.alpha * 0.9})`)
        grd.addColorStop(0.5, `rgba(${p.color.join(',')},${p.alpha * 0.3})`)
        grd.addColorStop(1, 'transparent')
        ctx.beginPath()
        ctx.arc(p.sx, p.sy, r * 3, 0, Math.PI * 2)
        ctx.fillStyle = grd
        ctx.fill()

        // Core dot
        ctx.beginPath()
        ctx.arc(p.sx, p.sy, Math.max(0.5, r), 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${p.color.join(',')},${p.alpha})`
        ctx.fill()
      })

      // Subtle grid lines (horizon effect)
      ctx.save()
      ctx.globalAlpha = 0.025
      const gridColor = 'rgba(139,92,246,1)'
      ctx.strokeStyle = gridColor
      ctx.lineWidth = 0.5
      for (let gx = 0; gx < W; gx += 80) {
        ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke()
      }
      for (let gy = 0; gy < H; gy += 80) {
        ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke()
      }
      ctx.restore()

      rafRef.current = requestAnimationFrame(draw)
    }

    draw()
    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('mousemove', onMouse)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="canvas-bg"
      style={{ position: 'fixed', top: 0, left: 0, zIndex: 0, pointerEvents: 'none' }}
    />
  )
}

/* ── Sidebar ── */
function Sidebar({ pendingCount, liveCount, wsConnected }) {
  const navItems = [
    { path: '/', icon: <LayoutDashboard size={16} />, label: 'Dashboard', exact: true },
    { path: '/approvals', icon: <ShieldAlert size={16} />, label: 'Approvals', badge: pendingCount },
    { path: '/history', icon: <HistoryIcon size={16} />, label: 'History' },
    { path: '/simulate', icon: <Zap size={16} />, label: 'Simulate' },
  ]

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">🧞</div>
        <div>
          <div className="sidebar-logo-text">PipeGenie</div>
          <div className="sidebar-logo-version">v2.0 · AI Engine</div>
        </div>
      </div>

      {/* Live status */}
      <div className="sidebar-status">
        <div className="live-dot-wrap">
          <span className="live-dot" style={{ background: wsConnected ? 'var(--success-bright)' : 'var(--danger-bright)' }} />
        </div>
        <span style={{ fontSize: 12, color: wsConnected ? 'var(--success-light)' : 'var(--danger-light)', fontWeight: 600 }}>
          {liveCount > 0 ? `${liveCount} processing` : wsConnected ? 'System live' : 'Reconnecting…'}
        </span>
      </div>

      {/* Nav */}
      <div className="sidebar-section-label">Navigation</div>
      <nav className="sidebar-nav">
        {navItems.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.exact}
            className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
          >
            <span className="nav-icon">{item.icon}</span>
            <span>{item.label}</span>
            {item.badge > 0 && (
              <span className="notif-badge" style={{ position: 'relative', top: 0, right: 0, marginLeft: 'auto' }}>
                {item.badge}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-divider" style={{ margin: '16px 0' }} />

      {/* Footer AI badge */}
      <div className="sidebar-footer">
        <div className="sidebar-ai-badge">
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            AI Engine
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
            <Cpu size={13} style={{ color: 'var(--primary-light)', flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: 'var(--primary-light)', fontWeight: 600 }}>Mistral + LangChain</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
            <Activity size={13} style={{ color: 'var(--accent-bright)', flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: 'var(--accent-light)', fontWeight: 500 }}>ChromaDB Memory</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            {wsConnected
              ? <Wifi size={13} style={{ color: 'var(--success-bright)', flexShrink: 0 }} />
              : <WifiOff size={13} style={{ color: 'var(--danger-bright)', flexShrink: 0 }} />
            }
            <span style={{
              fontSize: 12, fontWeight: 500,
              color: wsConnected ? 'var(--success-light)' : 'var(--danger-light)'
            }}>
              {wsConnected ? 'WebSocket live' : 'Reconnecting'}
            </span>
          </div>
        </div>
      </div>
    </aside>
  )
}

/* ── App ── */
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
          if (msg.type === 'approval_required') setPendingCount(c => c + 1)
          if (msg.type === 'fix_rejected' || msg.type === 'fix_complete') {
            setPendingCount(c => Math.max(0, c - 1))
          }
        } catch (_) {}
      }
      ws.onclose = () => {
        setWsConnected(false)
        setTimeout(connectWS, 3000)
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
        <ThreeBackground />
        <div className="app-layout">
          <Sidebar pendingCount={pendingCount} liveCount={liveCount} wsConnected={wsConnected} />
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
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: 'rgba(10,22,40,0.95)',
              color: '#f0f4ff',
              border: '1px solid rgba(139,92,246,0.3)',
              borderRadius: '12px',
              backdropFilter: 'blur(20px)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              fontFamily: "'Outfit', sans-serif",
              fontSize: '13px',
            },
            success: {
              iconTheme: { primary: '#10b981', secondary: 'transparent' },
            },
            error: {
              iconTheme: { primary: '#ef4444', secondary: 'transparent' },
            },
          }}
        />
      </BrowserRouter>
    </WSContext.Provider>
  )
}

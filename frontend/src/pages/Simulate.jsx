import React, { useState } from 'react'
import { Zap, Play, AlertTriangle, CheckCircle2, ChevronRight, Settings } from 'lucide-react'
import toast from 'react-hot-toast'

const SAMPLE_SCENARIOS = [
  {
    name: 'Missing Dependency',
    emoji: '📦',
    description: 'Python package not found – cryptography version mismatch',
    logs: `Run pip install -r requirements.txt
Collecting flask==2.3.0
ERROR: Could not find a version that satisfies the requirement cryptography==41.0.0 (from versions: 39.0.0, 40.0.0)
ERROR: No matching distribution found for cryptography==41.0.0
##[error]Process completed with exit code 1.`,
    branch: 'main', risk: 'low',
  },
  {
    name: 'Test Failure',
    emoji: '🧪',
    description: 'Unit tests failing – assertion error in auth module',
    logs: `pytest tests/ -v
FAILED tests/test_auth.py::test_login - AssertionError: Expected 200, got 401
FAILED tests/test_auth.py::test_token_refresh - AssertionError: Token validation failed
2 failed, 48 passed in 12.3s
##[error]Process completed with exit code 1.`,
    branch: 'develop', risk: 'low',
  },
  {
    name: 'Build Error',
    emoji: '🔨',
    description: 'Syntax error in config file – YAML parse failure',
    logs: `Loading configuration...
ERROR: Failed to parse config.yaml
yaml.scanner.ScannerError: mapping values are not allowed here
  in "config.yaml", line 15, column 23
##[error]Process completed with exit code 1.`,
    branch: 'feature/new-config', risk: 'low',
  },
  {
    name: 'Network Timeout',
    emoji: '🌐',
    description: 'External service timeout during integration tests',
    logs: `Running integration tests...
FAILED: Connection to api.external-service.com timed out after 30s
requests.exceptions.ConnectionError: HTTPSConnectionPool(host='api.external-service.com', port=443)
Max retries exceeded with url: /v1/data
##[error]Process completed with exit code 1.`,
    branch: 'main', risk: 'medium',
  },
  {
    name: 'Permission Error',
    emoji: '🔒',
    description: 'Deploy fails – insufficient permissions on production',
    logs: `Running deployment script...
chmod: cannot access '/etc/nginx/sites-enabled/app.conf': Permission denied
sudo: /usr/sbin/nginx: command not found
Failed to reload nginx configuration
##[error]Deployment failed with exit code 1. Branch: production`,
    branch: 'production', risk: 'high',
  },
]

const PIPELINE_STEPS = [
  { icon: '💥', label: 'Inject Failure', desc: 'Simulate CI/CD event' },
  { icon: '🔍', label: 'Diagnosis', desc: 'Mistral AI analysis' },
  { icon: '🔧', label: 'Fix Generate', desc: 'Fixer Agent creates script' },
  { icon: '🛡️', label: 'Risk Eval', desc: 'Guardian scores risk' },
  { icon: '🚀', label: 'Execute', desc: 'Docker isolated run' },
]

export default function Simulate() {
  const [scenario, setScenario] = useState(SAMPLE_SCENARIOS[0])
  const [customizing, setCustomizing] = useState(false)
  const [form, setForm] = useState({
    repo: 'demo-org/my-app',
    branch: scenario.branch,
    commit_sha: 'abc1234def',
    commit_message: 'feat: update dependencies',
    workflow_name: 'CI Pipeline',
    logs: scenario.logs
  })
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [activeStep, setActiveStep] = useState(-1)

  function selectScenario(s) {
    setScenario(s)
    setForm(f => ({ ...f, branch: s.branch, logs: s.logs }))
    setResult(null)
    setActiveStep(-1)
  }

  async function runSimulation() {
    setLoading(true)
    setResult(null)

    // Animate pipeline steps
    let step = 0
    setActiveStep(0)
    const stepInterval = setInterval(() => {
      step++
      if (step < PIPELINE_STEPS.length) setActiveStep(step)
      else clearInterval(stepInterval)
    }, 1200)

    try {
      const r = await fetch('/api/webhook/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
      const d = await r.json()
      setResult(d)
      toast.success('🚀 Simulation started! Watch the Dashboard for live updates.')
    } catch (e) {
      toast.error('Simulation failed – is the backend running?')
      setResult({ error: String(e) })
      clearInterval(stepInterval)
      setActiveStep(-1)
    }
    setLoading(false)
  }

  const riskColors = { low: 'var(--success-bright)', medium: 'var(--warning-bright)', high: 'var(--danger-bright)' }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">
          <div className="page-title-icon">⚡</div>
          Failure Simulator
        </h1>
        <p className="page-subtitle">Inject realistic CI/CD failures to test PipeGenie's AI agents end-to-end</p>
      </div>

      {/* Pipeline steps */}
      <div className="card" style={{ marginBottom: 28, padding: '24px 28px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 20 }}>
          AI Pipeline Flow
        </div>
        <div className="steps-row">
          {PIPELINE_STEPS.map((s, i) => (
            <div key={i} className={`step-item ${activeStep === i ? 'active' : activeStep > i ? 'done' : ''}`}>
              <div className="step-bubble">{s.icon}</div>
              <div className="step-label">{s.label}</div>
              <div className="step-desc">{s.desc}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid-2">
        {/* Scenario Picker */}
        <div>
          <div className="section-header">
            <div className="section-title">
              <div className="section-title-icon">🎯</div>
              Choose Scenario
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {SAMPLE_SCENARIOS.map((s, i) => (
              <div
                key={i}
                className={`scenario-card ${scenario.name === s.name ? 'selected' : ''}`}
                onClick={() => selectScenario(s)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flex: 1, minWidth: 0 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                      background: scenario.name === s.name ? 'var(--grad-primary)' : 'rgba(255,255,255,0.04)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 18, transition: 'var(--transition-spring)',
                      boxShadow: scenario.name === s.name ? 'var(--shadow-glow-purple)' : 'none',
                    }}>{s.emoji}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 3, letterSpacing: '-0.02em' }}>{s.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{s.description}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                    <span className={`badge risk-${s.risk}`}>{s.risk}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono' }}>{s.branch}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Config Form */}
        <div>
          <div className="section-header">
            <div className="section-title">
              <div className="section-title-icon"><Settings size={14} /></div>
              Configuration
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => setCustomizing(!customizing)}>
              {customizing ? 'Collapse' : 'Customize'} <ChevronRight size={12} style={{ transform: customizing ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
            </button>
          </div>

          <div className="card" style={{ padding: '22px' }}>
            {customizing && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20, animation: 'slide-in-up 0.3s ease' }}>
                {[
                  { key: 'repo', label: 'Repository', placeholder: 'owner/repo' },
                  { key: 'branch', label: 'Branch', placeholder: 'main' },
                  { key: 'commit_sha', label: 'Commit SHA', placeholder: 'abc1234' },
                  { key: 'commit_message', label: 'Commit Message', placeholder: 'feat: ...' },
                  { key: 'workflow_name', label: 'Workflow Name', placeholder: 'CI Pipeline' },
                ].map(f => (
                  <div key={f.key}>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                      {f.label}
                    </label>
                    <input className="input" placeholder={f.placeholder}
                      value={form[f.key]} onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))} />
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                Failure Logs
              </label>
              <textarea
                className="input code-block"
                value={form.logs}
                onChange={e => setForm(prev => ({ ...prev, logs: e.target.value }))}
                style={{ minHeight: 190, resize: 'vertical', background: '#020812' }}
              />
            </div>

            {/* Selected scenario indicator */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
              background: 'rgba(0,0,0,0.25)', borderRadius: 10, marginBottom: 16,
              border: `1px solid ${riskColors[scenario.risk]}25`,
            }}>
              <div style={{ fontSize: 18 }}>{scenario.emoji}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{scenario.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Branch: {form.branch} · Repo: {form.repo}</div>
              </div>
              <span className={`badge risk-${scenario.risk}`}>{scenario.risk} risk</span>
            </div>

            <button
              className="btn btn-primary btn-lg"
              onClick={runSimulation}
              disabled={loading}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              {loading ? (
                <>
                  <div className="spinner" style={{ borderTopColor: 'white', width: 18, height: 18, borderWidth: 2 }} />
                  Running simulation…
                </>
              ) : (
                <>
                  <Play size={17} />
                  Run Simulation
                </>
              )}
            </button>

            {result && (
              <div style={{
                marginTop: 16, padding: '16px 18px', borderRadius: 12,
                background: result.error ? 'rgba(220,38,38,0.08)' : 'rgba(5,150,105,0.08)',
                border: `1px solid ${result.error ? 'rgba(220,38,38,0.25)' : 'rgba(5,150,105,0.25)'}`,
                animation: 'pop-in 0.3s ease',
              }}>
                {result.error ? (
                  <div style={{ color: 'var(--danger-light)', fontSize: 13, display: 'flex', gap: 8 }}>
                    ❌ <span>{result.error}</span>
                  </div>
                ) : (
                  <>
                    <div style={{ color: 'var(--success-light)', fontWeight: 700, marginBottom: 8, fontSize: 14 }}>
                      ✅ Simulation Started!
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span>Event ID: <code style={{ color: 'var(--accent-light)', fontFamily: 'JetBrains Mono' }}>{result.event_id}</code></span>
                      <span>→ Watch the <strong style={{ color: 'var(--primary-light)' }}>Dashboard</strong> Live Feed for real-time updates</span>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

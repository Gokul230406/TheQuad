import React, { useState } from 'react'
import { Zap, Play, AlertTriangle, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'

const SAMPLE_SCENARIOS = [
  {
    name: '📦 Missing Dependency',
    description: 'Python package not found – cryptography version mismatch',
    logs: `Run pip install -r requirements.txt
Collecting flask==2.3.0
ERROR: Could not find a version that satisfies the requirement cryptography==41.0.0 (from versions: 39.0.0, 40.0.0)
ERROR: No matching distribution found for cryptography==41.0.0
##[error]Process completed with exit code 1.`,
    branch: 'main', risk: 'low'
  },
  {
    name: '🧪 Test Failure',
    description: 'Unit tests failing – assertion error in auth module',
    logs: `pytest tests/ -v
FAILED tests/test_auth.py::test_login - AssertionError: Expected 200, got 401
FAILED tests/test_auth.py::test_token_refresh - AssertionError: Token validation failed
2 failed, 48 passed in 12.3s
##[error]Process completed with exit code 1.`,
    branch: 'develop', risk: 'low'
  },
  {
    name: '🔨 Build Error',
    description: 'Syntax error in config file – YAML parse failure',
    logs: `Loading configuration...
ERROR: Failed to parse config.yaml
yaml.scanner.ScannerError: mapping values are not allowed here
  in "config.yaml", line 15, column 23
##[error]Process completed with exit code 1.`,
    branch: 'feature/new-config', risk: 'low'
  },
  {
    name: '🌐 Network Timeout',
    description: 'External service timeout during integration tests',
    logs: `Running integration tests...
FAILED: Connection to api.external-service.com timed out after 30s
requests.exceptions.ConnectionError: HTTPSConnectionPool(host='api.external-service.com', port=443)
Max retries exceeded with url: /v1/data
##[error]Process completed with exit code 1.`,
    branch: 'main', risk: 'medium'
  },
  {
    name: '🔒 Permission Error (High Risk)',
    description: 'Deploy script fails due to insufficient permissions on production',
    logs: `Running deployment script...
chmod: cannot access '/etc/nginx/sites-enabled/app.conf': Permission denied
sudo: /usr/sbin/nginx: command not found
Failed to reload nginx configuration
##[error]Deployment failed with exit code 1. Branch: production`,
    branch: 'production', risk: 'high'
  },
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

  function selectScenario(s) {
    setScenario(s)
    setForm(f => ({ ...f, branch: s.branch, logs: s.logs }))
    setResult(null)
  }

  async function runSimulation() {
    setLoading(true)
    setResult(null)
    try {
      const r = await fetch('/api/webhook/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
      const d = await r.json()
      setResult(d)
      toast.success('Simulation started! Watch the Dashboard for live updates.')
    } catch (e) {
      toast.error('Simulation failed – is the backend running?')
      setResult({ error: String(e) })
    }
    setLoading(false)
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">⚡ Failure Simulator</h1>
        <p className="page-subtitle">Inject realistic CI/CD failures to test PipeGenie's AI agents</p>
      </div>

      {/* How it works */}
      <div className="card" style={{ marginBottom: 24, background: 'rgba(124,58,237,0.05)', borderColor: 'rgba(124,58,237,0.3)' }}>
        <div style={{ display: 'flex', gap: 40, flexWrap: 'wrap' }}>
          {[
            { step: '1', icon: '💥', label: 'Inject Failure', desc: 'Pick a scenario & simulate' },
            { step: '2', icon: '🔍', label: 'Diagnosis', desc: 'Mistral AI analyzes logs' },
            { step: '3', icon: '🔧', label: 'Fix Generate', desc: 'Fixer Agent creates script' },
            { step: '4', icon: '🛡️', label: 'Risk Eval', desc: 'Guardian scores the fix' },
            { step: '5', icon: '🚀', label: 'Execute', desc: 'Docker runs approved fix' },
          ].map(s => (
            <div key={s.step} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flex: '1 1 80px', textAlign: 'center' }}>
              <div style={{ fontSize: 24 }}>{s.icon}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary-light)' }}>{s.label}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.desc}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid-2">
        {/* Scenario Picker */}
        <div>
          <div className="section-header" style={{ marginBottom: 12 }}>
            <span className="section-title">🎯 Choose Scenario</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {SAMPLE_SCENARIOS.map((s, i) => (
              <div key={i} className="card" onClick={() => selectScenario(s)}
                style={{ cursor: 'pointer', padding: 14,
                  borderColor: scenario.name === s.name ? 'var(--primary)' : 'var(--border)',
                  background: scenario.name === s.name ? 'rgba(124,58,237,0.1)' : 'var(--bg-card)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{s.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{s.description}</div>
                  </div>
                  <span className={`badge risk-${s.risk}`}>{s.risk}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Config Form */}
        <div>
          <div className="section-header">
            <span className="section-title">⚙️ Configuration</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setCustomizing(!customizing)}>
              {customizing ? 'Hide' : 'Customize'}
            </button>
          </div>

          <div className="card">
            {customizing && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
                {[
                  { key: 'repo', label: 'Repository', placeholder: 'owner/repo' },
                  { key: 'branch', label: 'Branch', placeholder: 'main' },
                  { key: 'commit_sha', label: 'Commit SHA', placeholder: 'abc1234' },
                  { key: 'commit_message', label: 'Commit Message', placeholder: 'feat: ...' },
                  { key: 'workflow_name', label: 'Workflow Name', placeholder: 'CI Pipeline' },
                ].map(f => (
                  <div key={f.key}>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                      {f.label}
                    </label>
                    <input className="input" placeholder={f.placeholder}
                      value={form[f.key]} onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))} />
                  </div>
                ))}
              </div>
            )}

            <div>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 6 }}>
                FAILURE LOGS
              </label>
              <textarea
                className="input code-block"
                value={form.logs}
                onChange={e => setForm(prev => ({ ...prev, logs: e.target.value }))}
                style={{ minHeight: 180, resize: 'vertical' }}
              />
            </div>

            <button className="btn btn-primary" onClick={runSimulation} disabled={loading}
              style={{ marginTop: 16, width: '100%', justifyContent: 'center', padding: '12px' }}>
              {loading ? (
                <><div className="spinner" style={{ borderTopColor: 'white' }} /> Running simulation...</>
              ) : (
                <><Play size={16} /> Run Simulation</>
              )}
            </button>

            {result && (
              <div style={{ marginTop: 16, padding: 14, borderRadius: 10,
                background: result.error ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
                border: `1px solid ${result.error ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}` }}>
                {result.error ? (
                  <div style={{ color: 'var(--danger-light)', fontSize: 13 }}>❌ {result.error}</div>
                ) : (
                  <>
                    <div style={{ color: 'var(--success-light)', fontWeight: 700, marginBottom: 6 }}>
                      ✅ Simulation Started!
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      Event ID: <code style={{ color: 'var(--accent)' }}>{result.event_id}</code>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                      Watch the Dashboard → Live Feed for real-time updates
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

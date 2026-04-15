import React, { useState, useEffect, useRef } from 'react'
import {
  AlertCircle,
  Bug,
  CheckCircle2,
  Loader2,
  Play,
  Settings,
  ShieldAlert,
  TestTube2,
  Wrench,
  Brain,
  MessageSquare,
  X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'

const SAMPLE_SCENARIOS = [
  {
    name: 'Missing Dependency',
    icon: Wrench,
    description: 'Package version mismatch in build pipeline',
    logs: `Run pip install -r requirements.txt\nERROR: Could not find a version that satisfies the requirement cryptography==41.0.0\nERROR: No matching distribution found for cryptography==41.0.0`,
    branch: 'main',
    risk: 'low',
  },
  {
    name: 'Test Failure',
    icon: TestTube2,
    description: 'Assertion mismatch in authentication tests',
    logs: `pytest tests/ -v\nFAILED tests/test_auth.py::test_login - AssertionError: Expected 200, got 401\n2 failed, 48 passed in 12.3s`,
    branch: 'develop',
    risk: 'low',
  },
  {
    name: 'Build Error',
    icon: Bug,
    description: 'YAML parser failure in CI config',
    logs: `Loading configuration...\nyaml.scanner.ScannerError: mapping values are not allowed here\nin config.yaml, line 15, column 23`,
    branch: 'feature/new-config',
    risk: 'low',
  },
  {
    name: 'Network Timeout',
    icon: AlertCircle,
    description: 'External service timeout in integration stage',
    logs: `FAILED: Connection to api.external-service.com timed out after 30s\nMax retries exceeded with url: /v1/data`,
    branch: 'main',
    risk: 'medium',
  },
  {
    name: 'Permission Error',
    icon: ShieldAlert,
    description: 'Deploy script permission failure on production host',
    logs: `chmod: cannot access /etc/nginx/sites-enabled/app.conf: Permission denied\nFailed to reload nginx configuration`,
    branch: 'production',
    risk: 'high',
  },
]

export default function Simulate() {
  const [scenario, setScenario] = useState(SAMPLE_SCENARIOS[0])
  const [customizing, setCustomizing] = useState(false)
  const [form, setForm] = useState({
    repo: 'harshitha090/vehicle-detection',
    branch: SAMPLE_SCENARIOS[0].branch,
    commit_sha: 'abc1234def',
    commit_message: 'fix: adjust dependency graph',
    workflow_name: 'CI Pipeline',
    logs: SAMPLE_SCENARIOS[0].logs,
  })
  const [loading, setLoading] = useState(false)
  const [pingingWebhook, setPingingWebhook] = useState(false)
  const [result, setResult] = useState(null)
  const [diagnosis, setDiagnosis] = useState(null)
  const [diagnosisLoading, setDiagnosisLoading] = useState(false)
  const debounceTimer = useRef(null)

  // Scenario builder state
  const [builderOpen, setBuilderOpen] = useState(false)
  const [builderMessages, setBuilderMessages] = useState([])
  const [builderInput, setBuilderInput] = useState('')
  const [builderLoading, setBuilderLoading] = useState(false)
  const [sessionId] = useState(`session-${Date.now()}`)
  const chatEndRef = useRef(null)

  // Fix preview state
  const [fixPreview, setFixPreview] = useState(null)
  const [fixPreviewLoading, setFixPreviewLoading] = useState(false)

  function normalizeBuilderMessage(rawMessage) {
    if (!rawMessage || typeof rawMessage !== 'string') return 'Sorry, something went wrong. Please try again.'

    const trimmed = rawMessage.trim()

    // Plain text path
    if (!trimmed.startsWith('{')) return trimmed

    // JSON wrapper path from model/provider
    try {
      const parsed = JSON.parse(trimmed)
      if (typeof parsed.Assistant === 'string') return parsed.Assistant
      if (typeof parsed.message === 'string') return parsed.message
      if (typeof parsed.reply === 'string') return parsed.reply
      return trimmed
    } catch (_) {
      return trimmed
    }
  }

  // Auto-preview diagnosis when logs change (debounced)
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current)

    if (form.logs.length < 20) {
      setDiagnosis(null)
      return
    }

    setDiagnosisLoading(true)
    debounceTimer.current = setTimeout(async () => {
      try {
        const response = await fetch('http://localhost:8000/api/webhook/preview-diagnosis', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            logs: form.logs,
            repo: form.repo,
            branch: form.branch,
            commit_message: form.commit_message,
          }),
        })
        const data = await response.json()
        setDiagnosis(data.diagnosis)
        setDiagnosisLoading(false)
      } catch (error) {
        console.error('Diagnosis preview failed:', error)
        setDiagnosisLoading(false)
      }
    }, 1500) // Wait 1.5s after user stops typing

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [form.logs])

  // Scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [builderMessages])

  // Scenario builder opening message
  useEffect(() => {
    if (builderOpen && builderMessages.length === 0) {
      setBuilderMessages([
        {
          role: 'assistant',
          content: "Hi! I'm PipeGenie's Scenario Builder. Describe what happened in your pipeline, and I'll ask clarifying questions to help you simulate it. What went wrong?",
        },
      ])
    }
  }, [builderOpen])

  async function sendBuilderMessage() {
    if (!builderInput.trim()) return

    setBuilderMessages((prev) => [...prev, { role: 'user', content: builderInput }])
    setBuilderInput('')
    setBuilderLoading(true)

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 25000)

      const response = await fetch('http://localhost:8000/api/webhook/builder-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, message: builderInput }),
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`Builder request failed (${response.status})`)
      }

      const data = await response.json()
      const assistantText = normalizeBuilderMessage(data.message)
      setBuilderMessages((prev) => [...prev, { role: 'assistant', content: assistantText }])

      if (data.ready && data.scenario) {
        // Auto-populate form with scenario
        setForm({
          repo: data.scenario.repo || form.repo,
          branch: data.scenario.branch || form.branch,
          commit_sha: form.commit_sha,
          commit_message: data.scenario.commit_message || form.commit_message,
          workflow_name: form.workflow_name,
          logs: data.scenario.logs || form.logs,
        })
        toast.success('Scenario loaded! Ready to simulate.')
        setBuilderOpen(false)
      }
    } catch (error) {
      console.error('Builder chat failed:', error)
      const message = error?.name === 'AbortError'
        ? 'Builder timed out after 25s. Check backend and Ollama status.'
        : 'Builder request failed. Check backend and Ollama connection.'
      setBuilderMessages((prev) => [
        ...prev,
        { role: 'assistant', content: message },
      ])
    }

    setBuilderLoading(false)
  }

  function selectScenario(nextScenario) {
    setScenario(nextScenario)
    setForm((prev) => ({ ...prev, branch: nextScenario.branch, logs: nextScenario.logs }))
    setResult(null)
  }

  async function runSimulation() {
    setLoading(true)
    setResult(null)

    try {
      const response = await fetch('/api/webhook/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      const data = await response.json()
      setResult(data)
      toast.success('Simulation started. Follow live updates on Dashboard.')
    } catch (error) {
      setResult({ error: String(error) })
      toast.error('Simulation failed. Verify backend availability.')
    }

    setLoading(false)
  }

  async function previewFix() {
    setFixPreviewLoading(true)
    setFixPreview(null)

    try {
      const response = await fetch('http://localhost:8000/api/webhook/preview-fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          logs: form.logs,
          repo: form.repo,
          branch: form.branch,
          commit_message: form.commit_message,
        }),
      })
      const data = await response.json()
      setFixPreview(data)
    } catch (error) {
      console.error('Fix preview failed:', error)
      setFixPreview({ error: String(error) })
    }

    setFixPreviewLoading(false)
  }

  async function pingGithubWebhook() {
    setPingingWebhook(true)

    try {
      const response = await fetch('/api/webhook/github', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GitHub-Event': 'ping',
        },
        body: JSON.stringify({ zen: 'PipeGenie frontend ping' }),
      })

      if (response.ok) {
        toast.success('GitHub webhook endpoint is reachable.')
      } else {
        toast.error('Webhook ping failed. Check signature/secret configuration.')
      }
    } catch (_) {
      toast.error('Unable to reach webhook endpoint.')
    }

    setPingingWebhook(false)
  }

  const logLineCount = form.logs.split('\n').filter((line) => line.trim().length > 0).length
  const previewState = diagnosis ? 'Diagnosis ready' : diagnosisLoading ? 'Analyzing' : 'No diagnosis yet'
  const fixState = fixPreview ? 'Fix preview ready' : fixPreviewLoading ? 'Generating fix' : 'No fix preview yet'

  return (
    <div className="page-stack">
      <div className="page-header-block">
        <div>
          <h1>Failure Simulator</h1>
          <p>Inject realistic CI incidents to validate end-to-end remediation behavior.</p>
        </div>
        <Badge variant="outline">Controlled execution mode</Badge>
      </div>

      <div className="simulate-command-bar">
        <div>
          <span>Scenario</span>
          <strong>{scenario.name}</strong>
        </div>
        <div>
          <span>Log lines</span>
          <strong>{logLineCount}</strong>
        </div>
        <div>
          <span>Diagnosis</span>
          <strong>{previewState}</strong>
        </div>
        <div>
          <span>Fix plan</span>
          <strong>{fixState}</strong>
        </div>
      </div>

      <div className="simulate-shell">
        <section className="simulate-stage">
          <div className="simulate-stage-head">
            <h2>Prepare Incident</h2>
            <p>Select a baseline failure, edit payload, and dispatch a controlled run.</p>
          </div>

          <div className="simulate-grid simulate-grid-primary">
            <section className="simulate-panel">
            <div className="simulate-panel-header">
              <h2 className="simulate-panel-title">
                <Bug size={16} />
                Scenario catalog
              </h2>
              <p className="simulate-panel-description">Pick a baseline incident and tune its payload before dispatch.</p>
            </div>
            <div className="simulate-panel-body simulate-scenarios">
              {SAMPLE_SCENARIOS.map((item) => {
                const Icon = item.icon
                const selected = item.name === scenario.name

                return (
                  <button
                    key={item.name}
                    type="button"
                    className={`simulate-scenario ${selected ? 'active' : ''}`}
                    onClick={() => selectScenario(item)}
                  >
                    <span className="simulate-scenario-icon">
                      <Icon size={15} />
                    </span>
                    <div>
                      <strong>{item.name}</strong>
                      <p>{item.description}</p>
                    </div>
                    <Badge variant={item.risk === 'high' ? 'danger' : item.risk === 'medium' ? 'warning' : 'success'}>
                      {item.risk}
                    </Badge>
                  </button>
                )
              })}
            </div>
            </section>

            <section className="simulate-panel">
            <div className="simulate-panel-header">
              <h2 className="simulate-panel-title">
                <Settings size={16} />
                Simulation payload
              </h2>
              <p className="simulate-panel-description">Review event fields and trigger the guarded workflow path.</p>
            </div>
            <div className="simulate-panel-body simulate-form">
              <div className="simulate-form-top">
                <Button variant="ghost" size="sm" onClick={() => setCustomizing((value) => !value)}>
                  {customizing ? 'Hide fields' : 'Customize metadata'}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setBuilderOpen(true)}>
                  <MessageSquare size={14} />
                  Ask agent
                </Button>
                <Button variant="ghost" size="sm" onClick={previewFix} disabled={fixPreviewLoading || form.logs.length < 20}>
                  {fixPreviewLoading ? <Loader2 size={14} className="spin" /> : <Wrench size={14} />}
                  Preview fix
                </Button>
                <Button variant="outline" size="sm" onClick={pingGithubWebhook} disabled={pingingWebhook}>
                  {pingingWebhook ? <Loader2 size={14} className="spin" /> : <CheckCircle2 size={14} />}
                  Test GitHub webhook
                </Button>
              </div>

              {customizing && (
                <div className="simulate-input-grid">
                  {['repo', 'branch', 'commit_sha', 'commit_message', 'workflow_name'].map((field) => (
                    <label key={field}>
                      <span>{field.replace(/_/g, ' ')}</span>
                      <input
                        className="ui-input"
                        value={form[field]}
                        onChange={(e) => setForm((prev) => ({ ...prev, [field]: e.target.value }))}
                      />
                    </label>
                  ))}
                </div>
              )}

              <label>
                <span>Failure logs</span>
                <textarea
                  className="ui-input ui-textarea ui-code"
                  value={form.logs}
                  onChange={(e) => setForm((prev) => ({ ...prev, logs: e.target.value }))}
                />
              </label>

              <Button onClick={runSimulation} disabled={loading}>
                {loading ? <Loader2 size={15} className="spin" /> : <Play size={15} />}
                Run simulation
              </Button>

              {result && (
                <div className={`simulate-result ${result.error ? 'error' : 'success'}`}>
                  {result.error ? (
                    <>
                      <AlertCircle size={15} />
                      <span>{result.error}</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={15} />
                      <span>Simulation queued. Event ID: {result.event_id}</span>
                    </>
                  )}
                </div>
              )}
            </div>
            </section>
          </div>
        </section>

        <section className="simulate-stage">
          <div className="simulate-stage-head">
            <h2>AI Insight Layer</h2>
            <p>Review diagnosis and remediation intent before running high-impact actions.</p>
          </div>

          <div className="simulate-grid simulate-grid-insights">
            <section className="simulate-panel">
            <div className="simulate-panel-header">
              <h2 className="simulate-panel-title">
                <Brain size={16} />
                Agent diagnosis preview
              </h2>
              <p className="simulate-panel-description">Live root-cause analysis from the current payload and logs.</p>
            </div>
            <div className="simulate-panel-body simulate-diagnosis">
              {diagnosisLoading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
                  <Loader2 size={16} className="spin" />
                  Analyzing logs...
                </div>
              ) : diagnosis?.error ? (
                <div style={{ color: 'var(--error)' }}>
                  <AlertCircle size={14} style={{ marginRight: '8px' }} />
                  {diagnosis.error}
                </div>
              ) : diagnosis ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <strong style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Root cause</strong>
                    <p style={{ margin: '4px 0 0', fontSize: '1rem' }}>{diagnosis.root_cause}</p>
                  </div>
                  <div>
                    <strong style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Category</strong>
                    <Badge style={{ marginTop: '4px' }}>
                      {diagnosis.failure_category || 'unknown'}
                    </Badge>
                  </div>
                  <div>
                    <strong style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Confidence</strong>
                    <div style={{ marginTop: '4px', fontSize: '1rem' }}>
                      {Math.round((diagnosis.confidence || 0) * 100)}%
                    </div>
                  </div>
                  {diagnosis.affected_files?.length > 0 && (
                    <div>
                      <strong style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Affected files</strong>
                      <div style={{ marginTop: '4px', fontSize: '0.85rem' }}>
                        {diagnosis.affected_files.join(', ')}
                      </div>
                    </div>
                  )}
                  <div>
                    <strong style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Summary</strong>
                    <p style={{ margin: '4px 0 0', fontSize: '0.9rem', lineHeight: '1.5' }}>
                      {diagnosis.summary}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="simulate-placeholder">
                  <Brain size={14} />
                  Diagnosis appears after logs are analyzed.
                </div>
              )}
            </div>
            </section>

            <section className="simulate-panel">
            <div className="simulate-panel-header">
              <h2 className="simulate-panel-title">
                <Wrench size={16} />
                Proposed fix preview
              </h2>
              <p className="simulate-panel-description">Review generated patch strategy and risk posture before execution.</p>
            </div>
            <div className="simulate-panel-body simulate-diagnosis">
              {fixPreview?.error ? (
                <div style={{ color: 'var(--error)' }}>
                  <AlertCircle size={14} style={{ marginRight: '8px' }} />
                  {fixPreview.error}
                </div>
              ) : fixPreview ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <strong style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Diagnosis</strong>
                    <p style={{ margin: '4px 0 0', fontSize: '0.95rem' }}>
                      {fixPreview.diagnosis?.root_cause || 'No diagnosis available'}
                    </p>
                  </div>

                  <div>
                    <strong style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Proposed fix</strong>
                    <p style={{ margin: '4px 0 0', fontSize: '0.95rem', lineHeight: '1.5' }}>
                      {fixPreview.proposed_fix?.description || 'No fix description available'}
                    </p>
                  </div>

                  <div>
                    <strong style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Risk assessment</strong>
                    <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Badge variant={fixPreview.risk_assessment?.risk_level === 'high' ? 'danger' : fixPreview.risk_assessment?.risk_level === 'medium' ? 'warning' : 'success'}>
                        {(fixPreview.risk_assessment?.risk_level || 'unknown').toUpperCase()}
                      </Badge>
                      <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                        {fixPreview.risk_assessment?.justification || 'No risk details'}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="simulate-placeholder">
                  <Wrench size={14} />
                  Generate a fix preview to inspect risk and remediation strategy.
                </div>
              )}
            </div>
            </section>
          </div>
        </section>
      </div>

      {/* Scenario Builder Chat Modal */}
      {builderOpen && (
        <div className="modal-overlay" onClick={() => setBuilderOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                <Brain size={18} />
                Scenario builder
              </h2>
              <button className="modal-close" onClick={() => setBuilderOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="builder-chat">
              {builderMessages.map((msg, idx) => (
                <div key={idx} className={`builder-msg builder-msg-${msg.role}`}>
                  <div className="builder-msg-avatar">
                    {msg.role === 'assistant' ? (
                      <Brain size={14} />
                    ) : (
                      <div style={{ width: '14px', height: '14px', background: 'var(--accent)', borderRadius: '50%' }} />
                    )}
                  </div>
                  <div className="builder-msg-content">{msg.content}</div>
                </div>
              ))}
              {builderLoading && (
                <div className="builder-msg builder-msg-assistant">
                  <div className="builder-msg-avatar">
                    <Brain size={14} />
                  </div>
                  <div className="builder-msg-content">
                    <Loader2 size={14} className="spin" />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="builder-input">
              <input
                type="text"
                placeholder="Describe your failure..."
                value={builderInput}
                onChange={(e) => setBuilderInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendBuilderMessage()}
                disabled={builderLoading}
              />
              <Button
                size="sm"
                onClick={sendBuilderMessage}
                disabled={builderLoading || !builderInput.trim()}
              >
                {builderLoading ? <Loader2 size={14} className="spin" /> : 'Send'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

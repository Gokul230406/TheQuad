import React, { useState } from 'react'
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
} from 'lucide-react'
import toast from 'react-hot-toast'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'

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
    repo: 'demo-org/my-app',
    branch: SAMPLE_SCENARIOS[0].branch,
    commit_sha: 'abc1234def',
    commit_message: 'fix: adjust dependency graph',
    workflow_name: 'CI Pipeline',
    logs: SAMPLE_SCENARIOS[0].logs,
  })
  const [loading, setLoading] = useState(false)
  const [pingingWebhook, setPingingWebhook] = useState(false)
  const [result, setResult] = useState(null)

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

  return (
    <div className="page-stack">
      <div className="page-header-block">
        <div>
          <h1>Failure Simulator</h1>
          <p>Inject realistic CI incidents to validate end-to-end remediation behavior.</p>
        </div>
        <Badge variant="outline">Controlled execution mode</Badge>
      </div>

      <div className="simulate-grid">
        <Card>
          <CardHeader>
            <CardTitle>
              <Bug size={16} />
              Scenario catalog
            </CardTitle>
            <CardDescription>Choose a baseline incident to prefill payload and logs.</CardDescription>
          </CardHeader>
          <CardContent className="simulate-scenarios">
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <Settings size={16} />
              Simulation payload
            </CardTitle>
            <CardDescription>Review event fields and dispatch to webhook simulator.</CardDescription>
          </CardHeader>
          <CardContent className="simulate-form">
            <div className="simulate-form-top">
              <Button variant="ghost" size="sm" onClick={() => setCustomizing((value) => !value)}>
                {customizing ? 'Hide fields' : 'Customize metadata'}
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
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

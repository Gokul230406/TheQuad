# PipeGenie – Setup Guide

**AI-assisted CI/CD failure handling:** capture failures → diagnose with an LLM → propose fixes → score risk → **human approval** → execute in Docker → optional post-fix test run → live dashboard updates.

---

## Quick start

### Prerequisites

| Tool | Notes |
|------|--------|
| Python | 3.11+ |
| Node.js | 18+ |
| MongoDB | Local or Atlas |
| Docker | Optional but recommended for fix execution and post-fix `backend-tests` verification |
| LLM | **Gemini** (default, needs API key) or **Ollama** (local) or **Mistral API** – see below |

---

## LLM configuration (`backend/.env`)

The backend selects the provider in `backend/agents/llm_factory.py`:

1. `LLM_PROVIDER` = `gemini` | `ollama` | `mistral` (when set explicitly)
2. Legacy: `USE_OLLAMA=true` → Ollama
3. Default: **Gemini** if a Gemini key is present

**Gemini (default)**

```env
LLM_PROVIDER=gemini
GEMINI_API_KEY=your-key
# or GOOGLE_API_KEY=...
GEMINI_MODEL=gemini-2.0-flash
```

Free-tier quotas are small (per-model RPM). The API returns `429` / quota errors; the backend **retries with backoff** and parses “retry in Ns” when present. If you hit limits often: wait, enable billing in Google AI Studio, use a lighter `GEMINI_MODEL`, or switch to Ollama.

**Ollama (local, no Gemini key)**

```powershell
ollama pull mistral
```

```env
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
LLM_MODEL=mistral
```

**Mistral API**

```env
LLM_PROVIDER=mistral
MISTRAL_API_KEY=your-key
```

---

## MongoDB

**Local:** run `mongod` or Windows service.

**Atlas:** set `MONGODB_URL=mongodb+srv://...` in `backend/.env`.

---

## Backend setup

From the **PipeGenie repo root** (folder that contains `backend/` and `frontend/`):

```powershell
cd path\to\PipeGenie\backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
```

Copy or create `backend/.env` (see `config.py` / team template). Minimum example:

```env
MONGODB_URL=mongodb://localhost:27017
MONGODB_DB=pipegenie
REDIS_URL=redis://localhost:6379

# Pick one LLM stack (Gemini example):
LLM_PROVIDER=gemini
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.0-flash

GITHUB_TOKEN=
GITHUB_WEBHOOK_SECRET=pipegenie-webhook-secret
```

---

## Start the backend

From the **project root** (parent of `backend/`):

```powershell
.\start-backend.ps1 -Port 8000 -Reload
```

`start-backend.ps1` stops any process already listening on the port, then runs Uvicorn with the project venv.

Manual alternative (from project root, venv activated):

```powershell
python -m uvicorn backend.main:app --reload --port 8000
```

Expected log lines include MongoDB connected, orchestrator ready, and **PipeGenie is live**. API docs: http://localhost:8000/docs

---

## Start the frontend

```powershell
cd path\to\PipeGenie\frontend
npm install
npm run dev
```

Vite serves the app (default **http://localhost:5173**; another port is used if 5173 is busy).

**API and WebSocket in dev**

- HTTP calls use relative paths like `/api/...` and are **proxied** to the backend (see `frontend/vite.config.js`).
- The dashboard WebSocket uses **the same host as the page** (e.g. `ws://localhost:5173/api/dashboard/ws`) so the proxy can reach the backend. Do not hard-code `ws://localhost:8000` in the client when using Vite dev.

**Optional:** `VITE_BACKEND_URL=http://localhost:8000` – used for health fetches and to build the WebSocket URL when set.

---

## Try the system

### Simulate page

1. Open `/simulate` (e.g. http://localhost:5173/simulate).
2. Choose a scenario and **Run simulation**, or use the scenario builder.
3. Open **Approvals**, review the fix, **Approve** – execution runs in Docker; when the fix succeeds, **post-fix Docker verification** may run (`docker compose --profile test run --rm backend-tests` by default).
4. Watch the **Dashboard** for live WebSocket updates. You should see toasts for `verification_started` / `verification_complete` when verification runs (and a polling fallback on the event detail page if a message was missed).

The scenario builder can take **up to a few minutes** if Gemini is rate-limited (retries + backoff).

### Direct simulate API

```powershell
$body = @{
  repo = "demo-org/demo-repo"
  branch = "main"
  commit_sha = "abc1234"
  commit_message = "demo failure"
  logs = "ERROR: No module named 'cryptography'"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:8000/api/webhook/simulate" `
  -Method POST -Body $body -ContentType "application/json"
```

### Docker sample tests

```powershell
docker compose --profile test run --rm backend-tests
```

### `verify-fix.ps1`

```powershell
.\verify-fix.ps1
# optional: .\verify-fix.ps1 -PullLatestImages
```

Runs the same style of check as automatic post-fix verification.

---

## GitHub integration

1. Create a PAT with `repo` and `actions`; set `GITHUB_TOKEN` in `backend/.env`.
2. Webhook URL: `https://<your-host>/api/webhook/github` (use ngrok locally). Secret must match `GITHUB_WEBHOOK_SECRET`.
3. Install `.github/workflows/ci-with-pipegenie.yml` in the target repo and set repo secrets `PIPEGENIE_URL` and `PIPEGENIE_WEBHOOK_SECRET`.

---

## Architecture (summary)

```
GitHub Actions ──webhook──▶ FastAPI ──▶ MongoDB (Beanie)
                              │
                              ▼
                    Agent orchestrator
                    Diagnosis + Fixer (LangChain)
                    Risk evaluator (Guardian)
                              │
                    Human approval (React)
                              │
                    Docker runner (fix) ──▶ optional verification (Docker tests)
                              │
                    WebSocket ──▶ Dashboard
```

**Vector memory:** Embeddings and fix history use **Milvus** when `MILVUS_HOST` / `MILVUS_PORT` are reachable (see `docker-compose.yml`). If Milvus is down, the app continues; vector features are skipped.

**Approval-first flow:** New failures get a proposed fix and an **approval request**. Execution happens after **Approve** in the UI (or API), not silently from risk tier alone.

---

## Guardian risk scoring

Risk is computed for transparency and sorting in the approval UI (script patterns, branch, fix type, complexity, timing, etc.). **All simulated/production flows in the current orchestrator route fixes through human approval** before Docker execution.

---

## API reference (selected)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/webhook/github` | POST | GitHub webhook |
| `/api/webhook/simulate` | POST | Inject a test failure |
| `/api/webhook/builder-chat` | POST | Scenario builder chat |
| `/api/webhook/preview-diagnosis` | POST | Preview diagnosis |
| `/api/webhook/preview-fix` | POST | Preview fix + risk |
| `/api/dashboard/stats` | GET | Stats |
| `/api/dashboard/events` | GET | Event list |
| `/api/dashboard/events/{id}` | GET | Event detail |
| `/api/dashboard/ws` | WebSocket | Live feed |
| `/api/approvals/pending` | GET | Pending approvals |
| `/api/approvals/{id}/approve` | POST | Approve and run fix |
| `/api/approvals/{id}/reject` | POST | Reject |
| `/health` | GET | Health |
| `/docs` | GET | Swagger |

---

## Troubleshooting

| Issue | What to try |
|-------|-------------|
| MongoDB connection failed | Start `mongod` or fix `MONGODB_URL` |
| Gemini `429` / quota | Wait, billing in AI Studio, lighter `GEMINI_MODEL`, or `LLM_PROVIDER=ollama` |
| Ollama errors | `ollama serve`, `ollama pull mistral`, check `OLLAMA_BASE_URL` |
| No live dashboard updates | Use the Vite URL so `/api` and WS are proxied; check backend on 8000 |
| No verification toast | Ensure Docker runs `backend-tests`; check event timeline and `metadata.verification`; keep dashboard open or open event detail (polling) |
| Redis / Milvus warnings | Optional; app runs with degraded cache / vector features |
| Port 8000 in use | `.\start-backend.ps1 -Port 8001` and set `VITE_BACKEND_URL` if needed |
| `WinError 10013` on 8000 | Port blocked or in use; pick another port |

---

## Hackathon talking points

1. **Real LLM reasoning** on logs (Gemini, Ollama, or Mistral).
2. **Guardian-style risk** surfaced before any fix runs.
3. **Human-in-the-loop** approval before Docker execution.
4. **Isolated execution** and optional **automated Docker verification** after a successful fix.
5. **Live operations UI** via WebSocket + REST.
6. **Milvus** (when available) for similarity over past failures and fixes.

---

*PipeGenie – autonomous CI guardrail demo stack.*

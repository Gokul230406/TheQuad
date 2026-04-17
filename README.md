# PipeGenie – Complete Setup Guide (Windows + Docker Desktop + SigNoz + Milvus)

PipeGenie is an **AI-assisted CI/CD failure handler**:

- **Capture** a pipeline failure (GitHub webhook or simulator)
- **Diagnose** the root cause with an LLM (Gemini / Ollama / Mistral)
- **Generate** a fix script
- **Score risk** (Guardian)
- **Require human approval**
- **Execute in Docker** (isolated)
- **Optionally run post-fix verification tests** in Docker
- **Stream updates live** to the dashboard via WebSocket
- **Observability** via OpenTelemetry → **SigNoz**
- **Vector memory** via **Milvus** (optional; degrades gracefully if not running)

---

## Prerequisites

| Tool | Why | Install |
|------|-----|---------|
| Python 3.11+ | backend local dev | `https://python.org` |
| Node 18+ | frontend dev | `https://nodejs.org` |
| Git | SigNoz bootstrap script clones upstream repo | `https://git-scm.com/download/win` |
| Docker Desktop (Windows) | Docker execution, Milvus stack, SigNoz, verification | `https://www.docker.com/products/docker-desktop/` |

---

## Step 0 — Install Docker Desktop (Windows) + verify

### Install

1. Install **Docker Desktop for Windows**.
2. In Docker Desktop settings:
   - **Enable WSL2 backend** (recommended).
   - Ensure your distro is enabled under **WSL Integration**.
3. Start Docker Desktop and wait for “Docker is running”.

### Verify

Open PowerShell and run:

```powershell
docker version
docker compose version
docker run --rm hello-world
```

If pulls fail due to Docker Hub rate limits, run:

```powershell
docker login
```

---

## Step 1 — Bring up MongoDB + Redis + Milvus (recommended)

PipeGenie can run without Milvus, but **similarity search / fix memory** is enabled only when Milvus is reachable.

This repo includes a Milvus standalone stack in `docker-compose.yml`:

- `etcd` (Milvus metadata)
- `minio` (Milvus storage)
- `milvus` (vector DB)
- `mongodb`, `redis`

From the project root:

```powershell
cd path\to\PipeGenie
docker compose up -d mongodb redis etcd minio milvus
```

Ports (local):

- MongoDB: `27017`
- Redis: `6379`
- Milvus: `19530` (gRPC), `9091` (HTTP)
- MinIO: `9000`, `9001`

Quick health check:

```powershell
docker ps
docker compose logs -n 50 milvus
```

---

## Step 2 — SigNoz (Observability) install + run

PipeGenie exports **traces + app logs** over OTLP/HTTP to SigNoz.

This repo includes a one-command Windows script:

```powershell
cd path\to\PipeGenie
.\start-signoz.ps1
```

What it does:

- Clones SigNoz upstream into `.signoz\signoz` (one time)
- Runs the official SigNoz Docker Compose
- Applies `docker-compose.signoz-override.yml` to create a dev login:
  - **Email**: `admin@pipegenie.local`
  - **Password**: `admin`

After start:

- **SigNoz UI**: `http://localhost:8080`
- **OTLP HTTP endpoint**: `http://localhost:4318`

### PipeGenie OpenTelemetry env

PipeGenie’s OTEL config is in `backend/telemetry.py` and `backend/.env.example`.

Recommended `backend/.env` values:

```env
OTEL_ENABLED=true
# Base URL (NOT /v1/traces) — PipeGenie will append /v1/traces + /v1/logs
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_SERVICE_NAME=pipegenie-backend
```

If you do **not** want SigNoz noise in dev:

```env
OTEL_ENABLED=false
```

---

## Step 3 — LLM configuration (Gemini / Ollama / Mistral)

Selection rules (see `backend/agents/llm_factory.py`):

1. **Explicit:** `LLM_PROVIDER=gemini|ollama|mistral`
2. Legacy: `USE_OLLAMA=true` → Ollama
3. Otherwise defaults to Gemini when a key exists, else may fall back to Mistral if configured

### Option A: Gemini (default)

```env
LLM_PROVIDER=gemini
GEMINI_API_KEY=your-key
GEMINI_MODEL=gemini-2.0-flash
```

Gemini free-tier quotas are small. The backend retries on 429/quota and honors “retry in Ns”.

### Option B: Ollama (local)

Install Ollama (Windows), then:

```powershell
ollama pull mistral
```

Backend `.env`:

```env
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
LLM_MODEL=mistral
```

### Option C: Mistral API

```env
LLM_PROVIDER=mistral
MISTRAL_API_KEY=your-key
```

---

## Step 4 — Backend: install + run (local dev)

### Install

```powershell
cd path\to\PipeGenie\backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
```

Create `backend/.env` (use `backend/.env.example` as a base). Minimum:

```env
MONGODB_URL=mongodb://localhost:27017
MONGODB_DB=pipegenie
REDIS_URL=redis://localhost:6379
MILVUS_HOST=localhost
MILVUS_PORT=19530

GITHUB_TOKEN=
GITHUB_WEBHOOK_SECRET=pipegenie-webhook-secret

# Pick ONE LLM stack:
LLM_PROVIDER=gemini
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.0-flash

# SigNoz (optional)
OTEL_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_SERVICE_NAME=pipegenie-backend
```

### Run (recommended)

From the repo root (uses the project venv):

```powershell
cd path\to\PipeGenie
.\start-backend.ps1 -Port 8000 -Reload
```

Backend endpoints:

- Swagger docs: `http://localhost:8000/docs`
- Health: `http://localhost:8000/health`

---

## Step 5 — Frontend: install + run (local dev)

```powershell
cd path\to\PipeGenie\frontend
npm install
npm run dev
```

Vite will use `http://localhost:5173/` unless that port is taken, then it tries another port.

### Why `/api` and WebSocket “just work” in dev

`frontend/vite.config.js` proxies:

- HTTP: `/api/*` → `http://localhost:8000`
- WS: `/api/dashboard/ws` over the same origin → backend WS

So in dev:

- The client uses **relative** HTTP calls (`/api/...`)
- The dashboard WebSocket is derived from **the current page host**

Optional: to point the UI at a different backend host/port:

```env
VITE_BACKEND_URL=http://localhost:8000
VITE_LOGS_UI_URL=http://localhost:8080
```

---

## Step 6 — Run everything with Docker Compose (alternative)

This repo includes `backend` + `frontend` containers in `docker-compose.yml`.

From the repo root:

```powershell
docker compose up -d mongodb redis etcd minio milvus backend frontend
```

Then open:

- UI: `http://localhost:5173`
- API: `http://localhost:8000`

Notes:

- In docker compose, the backend is wired to container-hostnames:
  - `MONGODB_URL=mongodb://mongodb:27017`
  - `MILVUS_HOST=milvus`
- The compose file currently sets `USE_OLLAMA=true` for the backend container and includes an `ollama` container. If you want Gemini in Docker, adjust the compose env and provide keys via `backend/.env`.

---

## Step 7 — Demo: simulate → approve → verify (and see notifications)

### A) Use the UI

1. Open the UI and go to `/simulate`.
2. Run a simulation.
3. Go to **Approvals** → **Approve** the fix.
4. Watch the dashboard live feed. If verification is enabled and Docker is available, you should see:
   - `verification_started` toast
   - `verification_complete` toast (passed/failed/skipped)

### B) API simulate (PowerShell)

```powershell
$body = @{
  repo = \"demo-org/demo-repo\"
  branch = \"main\"
  commit_sha = \"abc1234\"
  commit_message = \"demo failure\"
  workflow_name = \"demo\"
  logs = \"ERROR: No module named 'cryptography'\"
} | ConvertTo-Json

Invoke-RestMethod -Uri \"http://localhost:8000/api/webhook/simulate\" `
  -Method POST -Body $body -ContentType \"application/json\"
```

### Post-fix Docker verification

PipeGenie’s post-fix verification command is configurable:

- `AUTO_RUN_DOCKER_TESTS=true|false`
- `DOCKER_TEST_COMMAND` (default: `docker compose --profile test run --rm backend-tests`)
- `DOCKER_TEST_TIMEOUT_SECONDS`

Manual run:

```powershell
cd path\to\PipeGenie
docker compose --profile test run --rm backend-tests
```

One-command verification helper:

```powershell
cd path\to\PipeGenie
.\verify-fix.ps1
# optional: .\verify-fix.ps1 -PullLatestImages
```

---

## Step 8 — GitHub integration (real failures)

### 1) Token

Create a GitHub PAT with `repo` and `actions` and set in `backend/.env`:

```env
GITHUB_TOKEN=ghp_...
```

### 2) Webhook

Repo → Settings → Webhooks:

- Payload URL: `http(s)://<your-host>/api/webhook/github`
- Content type: `application/json`
- Secret: same as `GITHUB_WEBHOOK_SECRET`
- Events: **Workflow runs**

Local dev: use ngrok:

```powershell
ngrok http 8000
```

### 3) Workflow

Copy `.github/workflows/ci-with-pipegenie.yml` into the target repo and set secrets:

- `PIPEGENIE_URL`
- `PIPEGENIE_WEBHOOK_SECRET`

---

## Components and ports

| Component | Default | Notes |
|----------|---------|------|
| Backend API | `http://localhost:8000` | FastAPI (`/docs`) |
| Dashboard WS | `ws://<ui-host>/api/dashboard/ws` | proxied in Vite dev |
| Frontend UI | `http://localhost:5173` | Vite may pick another port |
| SigNoz UI | `http://localhost:8080` | `.\start-signoz.ps1` |
| SigNoz OTLP | `http://localhost:4318` | OTLP/HTTP |
| MongoDB | `mongodb://localhost:27017` | or Atlas |
| Redis | `redis://localhost:6379` | optional |
| Milvus | `localhost:19530` | optional (vector store) |

---

## Troubleshooting (common Windows issues)

| Symptom | Fix |
|--------|-----|
| Docker commands fail | Ensure Docker Desktop is running; enable WSL2 backend; run `docker version` |
| Docker Hub rate limit pulling images | `docker login`, then retry |
| `WinError 10013` when starting backend on 8000 | Port blocked/in use; run `.\start-backend.ps1 -Port 8001` |
| Milvus connection error | Ensure `docker compose up -d etcd minio milvus`; or ignore (app degrades gracefully) |
| SigNoz not receiving data | Start SigNoz (`.\start-signoz.ps1`), set `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318`, keep `OTEL_ENABLED=true` |
| Gemini quota `429 ResourceExhausted` | Wait, enable billing, reduce request rate, change `GEMINI_MODEL`, or use Ollama |
| No verification toast | Ensure Docker Desktop is running and `AUTO_RUN_DOCKER_TESTS=true`; check event timeline `metadata.verification` |
| Frontend says connected but no events | Use the Vite URL (not a file:// build), ensure WS path is `/api/dashboard/ws` and backend is up |

---



Milvus is used for similarity search over past failures/fixes when available (`MILVUS_HOST`, `MILVUS_PORT`).

# 🧞 PipeGenie – Complete Setup Guide for Hackathon

> **AI-Powered CI/CD Pipeline Auto-Remediation System**
> Captures failures → Diagnoses with AI → Generates fixes → Evaluates risk → Executes or routes to approval → Re-runs CI

---

## ⚡ Quick Start (5 Minutes)

### Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Python | 3.11+ | [python.org](https://python.org) |
| Node.js | 18+ | [nodejs.org](https://nodejs.org) |
| MongoDB | 7.0 | `winget install MongoDB.Server` or [Atlas free tier](https://cloud.mongodb.com) |
| Ollama | Latest | [ollama.com](https://ollama.com/download) |

---

## 📦 Step 1 – Install Ollama + Mistral Model (FREE AI)

```powershell
# 1. Download Ollama from https://ollama.com/download/windows
# 2. After install, pull Mistral model (runs 100% locally, FREE)
ollama pull mistral
# Verify
ollama run mistral "Say hello!"
```

> **Why Ollama?** Runs Mistral 7B locally on your machine. No API keys needed. No cost. Works offline.

---

## 🗄️ Step 2 – Start MongoDB

**Option A – Local MongoDB:**
```powershell
# If MongoDB is installed via winget/msi
Start-Service MongoDB
```

**Option B – MongoDB Atlas (Free Cloud, Recommended):**
1. Go to [cloud.mongodb.com](https://cloud.mongodb.com)
2. Create free M0 cluster
3. Get connection string
4. Set `MONGODB_URL=mongodb+srv://...` in your `.env`

---

## 🔧 Step 3 – Backend Setup

```powershell
# Navigate to backend
cd c:\Users\G Harshitha\Documents\projects\pipegenie\backend

# Create virtual environment
python -m venv venv
.\venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy environment file
Copy-Item .env.example .env

# Edit .env with your settings (optional for local testing)
notepad .env
```

**.env minimum config:**
```env
MONGODB_URL=mongodb://localhost:27017   # or your Atlas URL
USE_OLLAMA=true
OLLAMA_BASE_URL=http://localhost:11434
LLM_MODEL=mistral
GITHUB_TOKEN=                          # Add your token for real GitHub integration
```

---

## 🚀 Step 4 – Start the Backend

```powershell
# From the project root pipegenie/
cd c:\Users\G Harshitha\Documents\projects\pipegenie

# Activate venv
.\backend\venv\Scripts\activate

# Run FastAPI server
python -m uvicorn backend.main:app --reload --port 8000
```

You should see:
```
✅ MongoDB connected: pipegenie
✅ Redis connected  (or ⚠️ Redis not available - this is OK)
✅ Agent Orchestrator ready
🚀 PipeGenie is live!
INFO:     Uvicorn running on http://0.0.0.0:8000
```

📖 **API docs**: Open http://localhost:8000/docs

---

## 🎨 Step 5 – Start the Frontend

```powershell
# In a new terminal
cd c:\Users\G Harshitha\Documents\projects\pipegenie\frontend
npm run dev
```

Open http://localhost:5173 → You'll see the PipeGenie dashboard 🎉

---

## 🧪 Step 6 – Test the System

### Option A: Use the Simulate Page (Easiest)
1. Open http://localhost:5173/simulate
2. Pick a scenario (e.g., "Missing Dependency")
3. Click **Run Simulation**
4. Watch the Dashboard Live Feed update in real-time

### Option B: Direct API Call
```powershell
# Inject a test failure
$body = @{
  repo = "your-org/your-repo"
  branch = "main"
  commit_sha = "abc1234"
  commit_message = "feat: add new module"
  logs = "ERROR: No module named 'cryptography'"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:8000/api/webhook/simulate" `
  -Method POST -Body $body -ContentType "application/json"
```

### Option C: Sample Unit Testing in Docker
```powershell
# Run backend sample unit tests inside a container
docker compose --profile test run --rm backend-tests
```

This sample runs `backend/tests/test_risk_evaluator.py` and validates risk + timing logic.

---

## 🔗 Step 7 – Connect to Real GitHub (For Demo/Production)

### Create GitHub Personal Access Token
1. Go to GitHub → Settings → Developer Settings → Personal Access Tokens
2. Create token with scopes: `repo`, `actions`
3. Add to `.env`: `GITHUB_TOKEN=ghp_...`

### Configure GitHub Webhook
1. Go to your repo → Settings → Webhooks → Add webhook
2. **Payload URL**: `http://your-public-url:8000/api/webhook/github`
   - Use **ngrok** for local testing: `ngrok http 8000`
3. **Content type**: `application/json`
4. **Secret**: Same as `GITHUB_WEBHOOK_SECRET` in your `.env`
5. **Events**: Select "Workflow runs"

### Install the GitHub Actions Workflow
Copy `.github/workflows/ci-with-pipegenie.yml` to your target repo and add these secrets:
- `PIPEGENIE_URL`: Your PipeGenie server URL
- `PIPEGENIE_WEBHOOK_SECRET`: Your webhook secret

---

## 🏗️ Architecture Deep Dive (For Judges)

```
                    ┌─────────────────────┐
                    │   GitHub Actions     │
                    │   (CI Pipeline)      │
                    └──────────┬──────────┘
                               │ webhook on failure
                               ▼
                    ┌─────────────────────┐
                    │   FastAPI Backend    │
                    │   (Python 3.11)      │
                    │                     │
                    │ ┌─────────────────┐ │
                    │ │   MongoDB       │ │  ← Persistent storage
                    │ │   (Beanie ODM)  │ │
                    │ └─────────────────┘ │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │  Agent Orchestrator  │
                    │  (LangChain)         │
                    └──────────┬──────────┘
                               │
               ┌───────────────┴──────────────┐
               │                              │
    ┌──────────▼──────────┐       ┌───────────▼──────────┐
    │   Diagnosis Agent    │       │    Fixer Agent        │
    │   (Mistral + LC)    │──────▶│    (Mistral + LC)    │
    │   Root cause AI     │       │   Script generation   │
    └─────────────────────┘       └───────────┬──────────┘
                                              │
                                   ┌──────────▼──────────┐
                                   │  Guardian Module     │
                                   │  Risk Evaluator      │
                                   │  (5-factor scoring)  │
                                   └────────┬─────────────┘
                                            │
                              ┌─────────────┴──────────┐
                         Low/Medium                    High Risk
                              │                         │
                    ┌─────────▼─────────┐    ┌─────────▼──────────┐
                    │  Docker Runner    │    │  Approval UI (React) │
                    │  (Auto Execute)   │    │  Human Review        │
                    └─────────┬─────────┘    └─────────┬──────────┘
                              │                         │ Approved
                              └────────────┬────────────┘
                                           │
                                ┌──────────▼──────────┐
                                │  GitHub Actions      │
                                │  Re-run Trigger      │
                                └──────────┬──────────┘
                                           │
                                ┌──────────▼──────────┐
                                │  React Dashboard     │
                                │  (Real-time WebSocket)│
                                │  + ChromaDB Memory   │
                                └─────────────────────┘
```

## 🛡️ Guardian Risk Scoring (5 Factors)

| Factor | Weight | What it checks |
|--------|--------|----------------|
| Script Pattern Analysis | 40% | Dangerous commands (rm -rf, DROP TABLE, etc.) |
| Branch Protection | 30% | main/production = higher risk |
| Fix Type Risk | 20% | permissions/config = riskier than dependency |
| Script Complexity | 10% | Longer scripts = more risk |
| LLM Confidence Override | — | AI's own risk estimate |

Risk Levels:
- 🟢 **Low (0-30%)**: Auto-executed immediately
- 🟡 **Medium (30-70%)**: Auto-executed with extra logging
- 🔴 **High (70-100%)**: Routes to human approval UI

## 💾 ChromaDB Vector Memory

PipeGenie learns from every failure:
1. Each failure pattern → stored as embedding in ChromaDB
2. Each successful fix → stored linked to failure category
3. Next similar failure → retrieves top 3 similar cases instantly
4. Fix generation has context → better, faster fixes

---

## 🔍 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/webhook/github` | POST | GitHub webhook receiver |
| `/api/webhook/simulate` | POST | **Test endpoint** – inject fake failure |
| `/api/dashboard/stats` | GET | System-wide statistics |
| `/api/dashboard/events` | GET | Paginated event list |
| `/api/dashboard/events/{id}` | GET | Full event details + logs |
| `/api/dashboard/ws` | WS | Real-time WebSocket feed |
| `/api/approvals/pending` | GET | Pending human approvals |
| `/api/approvals/{id}/approve` | POST | Approve a fix (supports optional `edited_fix_script`) |
| `/api/approvals/{id}/reject` | POST | Reject a fix |
| `/health` | GET | Health check |
| `/docs` | GET | Interactive API docs (Swagger) |

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| MongoDB connection failed | Run `mongod` or use Atlas connection string |
| Ollama not found | Install from ollama.com, then `ollama pull mistral` |
| LLM timeout | Mistral 7B needs ~4GB RAM. Try `ollama pull mistral:7b-instruct-q4_0` (smaller) |
| ChromaDB error | Delete `./chroma_db` folder and restart |
| Redis not available | OK – Redis is optional. System runs without it |
| Port 8000 in use | Change port: `uvicorn backend.main:app --port 8001` |

---

## 🏆 Hackathon Talking Points

1. **Real AI, not faked** – Mistral 7B actually reads and understands logs
2. **Production-safe Guardian** – 5-factor risk scoring prevents dangerous auto-fixes
3. **Learning system** – ChromaDB makes it smarter with every failure
4. **Full observability** – WebSocket dashboard shows every decision in real-time
5. **Human-in-the-loop** – High-risk fixes require explicit approval
6. **Docker isolation** – Fixes run in sandboxed containers, never on host
7. **Zero-cost stack** – Every component is open source and free

---

*Built for hackathon by Team PipeGenie* 🧞‍♂️

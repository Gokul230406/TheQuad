"""
GitHub Webhook Route – receives and validates GitHub Actions events.
"""
import hashlib
import hmac
import logging
import json
import time
from datetime import datetime
from fastapi import APIRouter, Request, HTTPException, BackgroundTasks, Depends

from backend.config import settings
from backend.models.pipeline_event import PipelineEvent, PipelineStatus
from backend.services.github_service import GitHubService
from backend.schemas.requests import (
    PreviewRequest,
    ScenarioBuilderRequest,
    SimulationRequest,
)
from backend.agents.llm_factory import build_chat_llm
from backend.agents.llm_retry import chat_invoke_with_retry, is_llm_rate_limit_error
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

logger = logging.getLogger(__name__)


def _builder_chat_user_visible_error(exc: Exception) -> tuple[str, str]:
    """Return (message_for_client, error_detail) for builder-chat failures."""
    detail = str(exc).strip() or type(exc).__name__
    if isinstance(exc, ModuleNotFoundError) and "langchain_google" in detail:
        msg = (
            "Missing Python package for Gemini (langchain-google-genai). "
            "Install backend dependencies: pip install -r backend/requirements.txt"
        )
        return msg, detail
    # Rate limits before ValueError: some client wrappers subclass ValueError.
    if is_llm_rate_limit_error(exc):
        msg = (
            "Gemini rate limit or free-tier quota reached (free tier is very small per model). "
            "Wait a minute and retry, enable billing in Google AI Studio, set GEMINI_MODEL to a "
            "lighter model, or use LLM_PROVIDER=ollama in backend/.env with Ollama running locally."
        )
        return msg, detail
    if isinstance(exc, ValueError):
        return detail, detail
    return f"Failed to process message ({type(exc).__name__}: {detail[:400]})", detail


def _coerce_llm_content_to_str(content) -> str:
    """Normalize LangChain / Gemini message content to a plain string."""
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict) and item.get("type") == "text" and "text" in item:
                parts.append(str(item["text"]))
            elif isinstance(item, dict) and "text" in item:
                parts.append(str(item["text"]))
            else:
                parts.append(str(item))
        return "".join(parts)
    return str(content)
router = APIRouter(prefix="/webhook", tags=["webhooks"])


def get_orchestrator(request: Request):
    return request.app.state.orchestrator


# Scenario builder conversation state (in production, use Redis or DB)
_builder_sessions = {}

BUILDER_SYSTEM_PROMPT = """You are PipeGenie's Scenario Builder — an intelligent CI/CD failure assistant.
Your job is to understand what went wrong in the user's pipeline through a friendly conversation.

Ask ONE clarifying question at a time. Be conversational and natural.
Focus on: failure type, service/component affected, error symptoms, environment, and any error keywords.

After gathering enough info (3-5 exchanges), provide JSON: 
{
  "scenario_name": "Human-readable name",
  "failure_category": "dependency_error|test_failure|build_error|config_error|network_error|permissions_error|unknown",
  "repo": "repo-name",
  "branch": "branch-name",
  "commit_message": "what was the user trying to do",
  "logs": "reconstructed error logs from conversation",
  "ready_to_simulate": true
}

Before that, just respond with conversational text asking the next question."""


@router.post("/builder-chat")
async def scenario_builder_chat(
    payload: ScenarioBuilderRequest,
    orchestrator=Depends(get_orchestrator)
):
    """Conversational scenario builder - ask clarifying questions to build a failure scenario."""
    session_id = payload.session_id
    user_message = payload.message
    
    if session_id not in _builder_sessions:
        _builder_sessions[session_id] = {"history": [], "turn_count": 0}
    
    session = _builder_sessions[session_id]
    session["history"].append({"role": "user", "content": user_message})
    session["turn_count"] += 1
    
    # Build message history for LLM (cap history for lower latency)
    messages = [SystemMessage(content=BUILDER_SYSTEM_PROMPT)]
    for msg in session["history"][-8:]:
        if msg["role"] == "user":
            messages.append(HumanMessage(content=msg["content"]))
        else:
            messages.append(AIMessage(content=msg["content"]))
    
    try:
        started = time.perf_counter()
        parsed_payload = None

        # Conversational builder must NOT use diagnosis JSON mode (Gemini JSON-only breaks chat turns).
        builder_llm = build_chat_llm(temperature=0.35, json_mode=False)
        provider = type(builder_llm).__name__
        response = await chat_invoke_with_retry(builder_llm, messages)
        assistant_message = _coerce_llm_content_to_str(getattr(response, "content", None))

        if isinstance(assistant_message, str):
            try:
                parsed_payload = json.loads(assistant_message)
            except json.JSONDecodeError:
                parsed_payload = None

        if isinstance(parsed_payload, dict):
            if "Assistant" in parsed_payload and isinstance(parsed_payload["Assistant"], str):
                assistant_message = parsed_payload["Assistant"]
            elif "message" in parsed_payload and isinstance(parsed_payload["message"], str):
                assistant_message = parsed_payload["message"]
            elif "reply" in parsed_payload and isinstance(parsed_payload["reply"], str):
                assistant_message = parsed_payload["reply"]
            elif parsed_payload.get("ready_to_simulate"):
                nm = parsed_payload.get("scenario_name") or "your scenario"
                assistant_message = (
                    f"Scenario is ready: {nm}. Close this panel and click Run simulation when you are ready."
                )

        elapsed_ms = int((time.perf_counter() - started) * 1000)
        logger.info(f"[BuilderChat] provider={provider} elapsed_ms={elapsed_ms} session={session_id}")
        
        session["history"].append({"role": "assistant", "content": assistant_message})
        
        # Check if we got a structured scenario response
        try:
            scenario_data = parsed_payload if isinstance(parsed_payload, dict) else json.loads(assistant_message)
            if scenario_data.get("ready_to_simulate"):
                return {
                    "message": assistant_message,
                    "scenario": scenario_data,
                    "ready": True,
                    "provider": provider,
                    "elapsed_ms": elapsed_ms,
                }
        except json.JSONDecodeError:
            pass
        
        return {
            "message": assistant_message,
            "scenario": None,
            "ready": False,
            "provider": provider,
            "elapsed_ms": elapsed_ms,
        }
    
    except Exception as e:
        logger.exception("Builder chat failed")
        user_msg, detail = _builder_chat_user_visible_error(e)
        return {"error": detail, "message": user_msg}


def verify_signature(payload_body: bytes, signature_header: str) -> bool:
    """Verify GitHub webhook HMAC-SHA256 signature."""
    if not signature_header:
        return False
    hash_object = hmac.new(
        settings.GITHUB_WEBHOOK_SECRET.encode("utf-8"),
        msg=payload_body,
        digestmod=hashlib.sha256
    )
    expected = f"sha256={hash_object.hexdigest()}"
    return hmac.compare_digest(expected, signature_header)


@router.post("/github")
async def github_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    orchestrator=Depends(get_orchestrator)
):
    """Receives GitHub Actions webhook events."""
    body = await request.body()
    signature = request.headers.get("X-Hub-Signature-256", "")

    # Verify signature (skip in dev mode if secret matches default)
    if settings.GITHUB_WEBHOOK_SECRET != "pipegenie-webhook-secret":
        if not verify_signature(body, signature):
            raise HTTPException(status_code=401, detail="Invalid webhook signature")

    event_type = request.headers.get("X-GitHub-Event", "")
    payload = await request.json()

    logger.info(f"[Webhook] Received event: {event_type}")

    # Only process workflow_run failures
    if event_type == "workflow_run":
        action = payload.get("action")
        workflow_run = payload.get("workflow_run", {})
        conclusion = workflow_run.get("conclusion")

        if action == "completed" and conclusion == "failure":
            event = await _create_pipeline_event(payload, workflow_run)
            background_tasks.add_task(orchestrator.process_failure, event)
            logger.info(f"[Webhook] Queued processing for run {workflow_run.get('id')}")
            return {"status": "accepted", "event_id": event.event_id}

    # Handle ping
    if event_type == "ping":
        return {"status": "pong", "message": "PipeGenie webhook active!"}

    return {"status": "ignored", "reason": f"Event type '{event_type}' not handled"}


async def _create_pipeline_event(payload: dict, workflow_run: dict) -> PipelineEvent:
    """Create and persist a PipelineEvent from GitHub webhook payload."""
    repo = payload.get("repository", {})
    head_commit = workflow_run.get("head_commit", {})

    event = PipelineEvent(
        event_id=str(workflow_run.get("id", "")),
        repo_full_name=repo.get("full_name", ""),
        repo_name=repo.get("name", ""),
        branch=workflow_run.get("head_branch", ""),
        commit_sha=workflow_run.get("head_sha", ""),
        commit_message=head_commit.get("message", ""),
        workflow_name=workflow_run.get("name", ""),
        status=PipelineStatus.FAILED,
        raw_logs=_extract_logs_from_payload(payload),
        metadata={
            "html_url": workflow_run.get("html_url", ""),
            "actor": workflow_run.get("actor", {}).get("login", ""),
            "run_attempt": workflow_run.get("run_attempt", 1),
            "jobs_url": workflow_run.get("jobs_url", "")
        }
    )
    await event.insert()
    return event


def _extract_logs_from_payload(payload: dict) -> str:
    """Extract any available log data from the payload context."""
    wf = payload.get("workflow_run", {})
    return (
        f"Workflow: {wf.get('name', 'Unknown')}\n"
        f"Branch: {wf.get('head_branch', '')}\n"
        f"Conclusion: {wf.get('conclusion', 'failure')}\n"
        f"Run URL: {wf.get('html_url', '')}\n"
        f"Attempt: {wf.get('run_attempt', 1)}\n"
        f"[Logs will be fetched from GitHub API]\n"
    )


@router.post("/preview-diagnosis")
async def preview_diagnosis(payload: PreviewRequest, orchestrator=Depends(get_orchestrator)):
    """Preview diagnosis for simulation logs (agentic workflow)."""
    try:
        diagnosis = await orchestrator.diagnosis_agent.analyze(
            event_id="preview",
            logs=payload.logs,
            repo=payload.repo,
            branch=payload.branch,
            commit_message=payload.commit_message
        )
        return {"diagnosis": diagnosis}
    except Exception as e:
        logger.error(f"Diagnosis preview failed: {e}")
        return {"error": str(e), "diagnosis": None}


@router.post("/preview-fix")
async def preview_fix(payload: PreviewRequest, orchestrator=Depends(get_orchestrator)):
    """Preview proposed fix before executing (agentic workflow)."""
    try:
        # First diagnose
        diagnosis = await orchestrator.diagnosis_agent.analyze(
            event_id="preview-fix",
            logs=payload.logs,
            repo=payload.repo,
            branch=payload.branch,
            commit_message=payload.commit_message
        )
        
        # Then generate a fix based on diagnosis
        fix = await orchestrator.fixer_agent.generate_fix(
            diagnosis=diagnosis,
            repo=payload.repo,
            branch=payload.branch,
            raw_logs=payload.logs
        )
        
        # Evaluate risk
        risk = orchestrator.risk_evaluator.evaluate(
            fix=fix,
            diagnosis=diagnosis,
            repo=payload.repo,
            branch=payload.branch,
            raw_logs=payload.logs or "",
        )
        
        return {
            "diagnosis": diagnosis,
            "proposed_fix": fix,
            "risk_assessment": risk
        }
    except Exception as e:
        logger.error(f"Fix preview failed: {e}")
        return {"error": str(e), "fix": None}


@router.post("/simulate")
async def simulate_failure(
    payload: SimulationRequest,
    background_tasks: BackgroundTasks,
    orchestrator=Depends(get_orchestrator)
):
    """Simulate a pipeline failure for testing (dev endpoint)."""
    event = PipelineEvent(
        event_id=f"sim-{int(datetime.utcnow().timestamp())}",
        repo_full_name=payload.repo,
        repo_name=payload.repo.split("/")[-1],
        branch=payload.branch,
        commit_sha=payload.commit_sha,
        commit_message=payload.commit_message,
        workflow_name=payload.workflow_name,
        status=PipelineStatus.FAILED,
        raw_logs=payload.logs or DEFAULT_SAMPLE_LOGS,
        metadata={"simulated": True}
    )
    await event.insert()
    background_tasks.add_task(orchestrator.process_failure, event)

    return {"status": "simulated", "event_id": event.event_id, "db_id": str(event.id)}


DEFAULT_SAMPLE_LOGS = """
Run actions/setup-python@v4
  with:
    python-version: 3.11
Setting up Python 3.11.0

Run pip install -r requirements.txt
Collecting flask==2.3.0
  Downloading Flask-2.3.0-py3-none-any.whl (96 kB)
ERROR: Could not find a version that satisfies the requirement cryptography==41.0.0 (from versions: 39.0.0, 40.0.0)
ERROR: No matching distribution found for cryptography==41.0.0
##[error]Process completed with exit code 1.
"""

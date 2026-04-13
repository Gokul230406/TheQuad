"""
GitHub Webhook Route – receives and validates GitHub Actions events.
"""
import hashlib
import hmac
import logging
from datetime import datetime
from fastapi import APIRouter, Request, HTTPException, BackgroundTasks, Depends

from backend.config import settings
from backend.models.pipeline_event import PipelineEvent, PipelineStatus
from backend.services.github_service import GitHubService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/webhook", tags=["webhooks"])


def get_orchestrator(request: Request):
    return request.app.state.orchestrator


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


@router.post("/simulate")
async def simulate_failure(
    request: Request,
    background_tasks: BackgroundTasks,
    orchestrator=Depends(get_orchestrator)
):
    """Simulate a pipeline failure for testing (dev endpoint)."""
    body = await request.json()

    event = PipelineEvent(
        event_id=f"sim-{int(datetime.utcnow().timestamp())}",
        repo_full_name=body.get("repo", "demo-org/demo-repo"),
        repo_name=body.get("repo", "demo-repo").split("/")[-1],
        branch=body.get("branch", "main"),
        commit_sha=body.get("commit_sha", "abc1234"),
        commit_message=body.get("commit_message", "feat: add new feature"),
        workflow_name=body.get("workflow_name", "CI Pipeline"),
        status=PipelineStatus.FAILED,
        raw_logs=body.get("logs", DEFAULT_SAMPLE_LOGS),
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

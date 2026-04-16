"""
Approvals route – human-in-the-loop approval interface.
"""
import logging
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel

from backend.models.approval_request import ApprovalRequest, ApprovalStatus
from backend.models.pipeline_event import PipelineEvent
from backend.guardian.risk_evaluator import RiskEvaluator

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/approvals", tags=["approvals"])
_risk_evaluator = RiskEvaluator()
RISK_EVALUATION_VERSION = 4


def get_orchestrator(request: Request):
    return request.app.state.orchestrator


class ApprovalAction(BaseModel):
    reviewer: str = "admin"
    note: Optional[str] = ""
    edited_fix_script: Optional[str] = None


@router.get("/pending")
async def list_pending_approvals():
    """List all pending approval requests."""
    approvals = await ApprovalRequest.find(
        ApprovalRequest.status == ApprovalStatus.PENDING
    ).sort("-created_at").to_list()

    # Re-score with the latest rules so older pending approvals don't stay stale.
    for approval in approvals:
        await _refresh_pending_assessment(approval)

    return {
        "total": len(approvals),
        "approvals": [_serialize_approval(a) for a in approvals]
    }


@router.get("/{approval_id}")
async def get_approval(approval_id: str):
    """Get a specific approval request."""
    approval = await ApprovalRequest.get(approval_id)
    if not approval:
        raise HTTPException(404, "Approval not found")
    return _serialize_approval(approval)


@router.post("/{approval_id}/approve")
async def approve_fix(
    approval_id: str,
    action: ApprovalAction,
    orchestrator=Depends(get_orchestrator)
):
    """Approve a high-risk fix for execution."""
    try:
        await orchestrator.execute_approved_fix(
            approval_id=approval_id,
            reviewer=action.reviewer,
            note=action.note,
            edited_fix_script=action.edited_fix_script,
        )
        return {"status": "approved", "message": "Fix approved and executing..."}
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        logger.error(f"Approval execution error: {e}")
        raise HTTPException(500, f"Failed to execute fix: {str(e)}")


@router.post("/{approval_id}/reject")
async def reject_fix(
    approval_id: str,
    action: ApprovalAction,
    orchestrator=Depends(get_orchestrator)
):
    """Reject a fix request."""
    try:
        await orchestrator.reject_fix(
            approval_id=approval_id,
            reviewer=action.reviewer,
            note=action.note
        )
        return {"status": "rejected", "message": "Fix rejected successfully"}
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/history/all")
async def approval_history():
    """Get full approval history."""
    approvals = await ApprovalRequest.find_all().sort("-created_at").limit(50).to_list()
    return {"approvals": [_serialize_approval(a) for a in approvals]}


def _serialize_approval(a: ApprovalRequest) -> dict:
    return {
        "id": str(a.id),
        "event_id": a.event_id,
        "repo_full_name": a.repo_full_name,
        "branch": a.branch,
        "commit_sha": a.commit_sha[:8] if a.commit_sha else "",
        "root_cause": a.root_cause,
        "proposed_fix": a.proposed_fix,
        "fix_script": a.fix_script,
        "risk_score": a.risk_score,
        "risk_level": a.risk_level,
        "risk_reasons": a.risk_reasons,
        "estimated_duration_seconds": a.estimated_duration_seconds,
        "timing_level": a.timing_level,
        "timing_reasons": a.timing_reasons,
        "status": a.status,
        "reviewer_note": a.reviewer_note,
        "reviewed_by": a.reviewed_by,
        "reviewed_at": _to_utc_iso(a.reviewed_at) if a.reviewed_at else None,
        "expires_at": _to_utc_iso(a.expires_at) if a.expires_at else None,
        "created_at": _to_utc_iso(a.created_at)
    }


def _to_utc_iso(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


async def _refresh_pending_assessment(approval: ApprovalRequest) -> None:
    if approval.status != ApprovalStatus.PENDING:
        return

    event = await PipelineEvent.get(approval.event_id)
    event_risk = event.metadata.get("risk", {}) if event and isinstance(event.metadata, dict) and isinstance(event.metadata.get("risk"), dict) else {}
    event_risk_version = int(event.metadata.get("risk_version", 0)) if event and isinstance(event.metadata, dict) else 0

    stale_risk = approval.risk_score is None or approval.risk_score <= 0.15
    stale_timing = (approval.estimated_duration_seconds or 0.0) <= 0.0 or approval.timing_level in ("", "unknown", None)
    score_mismatch = bool(event_risk) and abs(float(event_risk.get("score", approval.risk_score or 0.0)) - float(approval.risk_score or 0.0)) > 0.001
    should_refresh = stale_risk or stale_timing or score_mismatch or (event_risk_version < RISK_EVALUATION_VERSION)
    if not should_refresh:
        return

    fix_meta = event.metadata.get("fix", {}) if event and isinstance(event.metadata, dict) else {}
    diagnosis = event.metadata.get("diagnosis", {}) if event and isinstance(event.metadata, dict) else {}

    fix_payload = {
        "fix_type": fix_meta.get("fix_type", "manual"),
        "fix_description": fix_meta.get("fix_description") or approval.proposed_fix,
        "fix_script": fix_meta.get("fix_script") or approval.fix_script,
        "estimated_risk": fix_meta.get("estimated_risk", 0.3),
    }

    risk = _risk_evaluator.evaluate(
        fix=fix_payload,
        diagnosis=diagnosis if isinstance(diagnosis, dict) else {},
        repo=approval.repo_full_name,
        branch=approval.branch,
    )

    timing = risk.get("timing", {}) if isinstance(risk, dict) else {}
    approval.risk_score = risk.get("score", approval.risk_score)
    approval.risk_level = risk.get("level", approval.risk_level)
    approval.risk_reasons = risk.get("reasons", approval.risk_reasons)
    approval.estimated_duration_seconds = float(timing.get("estimated_seconds", 0.0) or 0.0)
    approval.timing_level = timing.get("level", "unknown")
    approval.timing_reasons = timing.get("reasons", [])
    await approval.save()

    if event:
        event.risk_score = approval.risk_score
        event.risk_level = approval.risk_level
        event.metadata["risk"] = risk
        event.metadata["risk_version"] = RISK_EVALUATION_VERSION
        event.update_timestamp()
        await event.save()

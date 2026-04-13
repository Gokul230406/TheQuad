"""
Approvals route – human-in-the-loop approval interface.
"""
import logging
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel

from backend.models.approval_request import ApprovalRequest, ApprovalStatus
from backend.models.pipeline_event import PipelineEvent

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/approvals", tags=["approvals"])


def get_orchestrator(request: Request):
    return request.app.state.orchestrator


class ApprovalAction(BaseModel):
    reviewer: str = "admin"
    note: Optional[str] = ""


@router.get("/pending")
async def list_pending_approvals():
    """List all pending approval requests."""
    approvals = await ApprovalRequest.find(
        ApprovalRequest.status == ApprovalStatus.PENDING
    ).sort("-created_at").to_list()

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
            note=action.note
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
        "status": a.status,
        "reviewer_note": a.reviewer_note,
        "reviewed_by": a.reviewed_by,
        "reviewed_at": a.reviewed_at.isoformat() if a.reviewed_at else None,
        "expires_at": a.expires_at.isoformat() if a.expires_at else None,
        "created_at": a.created_at.isoformat()
    }

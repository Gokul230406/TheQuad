"""
Dashboard route – real-time stats and event listing.
"""
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect, Request
from beanie.operators import In

from backend.models.pipeline_event import PipelineEvent, PipelineStatus
from backend.models.approval_request import ApprovalRequest, ApprovalStatus
from backend.models.fix_record import FixRecord, FixStatus
from backend.guardian.risk_evaluator import RiskEvaluator

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/dashboard", tags=["dashboard"])
_risk_evaluator = RiskEvaluator()
RISK_EVALUATION_VERSION = 4


@router.get("/stats")
async def get_stats():
    """Overall system statistics for the dashboard."""
    total_events = await PipelineEvent.count()
    fixed = await PipelineEvent.find(PipelineEvent.status == PipelineStatus.FIXED).count()
    failed_to_fix = await PipelineEvent.find(PipelineEvent.status == PipelineStatus.FAILED_TO_FIX).count()
    awaiting = await PipelineEvent.find(PipelineEvent.status == PipelineStatus.AWAITING_APPROVAL).count()
    in_progress = await PipelineEvent.find(
        In(PipelineEvent.status, [
            PipelineStatus.DIAGNOSING, PipelineStatus.FIX_PENDING,
            PipelineStatus.FIXING, PipelineStatus.RETRYING
        ])
    ).count()

    # Success rate
    resolved = fixed + failed_to_fix
    success_rate = (fixed / resolved * 100) if resolved > 0 else 0

    # Fix records
    total_fixes = await FixRecord.count()
    successful_fixes = await FixRecord.find(FixRecord.status == FixStatus.SUCCESS).count()
    auto_fixed = await FixRecord.find(FixRecord.auto_applied == True).count()

    # Pending approvals
    pending_approvals = await ApprovalRequest.find(
        ApprovalRequest.status == ApprovalStatus.PENDING
    ).count()

    # Recent 24h stats
    since = datetime.utcnow() - timedelta(hours=24)
    recent_events = await PipelineEvent.find(
        PipelineEvent.created_at >= since
    ).count()

    return {
        "total_events": total_events,
        "fixed": fixed,
        "failed_to_fix": failed_to_fix,
        "awaiting_approval": awaiting,
        "in_progress": in_progress,
        "success_rate": round(success_rate, 1),
        "total_fixes": total_fixes,
        "successful_fixes": successful_fixes,
        "auto_fixed": auto_fixed,
        "pending_approvals": pending_approvals,
        "events_last_24h": recent_events
    }


@router.get("/events")
async def list_events(
    page: int = Query(1, ge=1),
    limit: int = Query(20, le=100),
    status: Optional[str] = None,
    repo: Optional[str] = None
):
    """Paginated list of pipeline events."""
    query = PipelineEvent.find()

    if status:
        try:
            s = PipelineStatus(status)
            query = PipelineEvent.find(PipelineEvent.status == s)
        except ValueError:
            pass

    if repo:
        query = query.find(PipelineEvent.repo_full_name == repo)

    total = await PipelineEvent.count()
    events = await query.sort("-created_at").skip((page - 1) * limit).limit(limit).to_list()

    for event in events:
        await _refresh_event_assessment(event)

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "events": [_serialize_event(e) for e in events]
    }


@router.get("/events/{event_id}")
async def get_event(event_id: str):
    """Get detailed info about a specific pipeline event."""
    # Try by MongoDB ID first
    try:
        event = await PipelineEvent.get(event_id)
    except Exception:
        event = None

    # Try by GitHub run ID
    if not event:
        event = await PipelineEvent.find_one(PipelineEvent.event_id == event_id)

    if not event:
        from fastapi import HTTPException
        raise HTTPException(404, "Event not found")

    await _refresh_event_assessment(event)

    return _serialize_event(event, include_logs=True)


@router.get("/repositories")
async def get_repositories():
    """List unique repositories with stats."""
    pipeline = [
        {"$group": {"_id": "$repo_full_name", "count": {"$sum": 1},
                    "fixed": {"$sum": {"$cond": [{"$eq": ["$status", "fixed"]}, 1, 0]}}}},
        {"$sort": {"count": -1}},
        {"$limit": 20}
    ]
    try:
        results = await PipelineEvent.aggregate(pipeline).to_list()
        return {"repositories": [{"repo": r["_id"], "total": r["count"], "fixed": r["fixed"]}
                                  for r in results]}
    except Exception:
        return {"repositories": []}


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time dashboard updates."""
    app = websocket.app
    manager = app.state.ws_manager
    await manager.connect(websocket)
    try:
        while True:
            # Keep connection alive, send ping every 30s
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text('{"type":"pong"}')
    except WebSocketDisconnect:
        manager.disconnect(websocket)


def _serialize_event(event: PipelineEvent, include_logs: bool = False) -> dict:
    risk_meta = event.metadata.get("risk", {}) if isinstance(event.metadata, dict) else {}
    timing_meta = risk_meta.get("timing", {}) if isinstance(risk_meta, dict) else {}

    data = {
        "id": str(event.id),
        "event_id": event.event_id,
        "repo_full_name": event.repo_full_name,
        "branch": event.branch,
        "commit_sha": event.commit_sha[:8] if event.commit_sha else "",
        "commit_message": event.commit_message[:100] if event.commit_message else "",
        "workflow_name": event.workflow_name,
        "status": event.status,
        "failure_category": event.failure_category,
        "root_cause": event.root_cause,
        "proposed_fix": event.proposed_fix,
        "risk_score": event.risk_score,
        "risk_level": event.risk_level,
        "estimated_duration_seconds": timing_meta.get("estimated_seconds"),
        "timing_level": timing_meta.get("level"),
        "fix_applied": event.fix_applied,
        "re_run_triggered": event.re_run_triggered,
        "re_run_success": event.re_run_success,
        "created_at": _to_utc_iso(event.created_at),
        "updated_at": _to_utc_iso(event.updated_at)
    }
    if include_logs:
        data["raw_logs"] = event.raw_logs
        data["log_summary"] = event.log_summary
        data["fix_script"] = event.fix_script
        data["fix_output"] = event.fix_output
        data["metadata"] = event.metadata
    return data


def _to_utc_iso(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


async def _refresh_event_assessment(event: PipelineEvent) -> None:
    if not isinstance(event.metadata, dict):
        return

    fix_meta = event.metadata.get("fix", {})
    if not isinstance(fix_meta, dict):
        fix_meta = {}

    if not (fix_meta.get("fix_script") or event.fix_script):
        return

    risk_meta = event.metadata.get("risk", {}) if isinstance(event.metadata.get("risk"), dict) else {}
    timing_meta = risk_meta.get("timing", {}) if isinstance(risk_meta, dict) else {}
    has_timing = bool(timing_meta and timing_meta.get("estimated_seconds"))
    risk_version = int(event.metadata.get("risk_version", 0))
    should_refresh = (risk_version < RISK_EVALUATION_VERSION) or (event.risk_score is None) or (not has_timing)
    if not should_refresh:
        return

    diagnosis = event.metadata.get("diagnosis", {})
    if not isinstance(diagnosis, dict):
        diagnosis = {}

    fix_payload = {
        "fix_type": fix_meta.get("fix_type", "manual"),
        "fix_description": fix_meta.get("fix_description") or event.proposed_fix or "",
        "fix_script": fix_meta.get("fix_script") or event.fix_script or "",
        "estimated_risk": fix_meta.get("estimated_risk", 0.3),
    }

    risk = _risk_evaluator.evaluate(
        fix=fix_payload,
        diagnosis=diagnosis,
        repo=event.repo_full_name,
        branch=event.branch,
    )

    event.risk_score = risk.get("score")
    event.risk_level = risk.get("level")
    event.metadata["risk"] = risk
    event.metadata["risk_version"] = RISK_EVALUATION_VERSION
    event.update_timestamp()
    await event.save()

"""
Agent Orchestrator – coordinates Diagnosis → Fixer → Guardian → Executor pipeline.
"""
import logging
import asyncio
from datetime import datetime, timedelta

from backend.agents.diagnosis_agent import DiagnosisAgent
from backend.agents.fixer_agent import FixerAgent
from backend.guardian.risk_evaluator import RiskEvaluator
from backend.executor.docker_runner import DockerRunner
from backend.models.pipeline_event import PipelineEvent, PipelineStatus, FailureCategory
from backend.models.approval_request import ApprovalRequest, ApprovalStatus
from backend.models.fix_record import FixRecord, FixStatus
from backend.services.github_service import GitHubService
from backend.agents.vector_store import VectorStore
from backend.config import settings

logger = logging.getLogger(__name__)


class AgentOrchestrator:
    def __init__(self, ws_manager=None):
        self.diagnosis_agent = DiagnosisAgent()
        self.fixer_agent = FixerAgent()
        self.risk_evaluator = RiskEvaluator()
        self.docker_runner = DockerRunner()
        self.github_service = GitHubService()
        self.vector_store = VectorStore()
        self.ws_manager = ws_manager  # WebSocket broadcast manager

    async def process_failure(self, event: PipelineEvent):
        """Main orchestration pipeline for a pipeline failure."""
        logger.info(f"[Orchestrator] Starting processing for event {event.event_id}")

        try:
            # === STEP 1: DIAGNOSIS ===
            event.status = PipelineStatus.DIAGNOSING
            await event.save()
            await self._broadcast("diagnosis_started", event)

            diagnosis = await self.diagnosis_agent.analyze(
                event_id=str(event.id),
                logs=event.raw_logs,
                repo=event.repo_full_name,
                branch=event.branch,
                commit_message=event.commit_message
            )

            event.root_cause = diagnosis.get("root_cause")
            event.log_summary = diagnosis.get("summary", "")
            event.failure_category = FailureCategory(
                diagnosis.get("failure_category", "unknown")
            )
            event.metadata["diagnosis"] = diagnosis
            event.update_timestamp()
            await event.save()
            await self._broadcast("diagnosis_complete", event, extra={"diagnosis": diagnosis})

            # === STEP 2: FIX GENERATION ===
            event.status = PipelineStatus.FIX_PENDING
            await event.save()

            fix = await self.fixer_agent.generate_fix(
                diagnosis=diagnosis,
                repo=event.repo_full_name,
                branch=event.branch,
                raw_logs=event.raw_logs
            )

            event.proposed_fix = fix.get("fix_description")
            event.fix_script = fix.get("fix_script")
            event.metadata["fix"] = fix
            event.update_timestamp()
            await event.save()
            await self._broadcast("fix_generated", event, extra={"fix": fix})

            # === STEP 3: GUARDIAN RISK EVALUATION ===
            risk = self.risk_evaluator.evaluate(
                fix=fix,
                diagnosis=diagnosis,
                repo=event.repo_full_name,
                branch=event.branch
            )

            event.risk_score = risk["score"]
            event.risk_level = risk["level"]
            event.metadata["risk"] = risk
            event.update_timestamp()
            await event.save()
            await self._broadcast("risk_evaluated", event, extra={"risk": risk})

            # === STEP 4: ALWAYS REQUIRE HUMAN APPROVAL ===
            logger.info(
                f"[Orchestrator] Routing fix to human approval (risk={risk['level']}, score={risk['score']})"
            )
            await self._request_approval(event, fix, risk)

        except Exception as e:
            logger.error(f"[Orchestrator] Pipeline failed for {event.event_id}: {e}", exc_info=True)
            event.status = PipelineStatus.FAILED_TO_FIX
            event.metadata["error"] = str(e)
            event.update_timestamp()
            await event.save()
            await self._broadcast("processing_failed", event, extra={"error": str(e)})

    async def _auto_apply_fix(
        self,
        event: PipelineEvent,
        fix: dict,
        risk: dict,
        auto_applied: bool = True,
        approved_by: str | None = None
    ):
        """Execute fix in Docker and trigger re-run."""
        event.status = PipelineStatus.FIXING
        await event.save()
        await self._broadcast("fix_applying", event)

        # Execute in Docker
        result = await self.docker_runner.run_fix(
            fix_script=fix.get("fix_script", ""),
            repo_url=f"https://github.com/{event.repo_full_name}",
            branch=event.branch,
            event_id=str(event.id),
            repo_full_name=event.repo_full_name,
        )

        # Save fix record
        fix_record = FixRecord(
            event_id=str(event.id),
            repo_full_name=event.repo_full_name,
            fix_type=fix.get("fix_type", "unknown"),
            fix_script=fix.get("fix_script", ""),
            fix_output=result.get("output", ""),
            exit_code=result.get("exit_code", 1),
            status=FixStatus.SUCCESS if result.get("exit_code") == 0 else FixStatus.FAILED,
            duration_seconds=result.get("duration", 0),
            auto_applied=auto_applied,
            container_id=result.get("container_id"),
            metadata={"approved_by": approved_by} if approved_by else {}
        )
        await fix_record.insert()

        if result.get("exit_code") == 0:
            event.fix_applied = True
            event.fix_output = result.get("output", "")
            event.status = PipelineStatus.RETRYING

            # Store fix in vector DB for future use
            await self.vector_store.store_fix(
                event_id=str(event.id),
                failure_category=str(event.failure_category),
                root_cause=event.root_cause or "",
                fix_data=fix
            )

            # Trigger GitHub Actions re-run
            rerun_ok = await self.github_service.trigger_rerun(
                repo=event.repo_full_name,
                run_id=event.event_id
            )
            event.re_run_triggered = rerun_ok
            event.status = PipelineStatus.FIXED
        else:
            event.status = PipelineStatus.FAILED_TO_FIX
            event.fix_output = result.get("output", "")

        event.update_timestamp()
        await event.save()
        await self._broadcast("fix_complete", event, extra={"result": result})

    async def _request_approval(self, event: PipelineEvent, fix: dict, risk: dict):
        """Create an approval request for a generated fix."""
        event.status = PipelineStatus.AWAITING_APPROVAL
        await event.save()

        approval = ApprovalRequest(
            event_id=str(event.id),
            repo_full_name=event.repo_full_name,
            branch=event.branch,
            commit_sha=event.commit_sha,
            root_cause=event.root_cause or "",
            proposed_fix=fix.get("fix_description", ""),
            fix_script=fix.get("fix_script", ""),
            risk_score=risk["score"],
            risk_level=risk["level"],
            risk_reasons=risk.get("reasons", []),
            expires_at=datetime.utcnow() + timedelta(hours=24)
        )
        await approval.insert()

        event.metadata["approval_id"] = str(approval.id)
        event.update_timestamp()
        await event.save()
        await self._broadcast("approval_required", event, extra={
            "approval_id": str(approval.id),
            "risk": risk
        })

    async def execute_approved_fix(self, approval_id: str, reviewer: str, note: str = ""):
        """Called when a human approves a fix."""
        approval = await ApprovalRequest.get(approval_id)
        if not approval or approval.status != ApprovalStatus.PENDING:
            raise ValueError("Approval not found or already processed")

        approval.status = ApprovalStatus.APPROVED
        approval.reviewed_by = reviewer
        approval.reviewer_note = note
        approval.reviewed_at = datetime.utcnow()
        await approval.save()

        event = await PipelineEvent.get(approval.event_id)
        if not event:
            raise ValueError("Pipeline event not found")

        fix = event.metadata.get("fix", {})
        risk = event.metadata.get("risk", {})
        await self._auto_apply_fix(event, fix, risk, auto_applied=False, approved_by=reviewer)

    async def reject_fix(self, approval_id: str, reviewer: str, note: str = ""):
        """Called when a human rejects a fix."""
        approval = await ApprovalRequest.get(approval_id)
        if not approval:
            raise ValueError("Approval not found")

        approval.status = ApprovalStatus.REJECTED
        approval.reviewed_by = reviewer
        approval.reviewer_note = note
        approval.reviewed_at = datetime.utcnow()
        await approval.save()

        event = await PipelineEvent.get(approval.event_id)
        if event:
            event.status = PipelineStatus.FAILED_TO_FIX
            event.metadata["rejection_note"] = note
            event.update_timestamp()
            await event.save()
            await self._broadcast("fix_rejected", event)

    async def _broadcast(self, event_type: str, event: PipelineEvent, extra: dict = None):
        """Send WebSocket broadcast to all connected clients."""
        if self.ws_manager:
            payload = {
                "type": event_type,
                "event_id": event.event_id,
                "repo": event.repo_full_name,
                "branch": event.branch,
                "status": event.status,
                "risk_score": event.risk_score,
                "risk_level": event.risk_level,
                "root_cause": event.root_cause,
                "proposed_fix": event.proposed_fix,
                "timestamp": datetime.utcnow().isoformat()
            }
            if extra:
                payload.update(extra)
            await self.ws_manager.broadcast(payload)

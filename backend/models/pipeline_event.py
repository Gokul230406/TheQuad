from beanie import Document
from pydantic import Field
from datetime import datetime
from typing import Optional, List, Dict, Any
from enum import Enum


class PipelineStatus(str, Enum):
    FAILED = "failed"
    DIAGNOSING = "diagnosing"
    FIX_PENDING = "fix_pending"
    AWAITING_APPROVAL = "awaiting_approval"
    FIXING = "fixing"
    FIXED = "fixed"
    FAILED_TO_FIX = "failed_to_fix"
    RETRYING = "retrying"


class FailureCategory(str, Enum):
    DEPENDENCY = "dependency_error"
    TEST_FAILURE = "test_failure"
    BUILD_ERROR = "build_error"
    CONFIG_ERROR = "config_error"
    NETWORK_ERROR = "network_error"
    PERMISSIONS = "permissions_error"
    UNKNOWN = "unknown"


class PipelineEvent(Document):
    event_id: str = Field(..., description="GitHub Actions run ID")
    repo_full_name: str = Field(..., description="owner/repo")
    repo_name: str
    branch: str
    commit_sha: str
    commit_message: str
    workflow_name: str
    job_name: Optional[str] = None
    status: PipelineStatus = PipelineStatus.FAILED
    failure_category: Optional[FailureCategory] = None
    raw_logs: str = ""
    log_summary: str = ""
    root_cause: Optional[str] = None
    proposed_fix: Optional[str] = None
    fix_script: Optional[str] = None
    risk_score: Optional[float] = None
    risk_level: Optional[str] = None  # low / medium / high
    fix_applied: bool = False
    fix_output: Optional[str] = None
    re_run_triggered: bool = False
    re_run_success: Optional[bool] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "pipeline_events"

    def update_timestamp(self):
        self.updated_at = datetime.utcnow()

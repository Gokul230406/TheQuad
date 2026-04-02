from beanie import Document
from pydantic import Field
from datetime import datetime
from typing import Optional
from enum import Enum


class ApprovalStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    EXPIRED = "expired"


class ApprovalRequest(Document):
    event_id: str = Field(..., description="Linked PipelineEvent ID")
    repo_full_name: str
    branch: str
    commit_sha: str
    root_cause: str
    proposed_fix: str
    fix_script: str
    risk_score: float
    risk_level: str
    risk_reasons: list[str] = Field(default_factory=list)
    status: ApprovalStatus = ApprovalStatus.PENDING
    reviewer_note: Optional[str] = None
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "approval_requests"

from beanie import Document
from pydantic import Field
from datetime import datetime
from typing import Optional, Dict, Any
from enum import Enum


class FixStatus(str, Enum):
    SUCCESS = "success"
    FAILED = "failed"
    PARTIAL = "partial"


class FixRecord(Document):
    event_id: str
    repo_full_name: str
    fix_type: str   # dependency, config, patch, etc.
    fix_script: str
    fix_output: str = ""
    exit_code: int = 0
    status: FixStatus = FixStatus.SUCCESS
    duration_seconds: float = 0.0
    auto_applied: bool = True
    container_id: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    metadata: Dict[str, Any] = Field(default_factory=dict)

    class Settings:
        name = "fix_records"

from pydantic import BaseModel, Field


class ScenarioBuilderRequest(BaseModel):
    session_id: str = Field(default="default", min_length=1, max_length=128)
    message: str = Field(..., min_length=1, max_length=4000)


class SimulationRequest(BaseModel):
    repo: str = Field(default="demo-org/demo-repo", min_length=3, max_length=200)
    branch: str = Field(default="main", min_length=1, max_length=120)
    commit_sha: str = Field(default="abc1234", min_length=4, max_length=64)
    commit_message: str = Field(default="feat: add new feature", min_length=1, max_length=500)
    workflow_name: str = Field(default="CI Pipeline", min_length=1, max_length=200)
    logs: str = Field(..., min_length=1, max_length=200000)


class PreviewRequest(BaseModel):
    repo: str = Field(default="demo-repo", min_length=1, max_length=200)
    branch: str = Field(default="main", min_length=1, max_length=120)
    commit_message: str = Field(default="", max_length=500)
    logs: str = Field(..., min_length=1, max_length=200000)

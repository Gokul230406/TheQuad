import os
from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # App
    APP_NAME: str = "PipeGenie"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True
    SECRET_KEY: str = "pipegenie-super-secret-key-change-in-prod"

    # MongoDB
    MONGODB_URL: str #= "mongodb://localhost:27017"
    MONGODB_DB: str = "pipegenie"

    # Redis
    REDIS_URL: str = "redis://localhost:6379"
    REDIS_TTL: int = 3600  # 1 hour cache

    # GitHub
    GITHUB_TOKEN: str = ""
    GITHUB_WEBHOOK_SECRET: str = "pipegenie-webhook-secret"
    REPO_WRITEBACK_ENABLED: bool = True
    AUTO_OPEN_PR: bool = True
    PIPEGENIE_BOT_NAME: str = "PipeGenie Bot"
    PIPEGENIE_BOT_EMAIL: str = "pipegenie-bot@users.noreply.github.com"

    # AI — provider: gemini (default) | ollama | mistral (see backend/agents/llm_factory.py)
    LLM_PROVIDER: str = "gemini"
    MISTRAL_API_KEY: str = ""
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    USE_OLLAMA: bool = False
    LLM_MODEL: str = "mistral"
    GEMINI_API_KEY: str = Field(
        default="",
        validation_alias=AliasChoices("GEMINI_API_KEY", "GOOGLE_API_KEY"),
    )
    GEMINI_MODEL: str = "gemini-2.0-flash"

    # MilvusDB
    MILVUS_HOST: str = "localhost"
    MILVUS_PORT: int = 19530

    # Docker
    DOCKER_NETWORK: str = "pipegenie-net"
    AUTO_RUN_DOCKER_TESTS: bool = True
    DOCKER_TEST_COMMAND: str = "docker compose --profile test run --rm backend-tests"
    DOCKER_TEST_TIMEOUT_SECONDS: int = 900

    # Risk thresholds
    RISK_LOW_THRESHOLD: float = 0.3
    RISK_HIGH_THRESHOLD: float = 0.7

    # CORS
    FRONTEND_URL: str = "http://localhost:5173"

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()

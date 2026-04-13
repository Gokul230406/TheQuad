import os
from pydantic_settings import BaseSettings
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

class Settings(BaseSettings):
    # App
    APP_NAME: str = "PipeGenie"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True
    SECRET_KEY: str = "pipegenie-super-secret-key-change-in-prod"

    # MongoDB
    MONGODB_URL: str   # must come from .env
    MONGODB_DB: str = "pipegenie"

    # Redis
    REDIS_URL: str = "redis://localhost:6379"
    REDIS_TTL: int = 3600  # 1 hour cache

    # GitHub
    GITHUB_TOKEN: str = ""
    GITHUB_WEBHOOK_SECRET: str = "pipegenie-webhook-secret"

    # AI / Mistral
    MISTRAL_API_KEY: str = ""
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    USE_OLLAMA: bool = True
    LLM_MODEL: str = "mistral"

    # ChromaDB
    CHROMA_PERSIST_DIR: str = "./chroma_db"

    # Docker
    DOCKER_NETWORK: str = "pipegenie-net"

    # Risk thresholds
    RISK_LOW_THRESHOLD: float = 0.3
    RISK_HIGH_THRESHOLD: float = 0.7

    # CORS
    FRONTEND_URL: str = "http://localhost:5173"

    class Config:
        env_file = str(BASE_DIR / ".env")   # ✅ FIXED HERE
        extra = "ignore"

settings = Settings()
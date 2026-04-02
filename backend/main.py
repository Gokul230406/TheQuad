"""
PipeGenie – FastAPI Backend Entry Point
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
import redis.asyncio as redis

from backend.config import settings
from backend.models.pipeline_event import PipelineEvent
from backend.models.approval_request import ApprovalRequest
from backend.models.fix_record import FixRecord
from backend.routes import webhook, approvals, dashboard
from backend.agents.orchestrator import AgentOrchestrator
from backend.services.websocket_manager import WebSocketManager

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown lifecycle."""
    logger.info("🧞 PipeGenie starting up...")

    # Init MongoDB
    client = AsyncIOMotorClient(settings.MONGODB_URL)
    await init_beanie(
        database=client[settings.MONGODB_DB],
        document_models=[PipelineEvent, ApprovalRequest, FixRecord]
    )
    logger.info(f"✅ MongoDB connected: {settings.MONGODB_DB}")

    # Init Redis (optional)
    try:
        redis_client = redis.from_url(settings.REDIS_URL)
        await redis_client.ping()
        app.state.redis = redis_client
        logger.info("✅ Redis connected")
    except Exception as e:
        logger.warning(f"⚠️  Redis not available: {e} (continuing without cache)")
        app.state.redis = None

    # Init WebSocket manager
    ws_manager = WebSocketManager()
    app.state.ws_manager = ws_manager

    # Init Agent Orchestrator
    orchestrator = AgentOrchestrator(ws_manager=ws_manager)
    app.state.orchestrator = orchestrator
    logger.info("✅ Agent Orchestrator ready")

    logger.info("🚀 PipeGenie is live!")
    yield

    # Shutdown
    client.close()
    if app.state.redis:
        await app.state.redis.close()
    logger.info("👋 PipeGenie shut down")


app = FastAPI(
    title="PipeGenie API",
    description="AI-powered CI/CD pipeline auto-remediation system",
    version=settings.APP_VERSION,
    lifespan=lifespan
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL, "http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

# Register routes
app.include_router(webhook.router, prefix="/api")
app.include_router(approvals.router, prefix="/api")
app.include_router(dashboard.router, prefix="/api")


@app.get("/")
async def root():
    return {
        "name": "PipeGenie",
        "version": settings.APP_VERSION,
        "status": "running",
        "docs": "/docs"
    }


@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "mongodb": "connected",
        "redis": "connected" if app.state.redis else "unavailable",
        "ollama": settings.OLLAMA_BASE_URL if settings.USE_OLLAMA else "mistral-api"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)

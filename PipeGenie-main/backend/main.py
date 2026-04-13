"""
PipeGenie – FastAPI Backend Entry Point (With Connection Stability)
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

    # --- MongoDB Initialization with Timeout ---
    client = None
    try:
        # Added serverSelectionTimeoutMS to stop it from hanging forever
        client = AsyncIOMotorClient(
            settings.MONGODB_URL,
            serverSelectionTimeoutMS=5000 
        )
        # Check if we can actually reach the server
        await client.admin.command('ping')
        
        await init_beanie(
            database=client[settings.MONGODB_DB],
            document_models=[PipelineEvent, ApprovalRequest, FixRecord]
        )
        logger.info(f"✅ MongoDB connected: {settings.MONGODB_DB}")
    except Exception as e:
        logger.error(f"❌ DATABASE ERROR: Could not connect to MongoDB Atlas.")
        logger.error(f"Reason: {e}")
        logger.warning("Check your .env URL and Network/Firewall settings!")

    # --- Redis Initialization (optional) ---
    try:
        redis_client = redis.from_url(settings.REDIS_URL)
        await redis_client.ping()
        app.state.redis = redis_client
        logger.info("✅ Redis connected")
    except Exception as e:
        logger.warning(f"⚠️  Redis not available: {e} (continuing without cache)")
        app.state.redis = None

    # --- Services & Orchestrator ---
    ws_manager = WebSocketManager()
    app.state.ws_manager = ws_manager
    app.state.orchestrator = AgentOrchestrator(ws_manager=ws_manager)
    logger.info("✅ Agent Orchestrator ready")

    logger.info("🚀 PipeGenie is live!")
    yield

    # --- Shutdown ---
    if client:
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

# CORS (Allowed all for Hackathon demo stability)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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
        "status": "running"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)

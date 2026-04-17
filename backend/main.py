"""
PipeGenie – FastAPI Backend Entry Point
"""
import logging
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
import redis.asyncio as redis
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

from backend.config import settings
from backend.models.pipeline_event import PipelineEvent
from backend.models.approval_request import ApprovalRequest
from backend.models.fix_record import FixRecord
from backend.routes import webhook, approvals, dashboard
from backend.agents.orchestrator import AgentOrchestrator
from backend.services.websocket_manager import WebSocketManager
from backend.telemetry import init_tracer

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
    app.state.component_status = {
        "mongodb": "connected",
        "redis": "connected" if app.state.redis else "unavailable",
        "ollama": settings.OLLAMA_BASE_URL if settings.USE_OLLAMA else "mistral-api",
    }
    logger.info("✅ Agent Orchestrator ready")

    logger.info("🚀 PipeGenie is live!")
    yield

    # Shutdown
    client.close()
    if app.state.redis:
        await app.state.redis.close()
    logger.info("👋 PipeGenie shut down")


init_tracer()

app = FastAPI(
    title="PipeGenie API",
    description="AI-powered CI/CD pipeline auto-remediation system",
    version=settings.APP_VERSION,
    lifespan=lifespan
)

FastAPIInstrumentor.instrument_app(app)


@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    request.state.request_id = request_id
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    request_id = getattr(request.state, "request_id", "unknown")
    logger.warning(
        "Validation error request_id=%s path=%s errors=%s",
        request_id,
        request.url.path,
        exc.errors(),
    )
    return JSONResponse(
        status_code=422,
        content={
            "error": "validation_error",
            "message": "Request body validation failed",
            "request_id": request_id,
            "details": exc.errors(),
        },
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    request_id = getattr(request.state, "request_id", "unknown")
    logger.exception(
        "Unhandled error request_id=%s path=%s method=%s",
        request_id,
        request.url.path,
        request.method,
    )
    return JSONResponse(
        status_code=500,
        content={
            "error": "internal_server_error",
            "message": "Unexpected server error. Check backend logs with request_id.",
            "request_id": request_id,
        },
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
    component_status = getattr(app.state, "component_status", {})
    redis_status = "connected" if app.state.redis else "unavailable"
    if component_status:
        component_status["redis"] = redis_status
    return {
        "status": "healthy",
        "mongodb": "connected",
        "redis": redis_status,
        "ollama": settings.OLLAMA_BASE_URL if settings.USE_OLLAMA else "mistral-api",
        "components": component_status,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)

"""
OpenTelemetry / SigNoz setup for the PipeGenie FastAPI backend.

Exports:
- Traces (HTTP requests via FastAPI instrumentation)
- Application logs (Python logging → OTLP → SigNoz Logs)

Requires a running OTLP collector (SigNoz listens on :4318 by default for HTTP).
Set OTEL_ENABLED=false to disable when SigNoz is not running.
"""
import logging
import os

from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

_log = logging.getLogger(__name__)


def _otlp_base_url() -> str:
    """Normalize OTLP base, e.g. http://localhost:4318 from env or full /v1/traces URL."""
    raw = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4318").strip().rstrip("/")
    if raw.endswith("/v1/traces"):
        raw = raw[: -len("/v1/traces")].rstrip("/")
    return raw


def _otel_enabled() -> bool:
    return os.getenv("OTEL_ENABLED", "true").lower() in ("1", "true", "yes")


def init_tracer() -> None:
    """Backward-compatible alias."""
    init_otel()


def init_otel() -> None:
    """
    Configure OpenTelemetry traces and log export to SigNoz.
    Safe to call when collector is down; export failures are non-fatal.
    """
    if not _otel_enabled():
        _log.info("OpenTelemetry disabled (OTEL_ENABLED=false)")
        return

    if isinstance(trace.get_tracer_provider(), TracerProvider):
        return

    base = _otlp_base_url()
    service_name = os.getenv("OTEL_SERVICE_NAME", "pipegenie-backend")
    resource = Resource.create({"service.name": service_name})

    trace_endpoint = f"{base}/v1/traces"
    logs_endpoint = f"{base}/v1/logs"

    try:
        provider = TracerProvider(resource=resource)
        span_exporter = OTLPSpanExporter(endpoint=trace_endpoint)
        provider.add_span_processor(BatchSpanProcessor(span_exporter))
        trace.set_tracer_provider(provider)
        _log.info("OpenTelemetry traces → %s", trace_endpoint)
    except Exception as e:
        _log.warning("OpenTelemetry trace export not configured: %s", e)

    try:
        from opentelemetry._logs import set_logger_provider
        from opentelemetry.exporter.otlp.proto.http._log_exporter import OTLPLogExporter
        from opentelemetry.sdk._logs import LoggerProvider, LoggingHandler
        from opentelemetry.sdk._logs.export import BatchLogRecordProcessor

        log_exporter = OTLPLogExporter(endpoint=logs_endpoint)
        logger_provider = LoggerProvider(resource=resource)
        logger_provider.add_log_record_processor(BatchLogRecordProcessor(log_exporter))
        set_logger_provider(logger_provider)

        root = logging.getLogger()
        for h in root.handlers:
            if type(h).__name__ == "LoggingHandler":
                root.removeHandler(h)
        root.addHandler(LoggingHandler(level=logging.NOTSET, logger_provider=logger_provider))
        _log.info("OpenTelemetry logs → %s (SigNoz: Logs → filter service.name=%s)", logs_endpoint, service_name)
    except Exception as e:
        _log.warning("OpenTelemetry log export not configured: %s", e)

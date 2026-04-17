"""
Shared LLM construction for Diagnosis and Fixer agents.

Selection order:
1. `LLM_PROVIDER` when set to gemini | ollama | mistral (explicit).
2. Otherwise legacy `USE_OLLAMA=true` → local Ollama (Mistral-class model name in `LLM_MODEL`).
3. Default: Gemini (`GEMINI_MODEL` + `GEMINI_API_KEY` or env `GOOGLE_API_KEY`).
"""
from __future__ import annotations

import logging
import os
from typing import Any, Literal

from langchain_core.language_models.chat_models import BaseChatModel

from backend.config import settings

logger = logging.getLogger(__name__)

LLMBackend = Literal["gemini", "ollama", "mistral"]


def resolve_llm_backend() -> LLMBackend:
    raw = (settings.LLM_PROVIDER or "").strip().lower()
    if raw in ("ollama", "local", "mistral-ollama"):
        return "ollama"
    if raw in ("mistral", "mistral_api", "mistralai", "mistral-cloud"):
        return "mistral"
    if raw in ("gemini", "google", "google_genai"):
        return "gemini"
    if settings.USE_OLLAMA:
        return "ollama"
    if raw == "" and settings.MISTRAL_API_KEY and not settings.GEMINI_API_KEY:
        return "mistral"
    return "gemini"


def build_chat_llm(*, temperature: float, json_mode: bool = True) -> BaseChatModel:
    """Return a LangChain chat model for diagnosis / fixer pipelines."""
    backend = resolve_llm_backend()
    logger.info(
        "[LLM] backend=%s LLM_PROVIDER=%r USE_OLLAMA=%s",
        backend,
        settings.LLM_PROVIDER,
        settings.USE_OLLAMA,
    )

    if backend == "ollama":
        from langchain_community.chat_models import ChatOllama

        return ChatOllama(
            model=settings.LLM_MODEL,
            base_url=settings.OLLAMA_BASE_URL,
            temperature=temperature,
            format="json" if json_mode else None,
        )

    if backend == "mistral":
        from langchain_mistralai import ChatMistralAI

        if not settings.MISTRAL_API_KEY:
            raise ValueError("MISTRAL_API_KEY is required when LLM_PROVIDER=mistral (Mistral API).")
        return ChatMistralAI(
            model="mistral-large-latest",
            api_key=settings.MISTRAL_API_KEY,
            temperature=temperature,
        )

    try:
        from langchain_google_genai import ChatGoogleGenerativeAI
    except ModuleNotFoundError as e:
        raise ValueError(
            "Gemini support requires the `langchain-google-genai` package. "
            "From the project root run: pip install -r backend/requirements.txt"
        ) from e

    api_key = (settings.GEMINI_API_KEY or os.environ.get("GOOGLE_API_KEY") or "").strip()
    if not api_key:
        raise ValueError(
            "Gemini is selected but no API key was found. Set GEMINI_API_KEY or GOOGLE_API_KEY in backend/.env."
        )

    kwargs: dict[str, Any] = {
        "model": settings.GEMINI_MODEL,
        "temperature": temperature,
        "convert_system_message_to_human": True,
        "google_api_key": api_key,
    }
    if json_mode:
        kwargs["model_kwargs"] = {"response_mime_type": "application/json"}
    return ChatGoogleGenerativeAI(**kwargs)

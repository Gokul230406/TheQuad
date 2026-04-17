"""
Retry Gemini / Google Generative Language API calls when rate-limited (429 / ResourceExhausted).

Free-tier quotas often return a suggested wait (e.g. "Please retry in 59.1"); we honor that when present.
"""
from __future__ import annotations

import asyncio
import logging
import re
from typing import Any

logger = logging.getLogger(__name__)

_RETRY_IN_RE = re.compile(r"retry in\s+([0-9.]+)", re.IGNORECASE)


def _walk_exception_chain(exc: BaseException, limit: int = 8):
    seen: set[int] = set()
    chain: BaseException | None = exc
    for _ in range(limit):
        if chain is None or id(chain) in seen:
            break
        seen.add(id(chain))
        yield chain
        nxt = chain.__cause__ or chain.__context__
        chain = nxt if isinstance(nxt, BaseException) else None


def is_llm_rate_limit_error(exc: BaseException) -> bool:
    """Detect Gemini / Google 429 and quota errors, including wrapped LangChain exceptions."""
    for link in _walk_exception_chain(exc):
        name_l = type(link).__name__.lower()
        text = str(link).lower()
        if "resourceexhausted" in name_l or "resource exhausted" in text:
            return True
        if "429" in text:
            return True
        if "quota" in text and "exceed" in text:
            return True
        if "rate limit" in text or "rate_limit" in text:
            return True
    return False


def suggested_retry_delay_seconds(exc: BaseException) -> float | None:
    for link in _walk_exception_chain(exc):
        m = _RETRY_IN_RE.search(str(link))
        if m:
            try:
                return float(m.group(1))
            except ValueError:
                continue
    return None


async def chat_invoke_with_retry(
    llm: Any,
    messages: list,
    *,
    max_attempts: int = 10,
    cap_sleep_s: float = 120.0,
) -> Any:
    """
    Run LangChain chat model invoke in a thread pool with waits on rate limits.

    Uses asyncio.to_thread so event-loop sleeps do not block the server during backoff.
    """
    last_exc: BaseException | None = None
    for attempt in range(1, max_attempts + 1):
        try:
            return await asyncio.to_thread(llm.invoke, messages)
        except Exception as e:
            last_exc = e
            if not is_llm_rate_limit_error(e) or attempt >= max_attempts:
                raise
            hint = suggested_retry_delay_seconds(e)
            if hint is not None:
                delay = min(max(hint + 0.5, 2.0), cap_sleep_s)
            else:
                delay = min(2.0**attempt, cap_sleep_s)
            logger.warning(
                "LLM rate limited (attempt %s/%s); sleeping %.1fs before retry: %s",
                attempt,
                max_attempts,
                delay,
                e,
            )
            await asyncio.sleep(delay)
    assert last_exc is not None
    raise last_exc

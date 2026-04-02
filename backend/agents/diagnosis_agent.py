"""
Diagnosis Agent – Uses LangChain + Mistral to analyze pipeline logs
and identify root causes of failures.
"""
import re
import json
import logging
from typing import Tuple, Optional

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_community.chat_models import ChatOllama
from langchain_mistralai import ChatMistralAI

from backend.config import settings
from backend.models.pipeline_event import FailureCategory
from backend.agents.vector_store import VectorStore

logger = logging.getLogger(__name__)


DIAGNOSIS_SYSTEM_PROMPT = """You are PipeGenie's Diagnosis Agent — an expert DevOps AI that analyzes
CI/CD pipeline failure logs to identify root causes.

Your job:
1. Read the pipeline failure logs carefully
2. Identify the exact root cause
3. Classify the failure category
4. Check if this is a recurring pattern

Output ONLY valid JSON with this exact structure:
{
  "root_cause": "clear one-sentence root cause",
  "failure_category": "dependency_error|test_failure|build_error|config_error|network_error|permissions_error|unknown",
  "affected_files": ["file1", "file2"],
  "error_lines": ["exact error line from logs"],
  "confidence": 0.95,
  "summary": "2-3 sentence human-readable summary"
}

Be precise. Focus on the actual error, not symptoms."""


class DiagnosisAgent:
    def __init__(self):
        self.vector_store = VectorStore()
        self._init_llm()

    def _init_llm(self):
        if settings.USE_OLLAMA:
            self.llm = ChatOllama(
                model=settings.LLM_MODEL,
                base_url=settings.OLLAMA_BASE_URL,
                temperature=0.1,
                format="json"
            )
        else:
            self.llm = ChatMistralAI(
                model="mistral-large-latest",
                api_key=settings.MISTRAL_API_KEY,
                temperature=0.1
            )

    async def analyze(self, event_id: str, logs: str, repo: str, branch: str,
                      commit_message: str) -> dict:
        """Main diagnosis entry point. Returns structured diagnosis dict."""
        logger.info(f"[DiagnosisAgent] Analyzing event {event_id}")

        # 1. Truncate logs intelligently (keep tail where errors usually are)
        processed_logs = self._smart_truncate(logs)

        # 2. Check vector store for similar past failures
        similar_cases = await self.vector_store.search_similar_failures(
            processed_logs, top_k=3
        )
        similar_context = self._format_similar_cases(similar_cases)

        # 3. Build prompt
        user_prompt = f"""
Repository: {repo}
Branch: {branch}
Commit: {commit_message}

=== PIPELINE FAILURE LOGS ===
{processed_logs}

=== SIMILAR PAST FAILURES (for reference) ===
{similar_context}

Analyze the above logs and return a JSON diagnosis.
"""
        messages = [
            SystemMessage(content=DIAGNOSIS_SYSTEM_PROMPT),
            HumanMessage(content=user_prompt)
        ]

        # 4. Call LLM
        try:
            response = self.llm.invoke(messages)
            result = self._parse_json_response(response.content)
        except Exception as e:
            logger.error(f"LLM diagnosis failed: {e}")
            result = self._fallback_diagnosis(logs)

        # 5. Store in vector DB for future recall
        await self.vector_store.store_failure(
            event_id=event_id,
            logs_summary=processed_logs[:500],
            diagnosis=result
        )

        logger.info(f"[DiagnosisAgent] Category: {result.get('failure_category')} | Confidence: {result.get('confidence')}")
        return result

    def _smart_truncate(self, logs: str, max_chars: int = 4000) -> str:
        """Keep the most relevant parts of logs (head + tail)."""
        if len(logs) <= max_chars:
            return logs
        head = logs[:1000]
        tail = logs[-(max_chars - 1000):]
        return f"{head}\n...[truncated]...\n{tail}"

    def _format_similar_cases(self, cases: list) -> str:
        if not cases:
            return "No similar past failures found."
        lines = []
        for i, case in enumerate(cases, 1):
            lines.append(f"Case {i}: {case.get('root_cause', 'N/A')} → Fixed by: {case.get('fix_type', 'N/A')}")
        return "\n".join(lines)

    def _parse_json_response(self, content: str) -> dict:
        """Extract JSON from LLM response even if wrapped in markdown."""
        # Try direct parse
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            pass
        # Try extracting from markdown code block
        match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", content, re.DOTALL)
        if match:
            return json.loads(match.group(1))
        # Try finding any JSON object
        match = re.search(r"\{.*\}", content, re.DOTALL)
        if match:
            return json.loads(match.group(0))
        raise ValueError(f"Could not parse JSON from response: {content[:200]}")

    def _fallback_diagnosis(self, logs: str) -> dict:
        """Rule-based fallback when LLM fails."""
        log_lower = logs.lower()
        if "modulenotfounderror" in log_lower or "no module named" in log_lower:
            category = "dependency_error"
            root_cause = "Missing Python module – dependency not installed"
        elif "assertionerror" in log_lower or "failed test" in log_lower or "pytest" in log_lower:
            category = "test_failure"
            root_cause = "Unit test assertion failed"
        elif "syntaxerror" in log_lower or "unexpected token" in log_lower:
            category = "build_error"
            root_cause = "Syntax error in source code"
        elif "permission denied" in log_lower:
            category = "permissions_error"
            root_cause = "File or resource permission denied"
        elif "connection refused" in log_lower or "timeout" in log_lower:
            category = "network_error"
            root_cause = "Network connection issue"
        else:
            category = "unknown"
            root_cause = "Unknown pipeline failure – manual inspection required"

        return {
            "root_cause": root_cause,
            "failure_category": category,
            "affected_files": [],
            "error_lines": [],
            "confidence": 0.5,
            "summary": f"Automated fallback diagnosis: {root_cause}"
        }

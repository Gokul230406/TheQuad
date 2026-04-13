"""
Fixer Agent – Generates actionable remediation scripts based on diagnosis.
"""
import json
import logging
import re

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_community.chat_models import ChatOllama
from langchain_mistralai import ChatMistralAI

from backend.config import settings
from backend.agents.vector_store import VectorStore

logger = logging.getLogger(__name__)


FIXER_SYSTEM_PROMPT = """You are PipeGenie's Fixer Agent — an expert DevOps AI that generates
safe, executable remediation scripts for CI/CD pipeline failures.

Given a diagnosis, generate a precise fix. Output ONLY valid JSON:
{
  "fix_type": "dependency|config|patch|build|test|permissions|network",
  "fix_description": "1-2 sentence human-readable fix description",
  "fix_script": "#!/bin/bash\\n# exact commands to fix the issue",
  "pre_conditions": ["condition 1 to verify before running"],
  "post_conditions": ["what to verify after fix"],
  "estimated_risk": 0.2,
  "requires_restart": false,
  "rollback_script": "#!/bin/bash\\n# commands to undo the fix if needed"
}

Rules:
- Scripts must be safe and idempotent (can run multiple times safely)
- Use conditional checks before making changes (e.g., `if ! command -v xyz; then ...`)
- Never delete production data
- Always include error handling with `set -e`
- Prefer additive changes over replacements"""


class FixerAgent:
    def __init__(self):
        self.vector_store = VectorStore()
        self._init_llm()

    def _init_llm(self):
        if settings.USE_OLLAMA:
            self.llm = ChatOllama(
                model=settings.LLM_MODEL,
                base_url=settings.OLLAMA_BASE_URL,
                temperature=0.2,
                format="json"
            )
        else:
            self.llm = ChatMistralAI(
                model="mistral-large-latest",
                api_key=settings.MISTRAL_API_KEY,
                temperature=0.2
            )

    async def generate_fix(self, diagnosis: dict, repo: str, branch: str,
                           raw_logs: str) -> dict:
        """Generate a fix plan from diagnosis output."""
        logger.info(f"[FixerAgent] Generating fix for category: {diagnosis.get('failure_category')}")

        # Check if there's a known fix from vector store
        similar_fixes = await self.vector_store.search_known_fixes(
            diagnosis.get("failure_category", "unknown"),
            diagnosis.get("root_cause", ""),
            top_k=2
        )

        similar_context = ""
        if similar_fixes:
            fixes_text = "\n".join([
                f"Fix #{i+1}: {f.get('fix_description')} → Script: {f.get('fix_script', '')[:200]}"
                for i, f in enumerate(similar_fixes)
            ])
            similar_context = f"\n=== KNOWN FIXES FOR SIMILAR FAILURES ===\n{fixes_text}"

        user_prompt = f"""
Repository: {repo}
Branch: {branch}

=== DIAGNOSIS ===
Root Cause: {diagnosis.get('root_cause')}
Category: {diagnosis.get('failure_category')}
Affected Files: {', '.join(diagnosis.get('affected_files', []))}
Error Lines: {chr(10).join(diagnosis.get('error_lines', [])[:5])}

=== RELEVANT LOG SNIPPET ===
{raw_logs[-1500:]}
{similar_context}

Generate a safe, executable fix script for this CI/CD pipeline failure.
"""
        messages = [
            SystemMessage(content=FIXER_SYSTEM_PROMPT),
            HumanMessage(content=user_prompt)
        ]

        try:
            response = self.llm.invoke(messages)
            result = self._parse_json_response(response.content)
        except Exception as e:
            logger.error(f"FixerAgent LLM failed: {e}")
            result = self._fallback_fix(diagnosis)

        logger.info(f"[FixerAgent] Fix type: {result.get('fix_type')}, Risk: {result.get('estimated_risk')}")
        return result

    def _parse_json_response(self, content: str) -> dict:
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            pass
        match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", content, re.DOTALL)
        if match:
            return json.loads(match.group(1))
        match = re.search(r"\{.*\}", content, re.DOTALL)
        if match:
            return json.loads(match.group(0))
        raise ValueError("Could not parse fix JSON")

    def _fallback_fix(self, diagnosis: dict) -> dict:
        """Rule-based fallback fixes for common categories."""
        cat = diagnosis.get("failure_category", "unknown")

        scripts = {
            "dependency_error": "#!/bin/bash\nset -e\necho 'Installing dependencies...'\npip install -r requirements.txt\necho 'Done.'",
            "test_failure": "#!/bin/bash\nset -e\necho 'Running tests in verbose mode to identify failures...'\npytest --tb=short -v || true",
            "build_error": "#!/bin/bash\nset -e\necho 'Cleaning build artifacts...'\nfind . -name '__pycache__' -type d -exec rm -rf {} + 2>/dev/null || true\nfind . -name '*.pyc' -delete 2>/dev/null || true\nnpm run build 2>/dev/null || pip install -e . 2>/dev/null || echo 'Build cleanup done'",
            "permissions_error": "#!/bin/bash\nset -e\necho 'Fixing permissions...'\nchmod +x scripts/*.sh 2>/dev/null || true\nchown -R $(whoami) . 2>/dev/null || true",
            "network_error": "#!/bin/bash\nset -e\necho 'Checking network and retrying...'\nfor i in 1 2 3; do\n  wget -q --spider https://pypi.org && break\n  echo \"Retry $i...\"\n  sleep 10\ndone\npip install --retries 5 -r requirements.txt",
        }

        script = scripts.get(cat, "#!/bin/bash\necho 'Manual intervention required'\nexit 1")
        return {
            "fix_type": cat.replace("_error", "") if cat != "unknown" else "manual",
            "fix_description": f"Automated fallback fix for {cat}",
            "fix_script": script,
            "pre_conditions": [],
            "post_conditions": [],
            "estimated_risk": 0.4,
            "requires_restart": False,
            "rollback_script": "#!/bin/bash\necho 'No rollback needed for this fix'"
        }

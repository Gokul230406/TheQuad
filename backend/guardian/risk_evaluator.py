"""
Guardian – Risk Evaluator Module
Scores the risk of a proposed fix using multi-factor analysis.
"""
import hashlib
import logging
import re
from typing import List

from backend.config import settings
from backend.agents.log_signals import infer_failure_category_from_logs

logger = logging.getLogger(__name__)


class RiskEvaluator:
    """
    Multi-factor risk scoring engine.
    Score range: 0.0 (safe) → 1.0 (dangerous)
    """

    # Dangerous patterns in fix scripts
    DANGEROUS_PATTERNS = [
        (r"\brm\s+-rf\s+/", 0.9, "Attempts to delete root filesystem"),
        (r"\brm\s+-rf\s+\.", 0.6, "Attempts to delete entire current directory"),
        (r"sudo\s+rm", 0.5, "Uses sudo to delete files"),
        (r"\bsudo\b", 0.25, "Uses sudo privilege escalation"),
        (r"/(etc|var|usr|opt|root)/", 0.25, "Touches host-level system paths"),
        (r"DROP\s+TABLE", 0.8, "Attempts to drop database table"),
        (r"DROP\s+DATABASE", 0.9, "Attempts to drop entire database"),
        (r"ALTER\s+TABLE.*DROP", 0.6, "Attempts to drop database column"),
        (r"\btruncate\b", 0.7, "Attempts to truncate table data"),
        (r"chmod\s+777", 0.5, "Sets insecure world-writable permissions"),
        (r"curl.*\|\s*bash", 0.7, "Pipes remote script directly to bash"),
        (r"wget.*\|\s*sh", 0.7, "Pipes remote script directly to sh"),
        (r"git\s+push.*--force", 0.6, "Force pushes to repository"),
        (r"git\s+reset\s+--hard\s+HEAD~", 0.5, "Hard resets Git history"),
        (r"kubectl\s+delete\s+namespace", 0.9, "Deletes Kubernetes namespace"),
        (r"kubectl\s+delete\s+all", 0.8, "Deletes all Kubernetes resources"),
        (r"aws\s+s3\s+rm\s+--recursive", 0.7, "Recursively deletes S3 bucket"),
        (r"eval\s+\$", 0.6, "Uses eval with variable (injection risk)"),
        (r":\s*\(\)\s*\{", 0.9, "Fork bomb pattern detected"),
    ]

    SAFE_PATTERNS = [
        (r"pip\s+install", -0.1, "Safe: pip install"),
        (r"npm\s+install", -0.1, "Safe: npm install"),
        (r"apt-get\s+install\s+-y", -0.05, "Safe: apt-get install"),
        (r"set\s+-e", -0.05, "Good: exits on error"),
        (r"if\s+\[.*\];\s*then", -0.05, "Good: conditional checks present"),
        (r"echo\s+", -0.02, "Safe: echo statements"),
    ]

    BRANCH_RISK = {
        "main": 0.2,
        "master": 0.2,
        "production": 0.25,
        "prod": 0.25,
        "release": 0.15,
        "develop": 0.05,
        "dev": 0.05,
        "staging": 0.1,
        "feature": 0.0,
        "fix": 0.0,
        "hotfix": 0.1,
    }

    FIX_TYPE_RISK = {
        "dependency": 0.1,
        "config": 0.2,
        "patch": 0.15,
        "build": 0.1,
        "test": 0.05,
        "permissions": 0.2,
        "network": 0.1,
        "manual": 0.4,
    }

    # LLM / diagnosis often use *_error; map to fix-type weights above.
    FIX_TYPE_ALIASES = {
        "dependency_error": "dependency",
        "test_failure": "test",
        "build_error": "build",
        "config_error": "config",
        "network_error": "network",
        "permissions_error": "permissions",
        "unknown": "manual",
    }

    # How much unresolved failure severity should move the needle (on top of script/branch).
    FAILURE_CATEGORY_WEIGHT = {
        "dependency_error": 0.04,
        "test_failure": 0.05,
        "build_error": 0.07,
        "config_error": 0.06,
        "network_error": 0.06,
        "permissions_error": 0.12,
        "unknown": 0.09,
    }

    # Commands that are usually valid but can still impact runtime behavior/state.
    OPERATIONAL_PATTERNS = [
        (r"\bsed\b.*\s-i\b", 0.18, "Performs in-place file modifications"),
        (r"\b(tee|cat)\b.*>\s*[^>\n]+", 0.14, "Writes configuration/content into files"),
        (r"\bmv\b\s+[^\n]+", 0.1, "Moves or renames files"),
        (r"\bcp\b\s+[^\n]+", 0.08, "Copies files in repository"),
        (r"\b(git\s+checkout|git\s+commit)\b", 0.14, "Mutates repository state"),
        (r"\b(docker\s+compose|docker\s+build|docker\s+run)\b", 0.12, "Touches container build/runtime behavior"),
        (r"\b(terraform\s+apply|kubectl\s+apply)\b", 0.25, "Applies infra/environment changes"),
    ]

    TIMING_PATTERNS = [
        (r"\b(pip|pip3)\s+install\b", 18.0, "Python dependency installation"),
        (r"\bnpm\s+(ci|install)\b", 24.0, "Node dependency installation"),
        (r"\bapt(-get)?\s+install\b", 20.0, "OS package installation"),
        (r"\b(pytest|npm\s+test|go\s+test)\b", 14.0, "Test execution"),
        (r"\b(npm\s+run\s+build|mvn\s+package|gradle\s+build)\b", 26.0, "Build step execution"),
        (r"\b(curl|wget|git\s+clone)\b", 12.0, "Network/download operation"),
        (r"\bsleep\b", 10.0, "Explicit waiting in script"),
    ]

    def _estimate_timing(self, script: str) -> dict:
        non_empty_lines = [line for line in script.split("\n") if line.strip()]
        estimated_seconds = 6.0 + min(len(non_empty_lines) * 1.4, 50.0)
        reasons = [f"Baseline from {len(non_empty_lines)} executable lines"]

        for pattern, delta_seconds, reason in self.TIMING_PATTERNS:
            if re.search(pattern, script, re.IGNORECASE):
                estimated_seconds += delta_seconds
                reasons.append(f"+{int(delta_seconds)}s from {reason}")

        estimated_seconds = round(min(max(estimated_seconds, 5.0), 360.0), 1)
        if estimated_seconds <= 20:
            level = "fast"
        elif estimated_seconds <= 60:
            level = "moderate"
        else:
            level = "slow"

        return {
            "estimated_seconds": estimated_seconds,
            "level": level,
            "reasons": reasons,
        }

    @staticmethod
    def _normalize_fix_type(raw: str) -> str:
        t = (raw or "manual").strip().lower()
        if t in RiskEvaluator.FIX_TYPE_RISK:
            return t
        if t in RiskEvaluator.FIX_TYPE_ALIASES:
            return RiskEvaluator.FIX_TYPE_ALIASES[t]
        if t.endswith("_error"):
            base = t[: -len("_error")]
            if base in RiskEvaluator.FIX_TYPE_RISK:
                return base
        return "manual"

    @staticmethod
    def _branch_tail_and_risk(branch: str) -> tuple[str, float, str | None]:
        """
        Use the last path segment (e.g. origin/feature/main -> main) so we do not treat
        unrelated names containing 'main'/'dev' substrings as protected branches.
        """
        branch_lower = (branch or "").lower().strip()
        tail = branch_lower.replace("\\", "/").split("/")[-1] or branch_lower
        branch_risk = 0.05
        matched_key: str | None = None
        for key, risk in RiskEvaluator.BRANCH_RISK.items():
            if tail == key:
                branch_risk = risk
                matched_key = key
                break
            if tail.startswith(f"{key}-") or tail.endswith(f"-{key}"):
                if risk > branch_risk:
                    branch_risk = risk
                    matched_key = key
        return tail, branch_risk, matched_key

    def evaluate(
        self,
        fix: dict,
        diagnosis: dict,
        repo: str,
        branch: str,
        raw_logs: str | None = None,
    ) -> dict:
        """
        Return a risk report:
        {
          "score": 0.0-1.0,
          "level": "low|medium|high",
          "reasons": [...],
          "breakdown": {...}
        }
        """
        reasons: List[str] = []
        breakdown = {}
        total_score = 0.0

        script = fix.get("fix_script", "")
        script_lower = script.lower()

        # 1. Script pattern analysis
        script_score = 0.0
        for pattern, weight, reason in self.DANGEROUS_PATTERNS:
            if re.search(pattern, script, re.IGNORECASE):
                script_score += weight
                reasons.append(f"⚠️ {reason}")

        for pattern, weight, reason in self.OPERATIONAL_PATTERNS:
            if re.search(pattern, script, re.IGNORECASE):
                script_score += weight
                reasons.append(f"⚠️ {reason}")

        for pattern, weight, reason in self.SAFE_PATTERNS:
            if re.search(pattern, script, re.IGNORECASE):
                script_score += weight  # weight is negative here

        script_score = max(0.0, min(script_score, 1.0))
        breakdown["script_analysis"] = script_score
        total_score += script_score * 0.4  # 40% weight

        # 2. Branch risk (last path segment only — avoids false "main"/"dev" substring hits)
        branch_tail, branch_risk, branch_key = self._branch_tail_and_risk(branch)
        protected_branch = branch_risk >= 0.2
        if protected_branch and branch_key:
            reasons.append(f"⚠️ Targeting protected branch segment '{branch_tail}' ({branch_key})")
        breakdown["branch_risk"] = branch_risk
        breakdown["branch_tail"] = branch_tail
        total_score += branch_risk * 0.3  # 30% weight

        # 3. Fix type risk (normalize LLM categories like dependency_error → dependency)
        fix_type = self._normalize_fix_type(str(fix.get("fix_type", "manual")))
        fix_type_risk = self.FIX_TYPE_RISK.get(fix_type, 0.3)
        breakdown["fix_type"] = fix_type
        breakdown["fix_type_risk"] = fix_type_risk
        total_score += fix_type_risk * 0.2  # 20% weight

        # 3b. Diagnosis severity — when diagnosis is unknown, infer category from logs so risk varies by incident
        diag = diagnosis if isinstance(diagnosis, dict) else {}
        diag_cat = str(diag.get("failure_category", "unknown")).strip().lower()
        failure_cat = diag_cat
        breakdown["failure_category_source"] = "diagnosis"
        if failure_cat in ("", "unknown"):
            inferred = infer_failure_category_from_logs(raw_logs or "")
            if inferred != "unknown":
                failure_cat = inferred
                breakdown["failure_category_source"] = "logs"
                reasons.append(f"Heuristic: logs suggest {failure_cat.replace('_', ' ')}")

        cat_weight = self.FAILURE_CATEGORY_WEIGHT.get(failure_cat, 0.08)
        breakdown["failure_category"] = failure_cat
        breakdown["failure_category_weight"] = cat_weight
        total_score += cat_weight

        # 3c. Stable fingerprint from full log body (bounded) — different incidents diverge in score
        # even when category + fix template match (common with repeated CI templates).
        log_body = (raw_logs or "")[:32000]
        if log_body.strip():
            digest = hashlib.sha256(log_body.encode("utf-8", errors="ignore")).digest()
            v = int.from_bytes(digest[:4], "big") / (2**32)
            log_jitter = round(0.018 + v * 0.092, 4)  # ~0.018–0.110
            breakdown["log_fingerprint_weight"] = log_jitter
            total_score += log_jitter

        try:
            conf = float(diag.get("confidence", 0.75))
        except (TypeError, ValueError):
            conf = 0.75
        conf = min(max(conf, 0.0), 1.0)
        uncertainty = (1.0 - conf) * 0.15
        breakdown["diagnosis_confidence"] = conf
        breakdown["uncertainty_from_confidence"] = round(uncertainty, 4)
        total_score += uncertainty

        # 4. Script complexity (longer = riskier)
        lines = len([l for l in script.split("\n") if l.strip()])
        complexity_score = min(lines / 50, 0.5)  # max 0.5 for very long scripts
        breakdown["complexity"] = complexity_score
        breakdown["line_count"] = lines
        total_score += complexity_score * 0.1  # 10% weight

        # 5. Execution timing estimate (long-running scripts increase execution exposure).
        timing = self._estimate_timing(script)
        breakdown["estimated_duration_seconds"] = timing["estimated_seconds"]
        if timing["level"] == "moderate":
            total_score += 0.03
            reasons.append("⚠️ Estimated execution time is moderate")
        elif timing["level"] == "slow":
            total_score += 0.08
            reasons.append("⚠️ Estimated execution time is slow")

        # 6. Guardrail for protected branches with scripts that mutate runtime or dependencies.
        protected_branch_runtime_ops = any(
            token in script_lower
            for token in ("pip install", "npm install", "apt-get install", "curl", "wget", "sed -i", "poetry ")
        )
        protected_branch_privileged_ops = any(
            token in script_lower
            for token in ("sudo ", "/etc/", "/var/", "/usr/", "/opt/", "/root/")
        )
        if protected_branch and protected_branch_runtime_ops:
            total_score = max(total_score, 0.34)
            reasons.append("⚠️ Protected branch + runtime-impacting changes require closer review")
        if protected_branch and protected_branch_privileged_ops:
            total_score = max(total_score, 0.4)
            reasons.append("⚠️ Protected branch + privileged/system-path changes are medium+ risk")

        # 7. LLM-estimated risk as override check
        llm_risk_raw = fix.get("estimated_risk", 0.3)
        try:
            llm_risk = float(llm_risk_raw)
        except (TypeError, ValueError):
            llm_risk = 0.3
        llm_risk = min(max(llm_risk, 0.0), 1.0)

        if llm_risk > 0.5:
            reasons.append(f"⚠️ AI agent estimated elevated risk ({llm_risk:.2f})")
        total_score = max(total_score, llm_risk * 0.7)
        if llm_risk > 0.7:
            reasons.append(f"⚠️ AI agent flagged high estimated risk ({llm_risk:.2f})")
            total_score = max(total_score, llm_risk * 0.8)

        # Clamp final score
        final_score = round(min(max(total_score, 0.0), 1.0), 3)

        # Determine level
        if final_score <= settings.RISK_LOW_THRESHOLD:
            level = "low"
        elif final_score <= settings.RISK_HIGH_THRESHOLD:
            level = "medium"
        else:
            level = "high"

        if not reasons:
            reasons.append("✅ No dangerous patterns detected")

        logger.info(f"[Guardian] Risk score: {final_score} ({level}) | Reasons: {len(reasons)}")

        justification = "; ".join(
            r.replace("⚠️ ", "").replace("✅ ", "") for r in reasons if isinstance(r, str)
        )

        return {
            "score": final_score,
            "level": level,
            "reasons": reasons,
            "breakdown": breakdown,
            "timing": timing,
            "auto_approve": level in ("low", "medium"),
            # Aliases for clients that expect these names (e.g. Simulate fix preview).
            "risk_level": level,
            "risk_score": final_score,
            "justification": justification or "Risk derived from script, branch, fix type, and diagnosis signals.",
        }

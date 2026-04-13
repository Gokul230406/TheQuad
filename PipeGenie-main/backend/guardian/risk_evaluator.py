"""
Guardian – Risk Evaluator Module
Scores the risk of a proposed fix using multi-factor analysis.
"""
import logging
import re
from typing import List

from backend.config import settings

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

    def evaluate(self, fix: dict, diagnosis: dict, repo: str, branch: str) -> dict:
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

        # 1. Script pattern analysis
        script_score = 0.0
        for pattern, weight, reason in self.DANGEROUS_PATTERNS:
            if re.search(pattern, script, re.IGNORECASE):
                script_score += weight
                reasons.append(f"⚠️ {reason}")

        for pattern, weight, reason in self.SAFE_PATTERNS:
            if re.search(pattern, script, re.IGNORECASE):
                script_score += weight  # weight is negative here

        script_score = max(0.0, min(script_score, 1.0))
        breakdown["script_analysis"] = script_score
        total_score += script_score * 0.4  # 40% weight

        # 2. Branch risk
        branch_lower = branch.lower()
        branch_risk = 0.05  # default
        for key, risk in self.BRANCH_RISK.items():
            if key in branch_lower:
                branch_risk = risk
                if risk >= 0.2:
                    reasons.append(f"⚠️ Targeting protected branch: {branch}")
                break
        breakdown["branch_risk"] = branch_risk
        total_score += branch_risk * 0.3  # 30% weight

        # 3. Fix type risk
        fix_type = fix.get("fix_type", "manual").lower()
        fix_type_risk = self.FIX_TYPE_RISK.get(fix_type, 0.3)
        breakdown["fix_type_risk"] = fix_type_risk
        total_score += fix_type_risk * 0.2  # 20% weight

        # 4. Script complexity (longer = riskier)
        lines = len([l for l in script.split("\n") if l.strip()])
        complexity_score = min(lines / 50, 0.5)  # max 0.5 for very long scripts
        breakdown["complexity"] = complexity_score
        total_score += complexity_score * 0.1  # 10% weight

        # 5. LLM-estimated risk as override check
        llm_risk = fix.get("estimated_risk", 0.3)
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

        return {
            "score": final_score,
            "level": level,
            "reasons": reasons,
            "breakdown": breakdown,
            "auto_approve": level in ("low", "medium")
        }

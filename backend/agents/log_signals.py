"""
Heuristic failure signals from raw CI logs — shared by diagnosis fallback and risk scoring.
Order matters: check more specific patterns before broad ones.
"""


def infer_failure_category_from_logs(logs: str) -> str:
    """Return a failure_category string aligned with diagnosis_agent / RiskEvaluator."""
    s = (logs or "").lower()
    if not s.strip():
        return "unknown"

    if "modulenotfounderror" in s or "no module named" in s:
        return "dependency_error"
    if "could not find a version" in s or "no matching distribution" in s:
        return "dependency_error"
    if "pip install" in s and ("error:" in s or "error " in s or "failed" in s or "##[error]" in s):
        return "dependency_error"
    if "npm err" in s or "yarn error" in s or "pnpm err" in s:
        return "dependency_error"
    if "go: cannot find" in s or "cannot find module" in s:
        return "dependency_error"

    if "pytest" in s or "::test_" in s or "assertionerror" in s:
        return "test_failure"
    if "failed test" in s or "tests failed" in s or "test suite failed" in s:
        return "test_failure"

    if "yaml.scanner" in s or "yaml.parser" in s or "mapping values are not allowed" in s:
        return "build_error"
    if "syntaxerror" in s or "unexpected token" in s:
        return "build_error"
    if "eslint" in s and "error" in s:
        return "build_error"
    if "error ts" in s or ("tsc " in s and "error" in s):
        return "build_error"
    if "gradle" in s and "failed" in s:
        return "build_error"
    if "maven" in s and "failure" in s:
        return "build_error"
    if "compilation error" in s or "build failed" in s:
        return "build_error"

    if "permission denied" in s or "eacces" in s or "operation not permitted" in s:
        return "permissions_error"

    if "max retries exceeded" in s or "connection refused" in s or "econnrefused" in s:
        return "network_error"
    if "timed out" in s or "timeout" in s or "etimedout" in s:
        return "network_error"
    if "could not resolve host" in s or "name or service not known" in s:
        return "network_error"

    return "unknown"

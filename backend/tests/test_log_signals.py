from backend.agents.log_signals import infer_failure_category_from_logs


def test_infer_pip_resolution_failure():
    logs = """Run pip install -r requirements.txt
ERROR: Could not find a version that satisfies the requirement cryptography==41.0.0
ERROR: No matching distribution found for cryptography==41.0.0
"""
    assert infer_failure_category_from_logs(logs) == "dependency_error"


def test_infer_pytest_failure():
    logs = "pytest tests/ -v\nFAILED tests/test_auth.py::test_login - AssertionError\n"
    assert infer_failure_category_from_logs(logs) == "test_failure"

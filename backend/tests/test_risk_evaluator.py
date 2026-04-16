try:
    from backend.config import settings
    from backend.guardian.risk_evaluator import RiskEvaluator
except ModuleNotFoundError:
    from config import settings
    from guardian.risk_evaluator import RiskEvaluator


def test_risk_evaluator_flags_destructive_script_as_high_risk():
    evaluator = RiskEvaluator()

    report = evaluator.evaluate(
        fix={
            "fix_type": "manual",
            "fix_script": "#!/bin/bash\nset -e\nrm -rf /\n",
            "estimated_risk": 0.9,
        },
        diagnosis={"failure_category": "unknown"},
        repo="demo/repo",
        branch="main",
    )

    assert report["score"] > settings.RISK_HIGH_THRESHOLD
    assert report["level"] == "high"
    assert report["timing"]["estimated_seconds"] >= 5


def test_risk_evaluator_returns_timing_metadata():
    evaluator = RiskEvaluator()

    report = evaluator.evaluate(
        fix={
            "fix_type": "dependency",
            "fix_script": "#!/bin/bash\nset -e\npip install -r requirements.txt\npytest -q\n",
            "estimated_risk": 0.3,
        },
        diagnosis={"failure_category": "dependency_error"},
        repo="demo/repo",
        branch="develop",
    )

    assert "timing" in report
    assert report["timing"]["estimated_seconds"] > 20
    assert report["timing"]["level"] in {"moderate", "slow"}

"""
Post-remediation verification service.
Runs Docker-based test command and returns structured results.
"""
import asyncio
from pathlib import Path

from backend.config import settings


class VerificationService:
    def __init__(self):
        self.enabled = settings.AUTO_RUN_DOCKER_TESTS
        self.command = settings.DOCKER_TEST_COMMAND
        self.timeout_seconds = settings.DOCKER_TEST_TIMEOUT_SECONDS
        self.project_root = Path(__file__).resolve().parents[2]

    async def run(self) -> dict:
        if not self.enabled:
            return {
                "status": "skipped",
                "passed": False,
                "message": "Automatic Docker verification is disabled.",
            }

        process = await asyncio.create_subprocess_shell(
            self.command,
            cwd=str(self.project_root),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        timed_out = False
        try:
            stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=self.timeout_seconds)
        except asyncio.TimeoutError:
            timed_out = True
            process.kill()
            await process.communicate()
            stdout, stderr = b"", b"Verification timed out."

        output = ((stdout or b"") + b"\n" + (stderr or b"")).decode("utf-8", errors="replace").strip()
        exit_code = process.returncode
        if exit_code is None:
            exit_code = 1
        if timed_out:
            exit_code = 124

        # Windows may surface non-zero success edge cases; treat only explicit 0 as pass.
        passed = (exit_code == 0) and not timed_out
        status = "passed" if passed else "failed"
        message = "Docker verification passed." if passed else "Docker verification failed."
        if timed_out:
            message = "Docker verification timed out."

        return {
            "status": status,
            "passed": passed,
            "exit_code": exit_code,
            "timed_out": timed_out,
            "command": self.command,
            "message": message,
            "output": output[-12000:],
        }

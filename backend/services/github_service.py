"""
GitHub Service – interacts with GitHub API for log fetching and re-runs.
"""
import logging
import httpx
from typing import Optional, List

from backend.config import settings

logger = logging.getLogger(__name__)


class GitHubService:
    BASE_URL = "https://api.github.com"

    def __init__(self):
        self.token = settings.GITHUB_TOKEN
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28"
        }

    async def get_workflow_logs(self, repo: str, run_id: str) -> str:
        """Fetch logs for a specific workflow run."""
        if not self.token:
            return "GitHub token not configured. Using webhook-provided logs."

        url = f"{self.BASE_URL}/repos/{repo}/actions/runs/{run_id}/logs"
        async with httpx.AsyncClient() as client:
            try:
                resp = await client.get(url, headers=self.headers, follow_redirects=True, timeout=30)
                if resp.status_code == 200:
                    # Logs come as a ZIP file - return raw content for now
                    return resp.text[:8000]  # Limit log size
                else:
                    logger.warning(f"GitHub logs fetch failed: {resp.status_code}")
                    return f"Could not fetch logs: HTTP {resp.status_code}"
            except Exception as e:
                logger.error(f"GitHub API error: {e}")
                return f"GitHub API error: {str(e)}"

    async def get_commit_info(self, repo: str, commit_sha: str) -> dict:
        """Fetch commit details."""
        if not self.token:
            return {}
        url = f"{self.BASE_URL}/repos/{repo}/commits/{commit_sha}"
        async with httpx.AsyncClient() as client:
            try:
                resp = await client.get(url, headers=self.headers, timeout=15)
                if resp.status_code == 200:
                    data = resp.json()
                    return {
                        "sha": commit_sha,
                        "message": data.get("commit", {}).get("message", ""),
                        "author": data.get("commit", {}).get("author", {}).get("name", ""),
                        "files_changed": [f["filename"] for f in data.get("files", [])]
                    }
            except Exception as e:
                logger.error(f"Commit info error: {e}")
        return {}

    async def trigger_rerun(self, repo: str, run_id: str) -> bool:
        """Re-trigger a failed GitHub Actions workflow run."""
        if not self.token:
            logger.warning("[GitHub] No token configured, skipping re-run")
            return False

        url = f"{self.BASE_URL}/repos/{repo}/actions/runs/{run_id}/rerun-failed-jobs"
        async with httpx.AsyncClient() as client:
            try:
                resp = await client.post(url, headers=self.headers, timeout=15)
                success = resp.status_code in (201, 204)
                logger.info(f"[GitHub] Re-run for {repo}#{run_id}: {'SUCCESS' if success else 'FAILED'}")
                return success
            except Exception as e:
                logger.error(f"[GitHub] Re-run trigger error: {e}")
                return False

    async def get_run_info(self, repo: str, run_id: str) -> dict:
        """Get metadata about a workflow run."""
        if not self.token:
            return {}
        url = f"{self.BASE_URL}/repos/{repo}/actions/runs/{run_id}"
        async with httpx.AsyncClient() as client:
            try:
                resp = await client.get(url, headers=self.headers, timeout=15)
                if resp.status_code == 200:
                    data = resp.json()
                    return {
                        "workflow_name": data.get("name", ""),
                        "head_branch": data.get("head_branch", ""),
                        "head_sha": data.get("head_sha", ""),
                        "conclusion": data.get("conclusion", ""),
                        "html_url": data.get("html_url", "")
                    }
            except Exception as e:
                logger.error(f"[GitHub] Run info error: {e}")
        return {}

    async def create_pull_request(
        self,
        repo: str,
        head_branch: str,
        base_branch: str,
        title: str,
        body: str
    ) -> dict:
        """Create a pull request and return metadata."""
        if not self.token:
            logger.warning("[GitHub] No token configured, skipping PR creation")
            return {}

        url = f"{self.BASE_URL}/repos/{repo}/pulls"
        payload = {
            "title": title,
            "head": head_branch,
            "base": base_branch,
            "body": body,
            "draft": False
        }

        async with httpx.AsyncClient() as client:
            try:
                resp = await client.post(url, headers=self.headers, json=payload, timeout=20)
                if resp.status_code in (200, 201):
                    data = resp.json()
                    return {
                        "number": data.get("number"),
                        "html_url": data.get("html_url", ""),
                        "state": data.get("state", "open")
                    }

                logger.warning(f"[GitHub] PR creation failed: {resp.status_code} {resp.text[:300]}")
                return {}
            except Exception as e:
                logger.error(f"[GitHub] PR creation error: {e}")
                return {}

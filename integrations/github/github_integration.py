"""
Legend GitHub integration — reads repos for context, writes and commits code.
Uses the GitHub API directly (no gh CLI dependency).
"""

import os
import base64
from dataclasses import dataclass
from typing import Optional
import httpx


@dataclass
class RepoFile:
    path: str
    content: str
    sha: str


@dataclass
class CommitResult:
    sha: str
    url: str
    message: str


class GitHubIntegration:
    def __init__(self):
        self.token = os.environ.get("GITHUB_TOKEN", "")
        self.base_url = "https://api.github.com"
        self._headers = {
            "Authorization": f"Bearer {self.token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }

    async def read_file(self, owner: str, repo: str, path: str, ref: str = "main") -> RepoFile:
        """Read a single file from a GitHub repository."""
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{self.base_url}/repos/{owner}/{repo}/contents/{path}",
                headers=self._headers,
                params={"ref": ref},
            )
            resp.raise_for_status()
            data = resp.json()
            content = base64.b64decode(data["content"]).decode("utf-8")
            return RepoFile(path=path, content=content, sha=data["sha"])

    async def read_repo_context(
        self, owner: str, repo: str, paths: list[str], ref: str = "main"
    ) -> dict[str, str]:
        """Read multiple files and return them as a context dict for Legend's brain."""
        context = {}
        async with httpx.AsyncClient() as client:
            for path in paths:
                try:
                    resp = await client.get(
                        f"{self.base_url}/repos/{owner}/{repo}/contents/{path}",
                        headers=self._headers,
                        params={"ref": ref},
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        content = base64.b64decode(data["content"]).decode("utf-8")
                        context[path] = content
                except Exception:
                    pass
        return context

    async def list_files(
        self, owner: str, repo: str, path: str = "", ref: str = "main"
    ) -> list[str]:
        """List files in a repo directory."""
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{self.base_url}/repos/{owner}/{repo}/contents/{path}",
                headers=self._headers,
                params={"ref": ref},
            )
            resp.raise_for_status()
            items = resp.json()
            return [item["path"] for item in items if item["type"] == "file"]

    async def write_file(
        self,
        owner: str,
        repo: str,
        path: str,
        content: str,
        message: str,
        branch: str = "main",
        sha: Optional[str] = None,
    ) -> CommitResult:
        """Write (create or update) a file in a GitHub repository."""
        encoded = base64.b64encode(content.encode("utf-8")).decode("ascii")
        body: dict = {
            "message": message,
            "content": encoded,
            "branch": branch,
        }
        if sha:
            body["sha"] = sha

        async with httpx.AsyncClient() as client:
            resp = await client.put(
                f"{self.base_url}/repos/{owner}/{repo}/contents/{path}",
                headers=self._headers,
                json=body,
            )
            resp.raise_for_status()
            data = resp.json()
            commit = data["commit"]
            return CommitResult(
                sha=commit["sha"],
                url=commit["html_url"],
                message=commit["message"],
            )

    async def create_branch(
        self, owner: str, repo: str, branch: str, from_branch: str = "main"
    ) -> str:
        """Create a new branch from an existing one."""
        async with httpx.AsyncClient() as client:
            # Get the SHA of the source branch
            resp = await client.get(
                f"{self.base_url}/repos/{owner}/{repo}/git/ref/heads/{from_branch}",
                headers=self._headers,
            )
            resp.raise_for_status()
            sha = resp.json()["object"]["sha"]

            # Create new branch
            resp = await client.post(
                f"{self.base_url}/repos/{owner}/{repo}/git/refs",
                headers=self._headers,
                json={"ref": f"refs/heads/{branch}", "sha": sha},
            )
            resp.raise_for_status()
            return branch

    def build_repo_context_prompt(self, context: dict[str, str]) -> str:
        """Format repo files into a prompt-friendly context string for Legend's brain."""
        if not context:
            return ""
        parts = ["## Repository Context\n"]
        for path, content in context.items():
            lines = content.split("\n")
            preview = "\n".join(lines[:50])
            if len(lines) > 50:
                preview += f"\n... ({len(lines) - 50} more lines)"
            parts.append(f"### {path}\n```\n{preview}\n```\n")
        return "\n".join(parts)

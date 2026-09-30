from __future__ import annotations

import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from catalog_service import CatalogService, EditorError


GITHUB_ACCOUNT = "Wichtowski"
GITHUB_HOST = "github.com"


class GitService:
    def __init__(self, repo_root: Path, catalogs: CatalogService):
        self.repo_root = repo_root
        self.catalogs = catalogs

    def status(self) -> dict[str, Any]:
        branch = self._run(["git", "branch", "--show-current"]).strip()
        paths = self._changed_paths()
        return {
            "branch": branch,
            "changedPaths": paths,
            "hasChanges": bool(paths),
            "canPublish": bool(paths) and self._only_data_paths(paths),
            "githubAuthenticated": self._active_github_login() == GITHUB_ACCOUNT,
        }

    def publish(self, message: object, title: object, body: object) -> dict[str, str]:
        commit_message = self._required_text(message, "Commit message", 120)
        pr_title = self._required_text(title, "PR title", 200)
        pr_body = self._optional_text(body, "PR body", 10_000)
        self.catalogs.validate()

        changed = self._changed_paths()
        if not changed:
            raise EditorError("There are no catalog changes to publish.")
        disallowed = [path for path in changed if not path.startswith("data/")]
        if disallowed:
            raise EditorError(
                "Refusing to publish because changes outside data/ are present.", details=disallowed
            )
        if self._active_github_login() != GITHUB_ACCOUNT:
            raise EditorError(f'GitHub CLI must be authenticated as "{GITHUB_ACCOUNT}".')

        branch = self._run(["git", "branch", "--show-current"]).strip()
        if branch == "main":
            suffix = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
            branch = f"AI/catalog-{suffix}"
            self._run(["git", "switch", "-c", branch])
        if not branch:
            raise EditorError("Cannot publish from a detached HEAD.")

        self._run(["git", "add", "--", "data"])
        self._run(["git", "commit", "-m", commit_message])
        self._run(["git", "push", "--set-upstream", "origin", branch], timeout=180)
        url = self._run(
            [
                "gh",
                "pr",
                "create",
                "--base",
                "main",
                "--head",
                branch,
                "--title",
                pr_title,
                "--body",
                pr_body,
            ],
            timeout=180,
        ).strip()
        return {"branch": branch, "url": url}

    def _changed_paths(self) -> list[str]:
        output = self._run(["git", "status", "--porcelain=v1", "-z"])
        paths: list[str] = []
        entries = output.split("\0")
        index = 0
        while index < len(entries):
            entry = entries[index]
            if not entry:
                index += 1
                continue
            status = entry[:2]
            path = entry[3:]
            if status[0] in {"R", "C"}:
                index += 1
                if index < len(entries):
                    path = entries[index]
            paths.append(path)
            index += 1
        return sorted(set(paths))

    @staticmethod
    def _only_data_paths(paths: list[str]) -> bool:
        return all(path.startswith("data/") for path in paths)

    def _active_github_login(self) -> str | None:
        try:
            result = subprocess.run(
                ["gh", "api", "user", "--hostname", GITHUB_HOST, "--jq", ".login"],
                cwd=self.repo_root,
                capture_output=True,
                text=True,
                timeout=15,
            )
        except (OSError, subprocess.TimeoutExpired):
            return None
        return result.stdout.strip() if result.returncode == 0 else None

    @staticmethod
    def _required_text(value: object, label: str, maximum: int) -> str:
        text = GitService._optional_text(value, label, maximum)
        if not text:
            raise EditorError(f"{label} is required.")
        return text

    @staticmethod
    def _optional_text(value: object, label: str, maximum: int) -> str:
        if not isinstance(value, str):
            raise EditorError(f"{label} must be text.")
        text = value.strip()
        if len(text) > maximum or "\0" in text:
            raise EditorError(f"{label} is invalid or too long.")
        return text

    def _run(self, command: list[str], *, timeout: int = 30) -> str:
        try:
            result = subprocess.run(
                command,
                cwd=self.repo_root,
                check=False,
                capture_output=True,
                text=True,
                timeout=timeout,
            )
        except (OSError, subprocess.TimeoutExpired) as error:
            raise EditorError(f"Could not run {command[0]}: {error}", status=500) from error
        output = "\n".join(part.strip() for part in (result.stdout, result.stderr) if part.strip())
        if result.returncode != 0:
            raise EditorError(
                f"Command failed: {' '.join(command[:3])}",
                status=500,
                details=output.splitlines()[-30:],
            )
        return result.stdout

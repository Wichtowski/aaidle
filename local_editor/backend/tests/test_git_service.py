from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch


BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from catalog_service import EditorError  # noqa: E402
from git_service import GitService  # noqa: E402


class GitServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.catalogs = Mock()
        self.service = GitService(Path(self.temporary.name), self.catalogs)

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def test_status_accepts_only_the_wichtowski_account(self) -> None:
        with (
            patch.object(self.service, "_run", return_value="main\n"),
            patch.object(self.service, "_changed_paths", return_value=[]),
            patch("git_service.subprocess.run") as run,
        ):
            run.return_value = Mock(returncode=0, stdout="Wichtowski\n")
            status = self.service.status()
            self.assertTrue(status["githubAuthenticated"])
            self.assertFalse(status["canPublish"])
            run.return_value = Mock(returncode=0, stdout="oskar-wichtowski-wttech\n")
            self.assertFalse(self.service.status()["githubAuthenticated"])

        self.assertEqual(
            run.call_args.args[0],
            ["gh", "api", "user", "--hostname", "github.com", "--jq", ".login"],
        )

    def test_publish_rejects_unrelated_changes_before_staging(self) -> None:
        with patch.object(self.service, "_changed_paths", return_value=["src/App.tsx"]):
            with self.assertRaisesRegex(EditorError, "outside data/"):
                self.service.publish("Update data", "Update data", "Body")
        self.catalogs.validate.assert_called_once()

    def test_publish_from_main_runs_the_expected_workflow(self) -> None:
        commands: list[list[str]] = []

        def run(command: list[str], **_: object) -> str:
            commands.append(command)
            if command[:3] == ["git", "branch", "--show-current"]:
                return "main\n"
            if command[:3] == ["gh", "pr", "create"]:
                return "https://github.test/pr/1\n"
            return ""

        with (
            patch.object(self.service, "_changed_paths", return_value=["data/emoji.seed.json"]),
            patch.object(self.service, "_active_github_login", return_value="Wichtowski"),
            patch.object(self.service, "_run", side_effect=run),
        ):
            result = self.service.publish("Update data", "Update data", "Body")
        self.assertEqual(result["url"], "https://github.test/pr/1")
        self.assertIn(["git", "add", "--", "data"], commands)
        self.assertIn(["git", "commit", "-m", "Update data"], commands)
        self.assertTrue(any(command[:3] == ["git", "switch", "-c"] for command in commands))
        self.assertTrue(any(command[:3] == ["git", "push", "--set-upstream"] for command in commands))

    def test_publish_rejects_a_different_active_github_account(self) -> None:
        with (
            patch.object(self.service, "_changed_paths", return_value=["data/emoji.seed.json"]),
            patch.object(
                self.service, "_active_github_login", return_value="oskar-wichtowski-wttech"
            ),
        ):
            with self.assertRaisesRegex(EditorError, 'authenticated as "Wichtowski"'):
                self.service.publish("Update data", "Update data", "Body")

    def test_publish_allows_any_data_path_and_rejects_other_directories(self) -> None:
        self.assertTrue(self.service._only_data_paths(["data/custom/source.json"]))
        self.assertFalse(self.service._only_data_paths(["data/custom/source.json", "README.md"]))


if __name__ == "__main__":
    unittest.main()

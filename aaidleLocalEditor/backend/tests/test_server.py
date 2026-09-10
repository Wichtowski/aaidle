from __future__ import annotations

import json
import sys
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import Mock, patch


BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

import server  # noqa: E402


class ServerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.catalogs = Mock()
        self.git = Mock()
        self.catalogs.navigation.return_value = {"games": [], "difficulties": []}
        self.catalogs.list_items.return_value = []
        self.catalogs.get_item.return_value = {"id": "item"}
        self.catalogs.update_item.return_value = {
            "item": {"id": "item"}, "validation": {"valid": True, "output": "ok"},
        }
        self.catalogs.validate.return_value = {"valid": True, "output": "ok"}
        self.catalogs.merge.return_value = {"game": "classic", "output": "merged"}
        self.git.status.return_value = {
            "branch": "main", "changedPaths": [], "hasChanges": False,
            "canPublish": False,
            "githubAuthenticated": True,
        }
        self.git.publish.return_value = {"branch": "AI/catalog-test", "url": "https://example.test/pr"}
        self.patches = (
            patch.object(server, "catalogs", self.catalogs),
            patch.object(server, "git", self.git),
        )
        for active_patch in self.patches:
            active_patch.start()
        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.EditorHandler)
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()
        self.base = f"http://127.0.0.1:{self.httpd.server_port}"

    def tearDown(self) -> None:
        self.httpd.shutdown()
        self.httpd.server_close()
        self.thread.join(timeout=2)
        for active_patch in reversed(self.patches):
            active_patch.stop()

    def request(self, path: str, *, method: str = "GET", body: object | None = None) -> tuple[int, object]:
        data = None if body is None else json.dumps(body).encode()
        request = urllib.request.Request(
            self.base + path,
            method=method,
            data=data,
            headers={"Content-Type": "application/json"} if data is not None else {},
        )
        try:
            response = urllib.request.urlopen(request, timeout=2)
        except urllib.error.HTTPError as error:
            return error.code, json.loads(error.read())
        return response.status, json.loads(response.read())

    def test_navigation_and_items_routes(self) -> None:
        status, navigation = self.request("/api/navigation")
        self.assertEqual(status, 200)
        self.assertEqual(navigation["difficulties"], [])
        status, result = self.request("/api/items?game=emoji&difficulty=normal")
        self.assertEqual(status, 200)
        self.assertEqual(result, {"items": []})
        self.catalogs.list_items.assert_called_once_with("emoji", None, "normal")

    def test_item_read_and_save_routes(self) -> None:
        status, result = self.request("/api/items/item?game=classic&category=nlp")
        self.assertEqual((status, result), (200, {"item": {"id": "item"}}))
        status, result = self.request(
            "/api/items/item?game=classic&category=nlp",
            method="PUT",
            body={"item": {"id": "item"}},
        )
        self.assertEqual(status, 200)
        self.assertTrue(result["validation"]["valid"])
        self.catalogs.update_item.assert_called_once_with(
            "classic", "item", "nlp", {"id": "item"}
        )

    def test_validate_and_publish_routes(self) -> None:
        status, result = self.request("/api/validate", method="POST", body={})
        self.assertEqual((status, result["valid"]), (200, True))
        status, result = self.request(
            "/api/git/publish",
            method="POST",
            body={"message": "Commit", "title": "Title", "body": "Body"},
        )
        self.assertEqual((status, result["url"]), (200, "https://example.test/pr"))
        self.git.publish.assert_called_once_with("Commit", "Title", "Body")

    def test_merge_route_runs_the_selected_game_merge(self) -> None:
        status, result = self.request("/api/merge", method="POST", body={"game": "classic"})
        self.assertEqual((status, result), (200, {"game": "classic", "output": "merged"}))
        self.catalogs.merge.assert_called_once_with("classic")

    def test_unknown_api_route_returns_json_404(self) -> None:
        status, result = self.request("/api/missing")
        self.assertEqual(status, 404)
        self.assertEqual(result["error"], "API route not found.")


if __name__ == "__main__":
    unittest.main()

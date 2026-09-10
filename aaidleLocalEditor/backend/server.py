from __future__ import annotations

import json
import mimetypes
import sys
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from catalog_service import CatalogService, EditorError
from git_service import GitService


BACKEND_ROOT = Path(__file__).resolve().parent
REPO_ROOT = BACKEND_ROOT.parents[1]
FRONTEND_DIST = BACKEND_ROOT.parent / "frontend" / "dist"
catalogs = CatalogService(REPO_ROOT)
git = GitService(REPO_ROOT, catalogs)


class EditorHandler(BaseHTTPRequestHandler):
    server_version = "aAIdleLocalEditor/1.0"

    def do_GET(self) -> None:  # noqa: N802
        try:
            parsed = urlparse(self.path)
            query = parse_qs(parsed.query)
            if parsed.path == "/api/navigation":
                self._json(HTTPStatus.OK, catalogs.navigation())
            elif parsed.path == "/api/items":
                self._json(
                    HTTPStatus.OK,
                    {
                        "items": catalogs.list_items(
                            self._one(query, "game"),
                            self._optional(query, "category"),
                            self._one(query, "difficulty"),
                        )
                    },
                )
            elif parsed.path.startswith("/api/items/"):
                self._json(
                    HTTPStatus.OK,
                    {
                        "item": catalogs.get_item(
                            self._one(query, "game"),
                            parsed.path.removeprefix("/api/items/"),
                            self._optional(query, "category"),
                        )
                    },
                )
            elif parsed.path == "/api/git/status":
                self._json(HTTPStatus.OK, git.status())
            elif parsed.path.startswith("/api/"):
                raise EditorError("API route not found.", status=404)
            else:
                self._static(parsed.path)
        except EditorError as error:
            self._error(error)
        except Exception as error:  # defensive boundary for a local-only utility
            self._error(EditorError(f"Unexpected server error: {error}", status=500))

    def do_PUT(self) -> None:  # noqa: N802
        try:
            parsed = urlparse(self.path)
            if not parsed.path.startswith("/api/items/"):
                raise EditorError("API route not found.", status=404)
            query = parse_qs(parsed.query)
            result = catalogs.update_item(
                self._one(query, "game"),
                parsed.path.removeprefix("/api/items/"),
                self._optional(query, "category"),
                self._body().get("item"),
            )
            self._json(HTTPStatus.OK, result)
        except EditorError as error:
            self._error(error)
        except Exception as error:
            self._error(EditorError(f"Unexpected server error: {error}", status=500))

    def do_POST(self) -> None:  # noqa: N802
        try:
            parsed = urlparse(self.path)
            body = self._body()
            if parsed.path == "/api/validate":
                self._json(HTTPStatus.OK, catalogs.validate())
            elif parsed.path == "/api/merge":
                self._json(HTTPStatus.OK, catalogs.merge(body.get("game")))
            elif parsed.path == "/api/git/publish":
                self._json(
                    HTTPStatus.OK,
                    git.publish(body.get("message"), body.get("title"), body.get("body", "")),
                )
            else:
                raise EditorError("API route not found.", status=404)
        except EditorError as error:
            self._error(error)
        except Exception as error:
            self._error(EditorError(f"Unexpected server error: {error}", status=500))

    def log_message(self, format: str, *args: object) -> None:
        sys.stderr.write("%s - %s\n" % (self.address_string(), format % args))

    def _body(self) -> dict[str, object]:
        content_type = self.headers.get("Content-Type", "").split(";", 1)[0]
        if content_type != "application/json":
            raise EditorError("Content-Type must be application/json.")
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError as error:
            raise EditorError("Invalid Content-Length.") from error
        if length <= 0 or length > 2_000_000:
            raise EditorError("Request body must be between 1 byte and 2 MB.")
        try:
            body = json.loads(self.rfile.read(length))
        except json.JSONDecodeError as error:
            raise EditorError(f"Invalid JSON: {error.msg}") from error
        if not isinstance(body, dict):
            raise EditorError("Request body must be a JSON object.")
        return body

    def _static(self, path: str) -> None:
        requested = "index.html" if path == "/" else path.lstrip("/")
        candidate = (FRONTEND_DIST / requested).resolve()
        if FRONTEND_DIST.resolve() not in candidate.parents or not candidate.is_file():
            candidate = FRONTEND_DIST / "index.html"
        if not candidate.is_file():
            raise EditorError(
                "Frontend is not built. Run pnpm --dir aaidleLocalEditor/frontend build.", status=503
            )
        content = candidate.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", mimetypes.guess_type(candidate.name)[0] or "application/octet-stream")
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(content)

    @staticmethod
    def _one(query: dict[str, list[str]], name: str) -> str:
        values = query.get(name, [])
        if len(values) != 1 or not values[0]:
            raise EditorError(f"Query parameter {name} is required exactly once.")
        return values[0]

    @staticmethod
    def _optional(query: dict[str, list[str]], name: str) -> str | None:
        values = query.get(name, [])
        if len(values) > 1:
            raise EditorError(f"Query parameter {name} may only appear once.")
        return values[0] if values and values[0] else None

    def _json(self, status: HTTPStatus, value: object) -> None:
        content = json.dumps(value, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(content)

    def _error(self, error: EditorError) -> None:
        self._json(HTTPStatus(error.status), {"error": str(error), "details": error.details})


def main() -> None:
    host = "127.0.0.1"
    port = 8765
    print(f"aAIdle Local Editor: http://{host}:{port}")
    ThreadingHTTPServer((host, port), EditorHandler).serve_forever()


if __name__ == "__main__":
    main()

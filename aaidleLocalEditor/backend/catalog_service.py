from __future__ import annotations

import json
import os
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any


CLASSIC_CATEGORIES = (
    "classical-ml",
    "computer-vision",
    "filters",
    "language-model",
    "nlp",
    "object-detection",
)
DIFFICULTIES = {"normal": 0, "challenge": 1, "hardcore": 2}
GAMES = ("classic", "emoji", "logo", "timeline")
MERGE_COMMANDS = {
    "classic": ["pnpm", "classic-merge-to-one"],
    "timeline": ["pnpm", "timeline-merge-to-one"],
}


class EditorError(Exception):
    def __init__(self, message: str, *, status: int = 400, details: list[str] | None = None):
        super().__init__(message)
        self.status = status
        self.details = details or []


@dataclass(frozen=True)
class ItemLocation:
    path: Path
    identity_field: str


class CatalogService:
    def __init__(self, repo_root: Path):
        self.repo_root = repo_root.resolve()
        self.data_root = self.repo_root / "data"

    def navigation(self) -> dict[str, Any]:
        return {
            "games": [
                {"id": game, "categories": list(CLASSIC_CATEGORIES) if game == "classic" else []}
                for game in GAMES
            ],
            "difficulties": list(DIFFICULTIES),
        }

    def list_items(self, game: str, category: str | None, difficulty: str) -> list[dict[str, Any]]:
        location = self._location(game, category)
        pool = self._pool(difficulty)
        records = self._read_array(location.path)
        return [
            {
                "id": record[location.identity_field],
                "name": self._display_name(game, record),
                "minPool": record.get("minPool", 0),
            }
            for record in records
            if isinstance(record.get("minPool", 0), int) and record.get("minPool", 0) <= pool
        ]

    def get_item(self, game: str, item_id: str, category: str | None) -> dict[str, Any]:
        location = self._location(game, category)
        return self._find(self._read_array(location.path), location.identity_field, item_id)

    def update_item(
        self, game: str, item_id: str, category: str | None, item: object
    ) -> dict[str, Any]:
        if not isinstance(item, dict):
            raise EditorError("Item must be a JSON object.")
        location = self._location(game, category)
        if item.get(location.identity_field) != item_id:
            raise EditorError(f'{location.identity_field} cannot be changed while editing an item.')

        paths = self._transaction_paths(game)
        snapshots = {path: path.read_bytes() for path in paths if path.exists()}
        try:
            if game == "classic":
                self._update_classic(item_id, category, item)
                self._run(["pnpm", "classic-merge-to-one"])
                self._run(["pnpm", "timeline-merge-to-one"])
            else:
                records = self._read_array(location.path)
                index = self._index(records, location.identity_field, item_id)
                records[index] = item
                self._write_array(location.path, records)
            validation = self.validate()
        except Exception:
            for path in paths:
                if path in snapshots:
                    self._atomic_write(path, snapshots[path])
                elif path.exists():
                    path.unlink()
            raise

        return {"item": self.get_item(game, item_id, category), "validation": validation}

    def validate(self) -> dict[str, Any]:
        commands = [
            ["pnpm", "classic-merge-to-one"],
            ["pnpm", "timeline-merge-to-one"],
            ["pnpm", "db:validate-seed"],
        ]
        output: list[str] = []
        for command in commands:
            output.append(self._run(command))
        return {"valid": True, "output": "\n".join(part for part in output if part).strip()}

    def merge(self, game: object) -> dict[str, str]:
        if not isinstance(game, str) or game not in MERGE_COMMANDS:
            raise EditorError("Only classic and timeline catalogs can be merged.")
        output = self._run(MERGE_COMMANDS[game]).strip()
        return {"game": game, "output": output}

    def _update_classic(self, item_id: str, category: str | None, edited: dict[str, Any]) -> None:
        assert category is not None
        selected_path = self._location("classic", category).path
        selected_records = self._read_array(selected_path)
        self._index(selected_records, "id", item_id)
        edited_details = edited.get("categoryDetails")
        if not isinstance(edited_details, dict) or set(edited_details) != {category}:
            raise EditorError(f'categoryDetails must contain exactly the selected category: "{category}".')

        shared = {key: value for key, value in edited.items() if key != "categoryDetails"}
        for classic_category in CLASSIC_CATEGORIES:
            path = self._location("classic", classic_category).path
            records = self._read_array(path)
            matching = [index for index, value in enumerate(records) if value.get("id") == item_id]
            if not matching:
                continue
            index = matching[0]
            category_details = (
                edited_details
                if classic_category == category
                else records[index].get("categoryDetails", {})
            )
            records[index] = {**shared, "categoryDetails": category_details}
            self._write_array(path, records)

    def _location(self, game: str, category: str | None) -> ItemLocation:
        if game not in GAMES:
            raise EditorError(f"Unknown game: {game}")
        if game == "classic":
            if category not in CLASSIC_CATEGORIES:
                raise EditorError("Classic requires a valid category.")
            return ItemLocation(self.data_root / "classic" / f"classic.{category}.seed.json", "id")
        if category:
            raise EditorError(f"{game} does not use categories.")
        if game == "emoji":
            return ItemLocation(self.data_root / "emoji.seed.json", "id")
        if game == "logo":
            return ItemLocation(self.data_root / "logo.seed.json", "answerId")
        return ItemLocation(self.data_root / "timeline" / "events.seed.json", "id")

    @staticmethod
    def _pool(difficulty: str) -> int:
        try:
            return DIFFICULTIES[difficulty]
        except KeyError as error:
            raise EditorError(f"Unknown difficulty: {difficulty}") from error

    @staticmethod
    def _display_name(game: str, record: dict[str, Any]) -> str:
        if game == "logo":
            return str(record.get("assetName") or record.get("answerId"))
        return str(record.get("name") or record.get("id"))

    @staticmethod
    def _read_array(path: Path) -> list[dict[str, Any]]:
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise EditorError(f"Could not read {path}: {error}", status=500) from error
        if not isinstance(value, list) or not all(isinstance(item, dict) for item in value):
            raise EditorError(f"{path} must contain an array of JSON objects.", status=500)
        return value

    @staticmethod
    def _index(records: list[dict[str, Any]], field: str, item_id: str) -> int:
        matches = [index for index, record in enumerate(records) if record.get(field) == item_id]
        if len(matches) != 1:
            raise EditorError(f'Expected exactly one item with {field} "{item_id}".', status=404)
        return matches[0]

    def _find(self, records: list[dict[str, Any]], field: str, item_id: str) -> dict[str, Any]:
        return records[self._index(records, field, item_id)]

    @staticmethod
    def _atomic_write(path: Path, content: bytes) -> None:
        descriptor, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
        try:
            with os.fdopen(descriptor, "wb") as file:
                file.write(content)
                file.flush()
                os.fsync(file.fileno())
            os.replace(temporary, path)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)

    def _write_array(self, path: Path, records: list[dict[str, Any]]) -> None:
        content = (json.dumps(records, indent=2, ensure_ascii=False) + "\n").encode()
        self._atomic_write(path, content)

    def _run(self, command: list[str]) -> str:
        result = subprocess.run(
            command,
            cwd=self.repo_root,
            check=False,
            capture_output=True,
            text=True,
            timeout=180,
        )
        output = "\n".join(part.strip() for part in (result.stdout, result.stderr) if part.strip())
        if result.returncode != 0:
            details = output.splitlines()[-30:]
            raise EditorError(f"Validation command failed: {' '.join(command)}", details=details)
        return output

    def _transaction_paths(self, game: str) -> list[Path]:
        paths = [
            self.data_root / "classic.seed.json",
            self.data_root / "timeline.seed.json",
        ]
        if game == "classic":
            paths.extend(
                self.data_root / "classic" / f"classic.{category}.seed.json"
                for category in CLASSIC_CATEGORIES
            )
        else:
            paths.append(self._location(game, None).path)
        return list(dict.fromkeys(paths))

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from catalog_service import CatalogService, EditorError  # noqa: E402


class CatalogServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        (self.root / "data" / "classic").mkdir(parents=True)
        (self.root / "data" / "timeline").mkdir()
        for category in (
            "classical-ml", "computer-vision", "filters", "language-model", "nlp",
            "object-detection",
        ):
            self.write(f"data/classic/classic.{category}.seed.json", [])
        self.write("data/classic.seed.json", [])
        self.write("data/emoji.seed.json", [
            {"id": "easy", "name": "Easy", "minPool": 0},
            {"id": "hard", "name": "Hard", "minPool": 2},
        ])
        self.write("data/logo.seed.json", [
            {"answerId": "logo", "assetName": "Logo", "minPool": 1},
        ])
        self.write("data/timeline/events.seed.json", [])
        self.write("data/timeline.seed.json", [])
        self.service = CatalogService(self.root)

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def write(self, relative: str, value: object) -> None:
        (self.root / relative).write_text(json.dumps(value) + "\n", encoding="utf-8")

    def read(self, relative: str) -> object:
        return json.loads((self.root / relative).read_text(encoding="utf-8"))

    def test_difficulty_filters_are_cumulative(self) -> None:
        normal = self.service.list_items("emoji", None, "normal")
        hardcore = self.service.list_items("emoji", None, "hardcore")
        self.assertEqual([item["id"] for item in normal], ["easy"])
        self.assertEqual([item["id"] for item in hardcore], ["easy", "hard"])

    def test_classic_update_propagates_shared_fields_and_preserves_category_details(self) -> None:
        language = {
            "id": "shared", "name": "Before", "minPool": 0,
            "categoryDetails": {"language-model": {"architecture": ["transformer"]}},
        }
        nlp = {
            "id": "shared", "name": "Before", "minPool": 0,
            "categoryDetails": {"nlp": {"tasks": ["generation"]}},
        }
        self.write("data/classic/classic.language-model.seed.json", [language])
        self.write("data/classic/classic.nlp.seed.json", [nlp])
        with patch.object(self.service, "_run", return_value="ok"):
            result = self.service.update_item(
                "classic", "shared", "language-model", {**language, "name": "After"}
            )
        self.assertEqual(result["item"]["name"], "After")
        self.assertEqual(self.read("data/classic/classic.nlp.seed.json")[0]["name"], "After")
        self.assertEqual(
            self.read("data/classic/classic.nlp.seed.json")[0]["categoryDetails"],
            nlp["categoryDetails"],
        )

    def test_failed_validation_rolls_back_the_item(self) -> None:
        before = self.read("data/emoji.seed.json")
        with patch.object(self.service, "validate", side_effect=EditorError("invalid")):
            with self.assertRaises(EditorError):
                self.service.update_item(
                    "emoji", "easy", None,
                    {"id": "easy", "name": "Changed", "minPool": 0},
                )
        self.assertEqual(self.read("data/emoji.seed.json"), before)

    def test_identity_cannot_change(self) -> None:
        with self.assertRaisesRegex(EditorError, "cannot be changed"):
            self.service.update_item(
                "logo", "logo", None,
                {"answerId": "different", "assetName": "Logo", "minPool": 1},
            )

    def test_merge_runs_only_the_selected_supported_game_script(self) -> None:
        with patch.object(self.service, "_run", return_value="merged\n") as run:
            self.assertEqual(
                self.service.merge("classic"),
                {"game": "classic", "output": "merged"},
            )
        run.assert_called_once_with(["pnpm", "classic-merge-to-one"])

        with self.assertRaisesRegex(EditorError, "Only classic and timeline"):
            self.service.merge("emoji")


if __name__ == "__main__":
    unittest.main()

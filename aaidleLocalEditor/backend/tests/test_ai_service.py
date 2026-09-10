from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch


BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from ai_service import AiService  # noqa: E402
from catalog_service import EditorError  # noqa: E402


class FakeResponse:
    def __init__(self, value: object):
        self.content = json.dumps(value).encode()

    def __enter__(self) -> "FakeResponse":
        return self

    def __exit__(self, *args: object) -> None:
        return None

    def read(self) -> bytes:
        return self.content


class AiServiceTests(unittest.TestCase):
    def test_requires_api_key(self) -> None:
        with patch.dict("os.environ", {}, clear=True):
            with self.assertRaisesRegex(EditorError, "OPENAI_API_KEY"):
                AiService().analyse("emoji", {"id": "gpt"})

    def test_returns_complete_suggested_item(self) -> None:
        openai_response = {
            "output": [
                {
                    "content": [
                        {
                            "text": json.dumps(
                                {
                                    "summary": "Corrected the display name.",
                                    "suggestedItem": {"id": "gpt", "name": "GPT"},
                                }
                            )
                        }
                    ]
                }
            ],
            "usage": {"input_tokens": 10, "output_tokens": 5},
        }
        with (
            patch.dict("os.environ", {"OPENAI_API_KEY": "secret", "OPENAI_MODEL": "test-model"}),
            patch("urllib.request.urlopen", return_value=FakeResponse(openai_response)) as urlopen,
        ):
            result = AiService().analyse("emoji", {"id": "gpt", "name": "Gpt"})
        self.assertEqual(result["suggestedItem"]["name"], "GPT")
        self.assertEqual(result["model"], "test-model")
        request = urlopen.call_args.args[0]
        self.assertEqual(request.get_header("Authorization"), "Bearer secret")

    def test_rejects_identity_changes(self) -> None:
        openai_response = {
            "output": [
                {
                    "content": [
                        {
                            "text": json.dumps(
                                {
                                    "summary": "Changed identity.",
                                    "suggestedItem": {"answerId": "other"},
                                }
                            )
                        }
                    ]
                }
            ]
        }
        with (
            patch.dict("os.environ", {"OPENAI_API_KEY": "secret"}),
            patch("urllib.request.urlopen", return_value=FakeResponse(openai_response)),
        ):
            with self.assertRaisesRegex(EditorError, "protected answerId"):
                AiService().analyse("logo", {"answerId": "openai"})


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any

from catalog_service import EditorError


OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"
DEFAULT_MODEL = "gpt-4.1-mini"


class AiService:
    """Server-side OpenAI client for reviewing one unsaved catalog item."""

    def analyse(self, game: object, item: object) -> dict[str, Any]:
        if not isinstance(game, str) or game not in {"classic", "emoji", "logo", "timeline"}:
            raise EditorError("A supported game is required for AI analysis.")
        if not isinstance(item, dict):
            raise EditorError("Item must be a JSON object.")

        api_key = os.environ.get("OPENAI_API_KEY", "").strip()
        if not api_key:
            raise EditorError(
                "OPENAI_API_KEY is not set. Add it to the local editor environment first.",
                status=503,
            )

        model = os.environ.get("OPENAI_MODEL", DEFAULT_MODEL).strip() or DEFAULT_MODEL
        prompt = self._prompt(game, item)
        payload = {
            "model": model,
            "input": prompt,
            "text": {"format": {"type": "json_object"}},
        }
        request = urllib.request.Request(
            OPENAI_RESPONSES_URL,
            method="POST",
            data=json.dumps(payload).encode(),
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                response_body = json.loads(response.read())
        except urllib.error.HTTPError as error:
            detail = error.read().decode(errors="replace")
            try:
                detail = json.dumps(json.loads(detail).get("error", detail))
            except (json.JSONDecodeError, AttributeError):
                pass
            raise EditorError(f"OpenAI response ({error.code}): {detail}", status=502) from error
        except (OSError, json.JSONDecodeError) as error:
            raise EditorError(f"Could not read the OpenAI response: {error}", status=502) from error

        text = self._output_text(response_body)
        try:
            result = json.loads(text)
        except json.JSONDecodeError as error:
            raise EditorError(f"OpenAI returned invalid structured JSON: {error.msg}", status=502) from error
        if not isinstance(result, dict):
            raise EditorError("OpenAI analysis must be a JSON object.", status=502)

        summary = result.get("summary")
        suggested = result.get("suggestedItem")
        if not isinstance(summary, str) or not summary.strip() or not isinstance(suggested, dict):
            raise EditorError(
                "OpenAI analysis must include a summary and suggestedItem object.", status=502
            )
        identity_field = "answerId" if game == "logo" else "id"
        if suggested.get(identity_field) != item.get(identity_field):
            raise EditorError(
                f"OpenAI suggested changing the protected {identity_field}; the suggestion was rejected.",
                status=502,
            )
        return {
            "summary": summary.strip(),
            "suggestedItem": suggested,
            "model": model,
            "usage": response_body.get("usage", {}),
        }

    @staticmethod
    def _output_text(response: object) -> str:
        if not isinstance(response, dict):
            raise EditorError("OpenAI returned an invalid response.", status=502)
        for output in response.get("output", []):
            if not isinstance(output, dict):
                continue
            for content in output.get("content", []):
                if isinstance(content, dict) and isinstance(content.get("text"), str):
                    return content["text"]
        raise EditorError("OpenAI returned no analysis text.", status=502)

    @staticmethod
    def _prompt(game: str, item: dict[str, Any]) -> str:
        return (
            "You are a meticulous reviewer of one record in the aAIdle game catalog. "
            f"Review this {game} item for factual accuracy, internal consistency, useful clues, "
            "valid paths and likely schema mistakes. Preserve its identity field and do not remove "
            "valid information. Do not invent certainty. Return JSON only with exactly two keys: "
            '"summary" (a concise explanation of findings) and "suggestedItem" (the complete corrected '
            "JSON object, or an object identical to the input when no fix is needed). Keep JSON value "
            "types unchanged unless correcting an obvious schema error.\n\nItem:\n"
            + json.dumps(item, indent=2, ensure_ascii=False)
        )

# Seed fact-checker TUI

Standalone Rust tool for reviewing every top-level field in every `*.seed.json` below the repository root. It is intentionally a separate crate, so its dependencies do not enter the backend release binary.

Run from the repository root:

```bash
OPENAI_API_KEY='your-key' cargo run --manifest-path scripts/tui/Cargo.toml
```

Optional settings:

```bash
OPENAI_MODEL='gpt-5.6-luna'
OPENAI_INPUT_USD_PER_MILLION=1.25
OPENAI_OUTPUT_USD_PER_MILLION=10
```

The default model is the requested name and can be overridden because model availability and pricing can vary. The tool pauses after three complete entries, reports batch and projected total cost, and continues only on Enter. `a` applies a recommendation only after parsing the candidate and validating the resulting seed root as a JSON array. Writes use a temporary file and rename.

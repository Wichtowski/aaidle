# aAIdle Local Editor

A local-only catalog editor for the JSON sources under `../data`.

## Run

From the repository root:

```bash
make local-editor
```

Open <http://127.0.0.1:8765>. The command builds the frontend and starts the Python backend.
The server deliberately binds only to loopback and has no authentication because it is not a
deployable service. Python and the local virtual environment are managed by
[uv](https://docs.astral.sh/uv/).

For frontend development, start
`uv run --project aaidleLocalEditor python aaidleLocalEditor/backend/server.py`, then run
`pnpm exec vite --config aaidleLocalEditor/frontend/vite.config.ts` in another terminal and open
<http://127.0.0.1:5174>.

## Workflow

1. Pick a game, Classic category (Classic only), and difficulty.
2. Select one item and edit the generated fields. Nested objects and lists are rendered recursively;
   use their controls to add or remove fields and list items.
3. Use **Save & verify**. The backend writes atomically, rebuilds generated catalogs, and runs
   `pnpm db:validate-seed`. Any failure restores all files touched by that save.
4. For Classic or Timeline, use **Merge Classic** or **Merge Timeline** to explicitly rebuild the
   corresponding combined seed file.
5. Enter the commit and PR details and use **Create branch, commit & PR**.

Difficulty filters are cumulative: Normal shows `minPool <= 0`, Challenge `minPool <= 1`, and
Hardcore `minPool <= 2`. Timeline editing intentionally lists event source records only; model
timeline records are generated from Classic and should be edited there.

The publish action validates all data and proceeds only when every changed path is under `data/`.
It creates an `AI/catalog-<UTC timestamp>` branch when on `main`, stages only `data/`, commits,
pushes to `origin`, and opens a PR against `main` with `gh`.

The app never reads or returns GitHub credentials. Authenticate first with `gh auth login`.

Run tests with:

```bash
uv run --project aaidleLocalEditor python -m unittest discover -s aaidleLocalEditor/backend/tests -v
```

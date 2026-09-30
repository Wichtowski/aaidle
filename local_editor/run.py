from __future__ import annotations

import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent


def main() -> None:
    subprocess.run(
        [
            "pnpm", "exec", "tsc", "-p", "local_editor/frontend/tsconfig.json",
        ],
        cwd=ROOT,
        check=True,
    )
    subprocess.run(
        [
            "pnpm", "exec", "vite", "build", "--config",
            "local_editor/frontend/vite.config.ts",
        ],
        cwd=ROOT,
        check=True,
    )
    subprocess.run([sys.executable, "local_editor/backend/server.py"], cwd=ROOT, check=True)


if __name__ == "__main__":
    main()

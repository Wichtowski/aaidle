from __future__ import annotations

import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent


def main() -> None:
    subprocess.run(
        [
            "pnpm", "exec", "tsc", "-p", "aaidleLocalEditor/frontend/tsconfig.json",
        ],
        cwd=ROOT,
        check=True,
    )
    subprocess.run(
        [
            "pnpm", "exec", "vite", "build", "--config",
            "aaidleLocalEditor/frontend/vite.config.ts",
        ],
        cwd=ROOT,
        check=True,
    )
    subprocess.run([sys.executable, "aaidleLocalEditor/backend/server.py"], cwd=ROOT, check=True)


if __name__ == "__main__":
    main()

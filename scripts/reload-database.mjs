import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const databasePath = resolve(process.env.DATABASE_PATH ?? "./data/aaidle.db");
const databaseFiles = [databasePath, `${databasePath}-wal`, `${databasePath}-shm`];

for (const file of databaseFiles) {
  if (existsSync(file)) rmSync(file);
}

for (const script of ["scripts/migrate.mjs", "scripts/seed.mjs"]) {
  const result = spawnSync(process.execPath, [script], {
    env: process.env,
    stdio: "inherit",
  });

  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(`Reloaded database: ${databasePath}`);

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const originalDatabasePath = process.env.DATABASE_PATH;
const temporaryDirectories: string[] = [];

afterEach(() => {
  if (originalDatabasePath === undefined) delete process.env.DATABASE_PATH;
  else process.env.DATABASE_PATH = originalDatabasePath;
  vi.resetModules();
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, { force: true, recursive: true });
});

describe("authentication rate limits", () => {
  it("atomically admits no more than the configured concurrent limit", async () => {
    const directory = mkdtempSync(join(tmpdir(), "aaidle-rate-limit-"));
    temporaryDirectories.push(directory);
    process.env.DATABASE_PATH = join(directory, "auth.db");

    const { database } = await import("../../lib/db/client");
    await database()
      .prepare(
        "CREATE TABLE auth_rate_limits (scope TEXT NOT NULL, subject_hash TEXT NOT NULL, window_started_at BIGINT NOT NULL, count INTEGER NOT NULL, PRIMARY KEY(scope, subject_hash))",
      )
      .run();
    const { consumeRateLimit } = await import("../../lib/auth/auth-service");

    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        consumeRateLimit({
          scope: "password-login",
          subjectHash: "subject",
          limit: 3,
          windowMs: 60_000,
        }),
      ),
    );

    expect(results.filter(Boolean)).toHaveLength(3);
  });
});

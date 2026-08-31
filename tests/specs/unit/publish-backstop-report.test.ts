import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { publishBackstopReport } from "../../../.github/scripts/publish-backstop-report.mjs";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function createReportFixture({ includeTestBitmap }: { includeTestBitmap: boolean }) {
  const directory = await mkdtemp(join(tmpdir(), "aaidle-backstop-report-"));
  temporaryDirectories.push(directory);
  const source = join(directory, "source");
  const destination = join(directory, "destination");
  const testBitmap = "run/scenario.png";
  await Promise.all([
    mkdir(join(source, "html_report"), { recursive: true }),
    mkdir(join(source, "bitmaps_reference"), { recursive: true }),
    mkdir(join(source, "bitmaps_test", "run"), { recursive: true }),
  ]);
  await writeFile(
    join(source, "html_report", "config.js"),
    `report({"reference":"../bitmaps_reference/scenario.png","test":"../bitmaps_test/${testBitmap}"});`,
  );
  if (includeTestBitmap) await writeFile(join(source, "bitmaps_test", testBitmap), "test");
  return { destination, source };
}

describe("Backstop report publishing", () => {
  it("publishes reports whose missing reference bitmap represents a failed scenario", async () => {
    const { destination, source } = await createReportFixture({ includeTestBitmap: true });

    await publishBackstopReport(source, destination);

    await expect(
      readFile(join(destination, "bitmaps_test", "run", "scenario.png"), "utf8"),
    ).resolves.toBe("test");
    await expect(readFile(join(destination, "config.js"), "utf8")).resolves.toContain(
      '"./bitmaps_reference/scenario.png"',
    );
  });

  it("rejects reports whose test bitmap artifact is incomplete", async () => {
    const { destination, source } = await createReportFixture({ includeTestBitmap: false });

    await expect(publishBackstopReport(source, destination)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});

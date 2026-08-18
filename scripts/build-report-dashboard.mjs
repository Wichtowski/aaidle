import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const siteDirectory = process.argv[2] ?? "tests/reports/site";
const runsDirectory = join(siteDirectory, "runs");
let runNames = [];
try {
  runNames = await readdir(runsDirectory);
} catch {}
const runs = (await Promise.all(runNames.map(async (name) => {
  try { return JSON.parse(await readFile(join(runsDirectory, name, "metadata.json"), "utf8")); } catch { return null; }
}))).filter(Boolean).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
for (const staleRun of runs.slice(8)) await rm(join(runsDirectory, staleRun.id), { recursive: true, force: true });
const visibleRuns = runs.slice(0, 8);
const links = (run) => ["e2e", "api", "accessibility", "performance"].filter((domain) => run.domains.includes(domain)).map((domain) => `<a href="runs/${run.id}/${domain}/index.html">${domain}</a>`).join(" ");
await writeFile(join(siteDirectory, "index.html"), `<!doctype html><html lang="en"><meta charset="utf-8"><title>aAIdle quality reports</title><style>body{font:16px system-ui;margin:2rem;color:#17212b;max-width:960px}article{border-top:1px solid #ccd6dd;padding:1rem 0}a{margin-right:1rem;color:#006e7f}</style><main><h1>aAIdle quality reports</h1><p>Latest eight production report runs.</p>${visibleRuns.map((run) => `<article><strong>${run.releaseTag}</strong><br><small>${run.createdAt}</small><p>${links(run)}</p></article>`).join("") || "<p>No reports published yet.</p>"}</main></html>`);
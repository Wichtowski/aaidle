import { cp, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { execFileSync, spawnSync } from "node:child_process";
import { resolve } from "node:path";

const releaseTag = process.env.RELEASE_TAG;
const repository = process.env.GITHUB_REPOSITORY;
const token = process.env.GH_TOKEN;
const customDomain = process.env.PAGES_CUSTOM_DOMAIN ?? "reports.aaidle.com";

if (!releaseTag || !/^v\d+\.\d+\.\d+$/.test(releaseTag)) throw new Error("RELEASE_TAG must be a SemVer tag.");
if (!repository || !token) throw new Error("GITHUB_REPOSITORY and GH_TOKEN are required.");

const site = resolve("site");
const reportDirectory = resolve("report-site");
const repositoryUrl = `https://x-access-token:${token}@github.com/${repository}.git`;
const runGit = (args, options = {}) => execFileSync("git", args, { stdio: "inherit", ...options });

const branchExists = spawnSync("git", ["ls-remote", "--exit-code", "--heads", repositoryUrl, "gh-pages"], { stdio: "ignore" }).status === 0;
if (branchExists) {
  runGit(["clone", "--depth", "1", "--branch", "gh-pages", repositoryUrl, site]);
} else {
  runGit(["init", "--initial-branch=gh-pages", site]);
  runGit(["-C", site, "remote", "add", "origin", repositoryUrl]);
}

const releaseDirectory = resolve(site, releaseTag);
await rm(releaseDirectory, { recursive: true, force: true });
await mkdir(releaseDirectory, { recursive: true });
await cp(resolve(reportDirectory, "allure"), resolve(releaseDirectory, "allure"), { recursive: true });
await cp(resolve("reports/accessibility"), resolve(releaseDirectory, "accessibility"), { recursive: true });
await cp(resolve("reports/performance"), resolve(releaseDirectory, "performance"), { recursive: true });

const releases = (await readdir(site, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && /^v\d+\.\d+\.\d+$/.test(entry.name))
  .map(async (entry) => ({ name: entry.name, modified: (await stat(resolve(site, entry.name))).mtimeMs }));
const sortedReleases = (await Promise.all(releases)).sort((a, b) => b.modified - a.modified);
await Promise.all(sortedReleases.slice(7).map(({ name }) => rm(resolve(site, name), { recursive: true, force: true })));

const retainedReleases = sortedReleases.slice(0, 7).map(({ name }) => name);
const links = retainedReleases.map((release) => `    <li><a href="${release}/">${release}</a></li>`).join("\n");
await writeFile(resolve(site, "index.html"), `<!doctype html>
<html lang="en"><meta charset="utf-8"><title>Production quality reports</title>
<main><h1>Production quality reports</h1><p>The seven most recent production releases.</p><ul>
${links}
</ul></main></html>
`);
await writeFile(resolve(site, ".nojekyll"), "");
await writeFile(resolve(site, "CNAME"), `${customDomain}\n`);

runGit(["-C", site, "config", "user.name", "github-actions[bot]"]);
runGit(["-C", site, "config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"]);
runGit(["-C", site, "add", "--all"]);
if (spawnSync("git", ["-C", site, "diff", "--cached", "--quiet"]).status !== 0) {
  runGit(["-C", site, "commit", "-m", `Publish production reports for ${releaseTag}`]);
  runGit(["-C", site, "push", "origin", "HEAD:gh-pages"]);
}

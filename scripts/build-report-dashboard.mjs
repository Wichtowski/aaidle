import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

const siteDirectory = process.argv[2] ?? "site";
const releasePattern = /^v\d+\.\d+\.\d+$/;
const domains = ["e2e", "api", "accessibility", "performance"];

const releases = await Promise.all((await readdir(siteDirectory, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && releasePattern.test(entry.name))
  .map(async ({ name }) => {
    const directory = join(siteDirectory, name);
    const entries = new Set(await readdir(directory));
    let performanceScore = null;
    try {
      const lighthouse = JSON.parse(await readFile(join(directory, "performance", "metrics.json"), "utf8"));
      performanceScore = Math.round((lighthouse.categories?.performance?.score ?? 0) * 100);
    } catch { /* empty */ }
    return { name, domains: domains.filter((domain) => entries.has(domain)), performanceScore, modified: (await stat(directory)).mtimeMs };
  }));
const chronological = releases.sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }));
const newestFirst = [...chronological].sort((left, right) => right.modified - left.modified);

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const performancePoints = chronological.filter(({ performanceScore }) => performanceScore !== null);
const chart = performancePoints.length === 0
  ? "<p>No Lighthouse metrics are available yet.</p>"
  : (() => {
      const width = 760;
      const height = 260;
      const padding = { top: 24, right: 24, bottom: 48, left: 42 };
      const plotWidth = width - padding.left - padding.right;
      const plotHeight = height - padding.top - padding.bottom;
      const point = ({ performanceScore }, index) => ({
        x: padding.left + (performancePoints.length === 1 ? plotWidth / 2 : (index * plotWidth) / (performancePoints.length - 1)),
        y: padding.top + ((100 - performanceScore) * plotHeight) / 100,
      });
      const points = performancePoints.map(point);
      const grid = [0, 25, 50, 75, 100].map((score) => {
        const y = padding.top + ((100 - score) * plotHeight) / 100;
        return `<line x1="${padding.left}" x2="${width - padding.right}" y1="${y}" y2="${y}"/><text x="4" y="${y + 4}">${score}</text>`;
      }).join("");
      const labels = performancePoints.map(({ name }, index) => `<text x="${points[index].x}" y="${height - 16}" text-anchor="middle">${escapeHtml(name)}</text>`).join("");
      const circles = performancePoints.map(({ name, performanceScore }, index) => `<circle cx="${points[index].x}" cy="${points[index].y}" r="4"><title>${escapeHtml(name)}: ${performanceScore}</title></circle>`).join("");
      return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Lighthouse performance score by release"><g class="grid">${grid}</g><polyline points="${points.map(({ x, y }) => `${x},${y}`).join(" ")}"/>${circles}<g class="labels">${labels}</g></svg>`;
    })();
const releaseList = newestFirst.map(({ name, domains: availableDomains, performanceScore }) => `<article><h2>${escapeHtml(name)}</h2><p>${availableDomains.map((domain) => `<a href="${name}/${domain}/">${domain.toUpperCase()}</a>`).join(" ")}</p>${performanceScore === null ? "" : `<p>Performance: <strong>${performanceScore}</strong>/100</p>`}</article>`).join("");

await writeFile(join(siteDirectory, "index.html"), `<!doctype html>
<html lang="en"><meta charset="utf-8"><title>aAIdle production quality reports</title>
<style>body{font:16px system-ui;margin:2rem;color:#17212b;max-width:960px}a{color:#006e7f;margin-right:1rem}article{border-top:1px solid #ccd6dd;padding:1rem 0}h2{margin:.1rem 0;font-size:1.2rem}svg{display:block;width:100%;background:#f7fafb;border:1px solid #ccd6dd}.grid line{stroke:#ccd6dd}.grid text,.labels text{font-size:11px;fill:#52616b}polyline{fill:none;stroke:#006e7f;stroke-width:3}circle{fill:#006e7f}</style>
<main><h1>aAIdle production quality reports</h1><p>Latest seven production releases.</p><section><h2>Performance progression</h2>${chart}</section><section><h2>Release reports</h2>${releaseList || "<p>No reports published yet.</p>"}</section></main></html>
`);
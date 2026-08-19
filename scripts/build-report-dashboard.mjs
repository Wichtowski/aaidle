import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

const siteDirectory = process.argv[2] ?? "site";
const releasePattern = /^v\d+\.\d+\.\d+$/;
const domains = ["e2e", "api", "accessibility", "performance"];
const lighthouseCategories = [
  ["performance", "Performance"],
  ["accessibility", "Accessibility"],
  ["best-practices", "Best practices"],
  ["seo", "SEO"],
];

const releases = await Promise.all((await readdir(siteDirectory, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && releasePattern.test(entry.name))
  .map(async ({ name }) => {
    const directory = join(siteDirectory, name);
    const entries = new Set(await readdir(directory));
    let scores = {};
    try {
      const lighthouse = JSON.parse(await readFile(join(directory, "performance", "metrics.json"), "utf8"));
      scores = Object.fromEntries(lighthouseCategories
        .map(([key]) => [key, lighthouse.categories?.[key]?.score])
        .filter(([, score]) => typeof score === "number")
        .map(([key, score]) => [key, Math.round(score * 100)]));
    } catch { /* empty */ }
    return {
      name,
      domains: domains.filter((domain) => entries.has(domain)),
      performanceScore: scores.performance ?? null,
      scores,
      modified: (await stat(directory)).mtimeMs,
    };
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
const latestRelease = newestFirst[0];
const scoreCards = latestRelease
  ? lighthouseCategories
    .filter(([key]) => latestRelease.scores[key] !== undefined)
    .map(([key, label]) => `<div class="score-card"><span>${label}</span><strong>${latestRelease.scores[key]}</strong><small>/ 100</small></div>`)
    .join("")
  : "";
const releaseList = newestFirst.map(({ name, domains: availableDomains, scores }) => {
  const scoreList = lighthouseCategories
    .filter(([key]) => scores[key] !== undefined)
    .map(([key, label]) => `<span class="metric"><b>${scores[key]}</b> ${label}</span>`)
    .join("");
  const reportLinks = availableDomains
    .map((domain) => `<a class="report-link" href="${name}/${domain}/">${domain.toUpperCase()}</a>`)
    .join("");
  return `<article class="release-card"><div><p class="eyebrow">Production release</p><h3>${escapeHtml(name)}</h3></div><div class="metrics">${scoreList || "<span class=\"metric\">No Lighthouse data</span>"}</div><nav aria-label="Reports for ${escapeHtml(name)}">${reportLinks}</nav></article>`;
}).join("");

await writeFile(join(siteDirectory, "index.html"), `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>aAIdle production quality reports</title>
<style>
  :root{color-scheme:light;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#e8f0f7;background:#09131f}
  *{box-sizing:border-box} body{margin:0;background:radial-gradient(circle at top left,#163c52 0,transparent 32rem),#09131f} main{width:min(1120px,calc(100% - 2rem));margin:auto;padding:4rem 0 5rem} .hero{display:flex;justify-content:space-between;gap:2rem;align-items:end;margin-bottom:2rem}.eyebrow{text-transform:uppercase;letter-spacing:.12em;font-size:.72rem;font-weight:700;color:#70d5c1;margin:0 0 .7rem}h1,h2,h3,p{margin-top:0}h1{font-size:clamp(2.4rem,7vw,4.5rem);letter-spacing:-.06em;line-height:.95;margin-bottom:1rem;max-width:12ch}h2{font-size:1.25rem;letter-spacing:-.02em;margin-bottom:1.25rem}.intro{color:#aabcca;max-width:38rem;line-height:1.6;margin:0}.release-tag{border:1px solid #335165;background:#102535;color:#d8e7f0;padding:.65rem .85rem;border-radius:999px;white-space:nowrap;font-size:.85rem}.panel{background:rgba(16,34,48,.88);border:1px solid #294558;border-radius:1rem;padding:1.5rem;box-shadow:0 18px 50px rgba(0,0,0,.18)}.score-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:#294558;border:1px solid #294558;border-radius:.75rem;overflow:hidden;margin-bottom:1.5rem}.score-card{background:#102230;padding:1rem}.score-card span,.score-card small{display:block;color:#9cb1c0;font-size:.78rem}.score-card strong{font-size:2rem;line-height:1.15;letter-spacing:-.05em;color:#f5fbff}.layout{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(280px,.65fr);gap:1.25rem;margin-bottom:1.25rem}svg{display:block;width:100%;height:auto;background:#0c1c29;border:1px solid #294558;border-radius:.75rem;padding:.5rem}.grid line{stroke:#294558}.grid text,.labels text{font-size:11px;fill:#9cb1c0}polyline{fill:none;stroke:#70d5c1;stroke-width:3}circle{fill:#d9f99d;stroke:#0c1c29;stroke-width:2}.chart-note{color:#9cb1c0;font-size:.86rem;margin:.9rem 0 0}.release-list{display:grid;gap:.75rem}.release-card{display:grid;grid-template-columns:1fr auto;gap:1rem;align-items:center;padding:1.1rem 0;border-top:1px solid #294558}.release-card:first-child{border-top:0;padding-top:0}.release-card h3{font-size:1.15rem;margin:0}.metrics{display:flex;gap:.45rem;flex-wrap:wrap;justify-content:flex-end}.metric{font-size:.75rem;color:#aabcca;background:#0c1c29;border:1px solid #294558;padding:.35rem .5rem;border-radius:.4rem}.metric b{color:#d9f99d}nav{grid-column:1/-1;display:flex;gap:.5rem;flex-wrap:wrap}.report-link{color:#b9f7e8;text-decoration:none;font-size:.75rem;font-weight:700;letter-spacing:.06em;border:1px solid #326272;padding:.45rem .6rem;border-radius:.35rem}.report-link:hover,.report-link:focus-visible{color:#09131f;background:#70d5c1;border-color:#70d5c1}@media (max-width:700px){main{padding-top:2rem}.hero,.layout{display:block}.release-tag{display:inline-block;margin-top:1.25rem}.layout>.panel{margin-bottom:1.25rem}.score-grid{grid-template-columns:repeat(2,1fr)}.release-card{display:block}.metrics{justify-content:flex-start;margin:1rem 0}}
</style>
<main>
  <header class="hero"><div><p class="eyebrow">aAIdle · production quality</p><h1>Release reports, at a glance.</h1><p class="intro">Lighthouse, accessibility, API, and end-to-end reports from the seven latest production releases.</p></div>${latestRelease ? `<span class="release-tag">Latest: ${escapeHtml(latestRelease.name)}</span>` : ""}</header>
  ${scoreCards ? `<section class="panel" aria-labelledby="latest-scores"><h2 id="latest-scores">Latest Lighthouse scores</h2><div class="score-grid">${scoreCards}</div></section>` : ""}
  <div class="layout"><section class="panel" aria-labelledby="performance-progression"><h2 id="performance-progression">Performance progression</h2>${chart}<p class="chart-note">Lighthouse performance score by production release.</p></section><section class="panel" aria-labelledby="about-reports"><h2 id="about-reports">What’s included</h2><p class="intro">Each release links to its full Lighthouse audit alongside its browser, API, and accessibility test reports.</p></section></div>
  <section class="panel" aria-labelledby="release-reports"><h2 id="release-reports">Release reports</h2><div class="release-list">${releaseList || "<p class=\"intro\">No reports have been published yet.</p>"}</div></section>
</main>
</html>
`);
import { mkdir, readFile, writeFile } from "node:fs/promises";

const inputPath = process.argv[2] ?? "tests/reports/accessibility/results.json";
const outputPath = process.argv[3] ?? "tests/reports/accessibility/index.html";
let report;
let reportUnavailable = false;

try {
  report = JSON.parse(await readFile(inputPath, "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") {
    throw error;
  }

  reportUnavailable = true;
  report = { generatedAt: new Date().toISOString(), reports: [] };
}

const violations = report.reports.flatMap(({ route, violations: routeViolations }) =>
  routeViolations.map((violation) => ({ route, ...violation })),
);
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const rows = reportUnavailable
  ? "<p class=\"warning\">Accessibility results were not generated. Check the test step for the failure details.</p>"
  : violations.length === 0
  ? "<p class=\"pass\">No accessibility violations found.</p>"
  : `<table><thead><tr><th>Route</th><th>Impact</th><th>Rule</th><th>Description</th></tr></thead><tbody>${violations.map((violation) => `<tr><td>${escapeHtml(violation.route)}</td><td>${escapeHtml(violation.impact ?? "unknown")}</td><td>${escapeHtml(violation.id)}</td><td>${escapeHtml(violation.help)}</td></tr>`).join("")}</tbody></table>`;

await mkdir(new URL(".", `file://${process.cwd()}/${outputPath}`).pathname, { recursive: true });
await writeFile(outputPath, `<!doctype html><html lang="en"><meta charset="utf-8"><title>Accessibility report</title><style>body{font:16px system-ui;margin:2rem;color:#17212b}table{border-collapse:collapse;width:100%}th,td{padding:.7rem;border:1px solid #ccd6dd;text-align:left}.pass{color:#126b38;font-weight:700}.warning{color:#8a4b00;font-weight:700}</style><main><h1>Accessibility report</h1><p>Generated ${escapeHtml(report.generatedAt)}</p>${reportUnavailable ? "" : `<p>${violations.length} violation(s)</p>`}${rows}</main></html>`);

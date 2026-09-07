import { readFile } from "node:fs/promises";

const minimums = {
  lines: 95,
  functions: 90,
  regions: 90,
  branches: 90,
};
const metrics = Object.keys(minimums);
const [reportPath] = process.argv.slice(2);
if (!reportPath) {
  throw new Error("Usage: check-rust-coverage.mjs <coverage-summary.json>");
}

const report = JSON.parse(await readFile(reportPath, "utf8"));
const totals = report.data?.[0]?.totals;
if (!totals) throw new Error("LLVM coverage totals are unavailable.");

const failures = [];
for (const metric of metrics) {
  const coverage = totals[metric]?.percent;
  if (typeof coverage !== "number") throw new Error(`LLVM ${metric} coverage is unavailable.`);
  const minimum = minimums[metric];
  console.log(`${metric}: ${coverage.toFixed(2)}% (minimum ${minimum}%)`);
  if (coverage < minimum) {
    failures.push(`${metric} ${coverage.toFixed(2)}% (minimum ${minimum}%)`);
  }
}

if (failures.length > 0) {
  throw new Error(`Rust coverage thresholds were not met: ${failures.join(", ")}`);
}

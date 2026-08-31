import { readFile } from "node:fs/promises";

const [reportPath, minimumValue = "95"] = process.argv.slice(2);
const minimum = Number(minimumValue);
if (!reportPath || !Number.isFinite(minimum)) {
  throw new Error("Usage: check-rust-coverage.mjs <coverage-summary.json> [minimum]");
}

const report = JSON.parse(await readFile(reportPath, "utf8"));
const totals = report.data?.[0]?.totals;
if (!totals) throw new Error("LLVM coverage totals are unavailable.");

const metrics = ["lines", "functions", "regions", "branches"];
const failures = [];
for (const metric of metrics) {
  const coverage = totals[metric]?.percent;
  if (typeof coverage !== "number") throw new Error(`LLVM ${metric} coverage is unavailable.`);
  console.log(`${metric}: ${coverage.toFixed(2)}%`);
  if (coverage < minimum) failures.push(`${metric} ${coverage.toFixed(2)}%`);
}

if (failures.length > 0) {
  throw new Error(`Rust coverage must be at least ${minimum}%: ${failures.join(", ")}`);
}

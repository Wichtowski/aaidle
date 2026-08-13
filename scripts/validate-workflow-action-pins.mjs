import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const workflowsDirectory = new URL("../.github/workflows/", import.meta.url);
const fullCommitSha = /^[0-9a-f]{40}$/;
const usesExpression = /^\s*(?:-\s+)?uses:\s*([^\s#]+)(?:\s+#.*)?$/;
const violations = [];

for (const file of readdirSync(workflowsDirectory)) {
  if (!file.endsWith(".yml") && !file.endsWith(".yaml")) continue;

  const path = join(workflowsDirectory.pathname, file);
  const lines = readFileSync(path, "utf8").split("\n");
  for (const [index, line] of lines.entries()) {
    const match = line.match(usesExpression);
    if (!match) continue;

    const reference = match[1];
    if (reference.startsWith("./")) continue;

    const separator = reference.lastIndexOf("@");
    const action = reference.slice(0, separator);
    const revision = reference.slice(separator + 1);
    if (separator <= 0 || !fullCommitSha.test(revision)) {
      violations.push(`${file}:${index + 1} uses an unpinned action: ${reference}`);
      continue;
    }

    if (action.split("/").length !== 2) {
      violations.push(`${file}:${index + 1} has an invalid action reference: ${reference}`);
    }
  }
}

if (violations.length > 0) {
  console.error(violations.join("\n"));
  process.exit(1);
}

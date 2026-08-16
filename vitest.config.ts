import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    exclude: [
      "tests/unit/aaidle-game-agent.test.ts",
      "tests/unit/account-deletion-verify.test.ts",
      "tests/unit/auth-crypto.test.ts",
      "tests/unit/auth-email.test.ts",
      "tests/unit/auth-http.test.ts",
      "tests/unit/auth-rate-limit.test.ts",
      "tests/unit/github-issue-reporter.test.ts",
      "tests/unit/model-pools.test.ts",
      "tests/unit/oauth-state.test.ts",
      "tests/unit/public-challenge.test.ts",
      "tests/unit/trajectory-access.test.ts"
    ],
    environment: "node",
    setupFiles: ["./tests/setup.ts"]
  },
});

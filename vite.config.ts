import { createLogger, defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

const logger = createLogger();
const logError = logger.error.bind(logger);

logger.error = (message, options) => {
  if (message.includes("http proxy error:")) {
    const path = message.match(/http proxy error: ([^\n]+)/)?.[1] ?? "/api";
    logger.info(`[api] Backend unavailable for ${path.replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, "")}`);
    return;
  }

  logError(message, options);
};

export default defineConfig({
  customLogger: logger,
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@app": fileURLToPath(new URL("./src/app", import.meta.url)),
      "@components": fileURLToPath(new URL("./src/app/components", import.meta.url)),
      "@lib": fileURLToPath(new URL("./src/lib", import.meta.url)),
      "@data": fileURLToPath(new URL("./data", import.meta.url)),
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
});

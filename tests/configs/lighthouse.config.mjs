const cloudflareE2EToken = process.env.AAIDLE_CF_E2E_TOKEN;

export default {
  extends: "lighthouse:default",
  settings: {
    extraHeaders: cloudflareE2EToken ? { "x-aaidle-cf-e2e-token": cloudflareE2EToken } : undefined,
  },
};

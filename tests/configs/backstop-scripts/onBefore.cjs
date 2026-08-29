module.exports = async (_page, _scenario, _viewport, _isReference, browserContext) => {
  const token = process.env.AAIDLE_CF_E2E_TOKEN;
  if (token) {
    await browserContext.setExtraHTTPHeaders({
      "x-aaidle-cf-e2e-token": token,
    });
  }
};

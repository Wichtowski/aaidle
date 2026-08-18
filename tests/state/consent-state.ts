export function consentState(baseURL: string) {
  return {
    cookies: [
      {
        name: "aaidle_cookie_consent",
        value: "essential",
        domain: new URL(baseURL).hostname,
        path: "/",
        expires: -1,
        httpOnly: false,
        secure: baseURL.startsWith("https://"),
        sameSite: "Lax" as const,
      },
    ],
    origins: [],
  };
}
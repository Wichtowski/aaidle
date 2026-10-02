const returnPathKey = "aaidle:return-path";

// Only an in-app path may be used as a return target
const isAppPath = (value: string) => /^\/(?![/\\])/.test(value);

/** Remembers the page that required an account, so signing in can return to it */
export function rememberReturnPath(path: string) {
  if (typeof window === "undefined" || !isAppPath(path)) return;
  try {
    window.sessionStorage.setItem(returnPathKey, path);
  } catch {
    // Without session storage the player simply lands on the default page
  }
}

/** Returns the remembered page once, then forgets it */
export function takeReturnPath(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const path = window.sessionStorage.getItem(returnPathKey);
    window.sessionStorage.removeItem(returnPathKey);
    return path && isAppPath(path) ? path : null;
  } catch {
    return null;
  }
}

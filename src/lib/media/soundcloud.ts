export function normalizeSoundCloudUrl(value: string | null | undefined) {
  if (!value) return null;

  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (
      url.protocol !== "https:" ||
      (host !== "soundcloud.com" && !host.endsWith(".soundcloud.com"))
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

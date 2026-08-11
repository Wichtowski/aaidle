export const normalizeModelSearch = (value: string) =>
  value
    .toLocaleLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/[^a-z0-9]+/g, "");

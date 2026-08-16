export const utcDate = (now = new Date()) => now.toISOString().slice(0, 10);
export const expiresAt = (date: string) => new Date(`${date}T00:00:00.000Z`).getTime() + 86_400_000;
export const distribution = () =>
  Object.fromEntries(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10+"].map((key) => [key, 0]));

import { z } from "zod";

export const firstGameDate = "2026-08-11";
export function parseGameRouteDate(value: string): string | null {
  if (!/^\d{8}$/.test(value)) return null;
  const date = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  return z.iso.date().safeParse(date).success ? date : null;
}
export const compactGameDate = (date: string) => date.replaceAll("-", "");
export function adjacentGameDate(date: string, direction: -1 | 1) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + direction);
  return value.toISOString().slice(0, 10);
}
export function dailyGamePath(base: string, date: string, today: string) {
  return date === today ? base : `${base}/${compactGameDate(date)}`;
}

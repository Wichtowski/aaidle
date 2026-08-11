import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Sqlite from "better-sqlite3";

export function sqliteConnection() {
  const databasePath = process.env.DATABASE_PATH ?? "./data/aaidle.db";
  mkdirSync(dirname(databasePath), { recursive: true });

  const database = new Sqlite(databasePath);
  database.pragma("journal_mode = WAL");
  database.pragma("synchronous = NORMAL");
  database.pragma("foreign_keys = ON");
  database.pragma("busy_timeout = 5000");
  return database;
}

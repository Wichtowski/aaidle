import { readdirSync, readFileSync } from "node:fs";
import { sqliteConnection } from "./sqlite-connection.mjs";

const database = sqliteConnection();
const migrationsDirectory = new URL("../database/migrations/", import.meta.url);
const migrationFiles = readdirSync(migrationsDirectory)
  .filter((file) => file.endsWith(".sql"))
  .sort();

try {
  database.exec(`
    CREATE TABLE IF NOT EXISTS aaidle_migrations (
      name TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);

  const isApplied = database.prepare("SELECT 1 FROM aaidle_migrations WHERE name = ?");
  const recordMigration = database.prepare("INSERT INTO aaidle_migrations (name) VALUES (?)");

  for (const file of migrationFiles) {
    if (isApplied.get(file)) continue;

    const migration = readFileSync(
      new URL(`../database/migrations/${file}`, import.meta.url),
      "utf8",
    );
    database.exec("BEGIN IMMEDIATE");
    try {
      database.exec(migration);
      recordMigration.run(file);
      database.exec("COMMIT");
      console.log(`Applied ${file}`);
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }
} finally {
  database.close();
}

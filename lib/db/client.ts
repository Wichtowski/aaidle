import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Sqlite from "better-sqlite3";
import type { Database, PreparedStatement, QueryResult } from "./types";

let connection: Sqlite.Database | undefined;

function sqliteConnection() {
  if (connection) return connection;

  const databasePath = process.env.DATABASE_PATH ?? "./data/aaidle.db";
  mkdirSync(dirname(databasePath), { recursive: true });
  connection = new Sqlite(databasePath);
  connection.pragma("journal_mode = WAL");
  connection.pragma("synchronous = NORMAL");
  connection.pragma("foreign_keys = ON");
  connection.pragma("busy_timeout = 5000");
  return connection;
}

class SqlitePreparedStatement implements PreparedStatement {
  private values: unknown[] = [];

  constructor(private readonly query: string) {}

  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }

  async first<T>() {
    return (
      (sqliteConnection()
        .prepare(this.query)
        .get(...(this.values as never[])) as T | undefined) ?? null
    );
  }

  async all<T>(): Promise<QueryResult<T>> {
    return {
      results: sqliteConnection()
        .prepare(this.query)
        .all(...(this.values as never[])) as T[],
    };
  }

  async run() {
    sqliteConnection()
      .prepare(this.query)
      .run(...(this.values as never[]));
  }
}

export const database = (): Database => ({
  prepare: (query) => new SqlitePreparedStatement(query),
});

export type QueryResult<T> = { results: T[] };

export interface PreparedStatement {
  bind(...values: unknown[]): PreparedStatement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<QueryResult<T>>;
  run(): Promise<void>;
}

export interface Database {
  prepare(query: string): PreparedStatement;
}

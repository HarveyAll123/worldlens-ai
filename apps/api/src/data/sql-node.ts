/**
 * node-postgres implementation of SqlClient, for the Node dev server and integration tests
 * against a local PostgreSQL + PostGIS. Never imported by the Worker.
 */
import pg from 'pg';
import type { SqlClient, SqlQuery } from './sql';

export function nodePostgresClient(
  connectionString: string,
  opts: { max?: number; statementTimeoutMs?: number } = {},
): SqlClient & { end(): Promise<void> } {
  const pool = new pg.Pool({
    connectionString,
    max: opts.max ?? 4,
    statement_timeout: opts.statementTimeoutMs ?? 8000,
  });
  return {
    kind: 'node-postgres',
    async query<T>(text: string, params: unknown[] = []): Promise<T[]> {
      const res = await pool.query(text, params);
      return res.rows as T[];
    },
    async transaction(queries: SqlQuery[]): Promise<void> {
      if (queries.length === 0) return;
      const client = await pool.connect();
      try {
        await client.query('begin');
        for (const q of queries) await client.query(q.text, q.params);
        await client.query('commit');
      } catch (err) {
        await client.query('rollback').catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    },
    end: () => pool.end(),
  };
}

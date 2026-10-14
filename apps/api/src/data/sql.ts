/**
 * Minimal SQL client interface so the Postgres repository runs on Neon in production (HTTP
 * driver, works in Cloudflare Workers) and on node-postgres against a local database in
 * development and integration tests (`sql-node.ts`). Every query is parameterised.
 */
import { neon } from '@neondatabase/serverless';

export interface SqlQuery {
  text: string;
  params: unknown[];
}

export interface SqlClient {
  readonly kind: 'neon-http' | 'node-postgres';
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  /** Runs the statements in one transaction (all or nothing). */
  transaction(queries: SqlQuery[]): Promise<void>;
}

/**
 * Neon serverless driver over HTTPS (`neon()`): one fetch per query or per transaction, no
 * connection to keep alive, so it fits a Worker. Use the connection string from the Neon
 * console (Connect → pooled connection string).
 */
export function neonHttpClient(connectionString: string, timeoutMs = 8000): SqlClient {
  const sql = neon(connectionString);
  return {
    kind: 'neon-http',
    async query<T>(text: string, params: unknown[] = []): Promise<T[]> {
      const rows = await sql.query(text, params, {
        fetchOptions: { signal: AbortSignal.timeout(timeoutMs) },
      });
      return rows as T[];
    },
    async transaction(queries: SqlQuery[]): Promise<void> {
      if (queries.length === 0) return;
      await sql.transaction(
        queries.map((q) => sql.query(q.text, q.params)),
        { fetchOptions: { signal: AbortSignal.timeout(timeoutMs * 2) } },
      );
    },
  };
}

/** True for connection strings that point at this machine (local Postgres, not Neon). */
export function isLocalDatabaseUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^\[|\]$/g, '');
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch {
    return false;
  }
}

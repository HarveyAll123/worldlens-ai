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

export interface QueryOptions {
  /** Safe to run twice (a read): retried once after a connection-level failure. */
  idempotent?: boolean;
}

export interface SqlClient {
  readonly kind: 'neon-http' | 'node-postgres';
  query<T = Record<string, unknown>>(
    text: string,
    params?: unknown[],
    opts?: QueryOptions,
  ): Promise<T[]>;
  /** Runs the statements in one transaction (all or nothing). */
  transaction(queries: SqlQuery[]): Promise<void>;
}

/** Errors reported by PostgreSQL carry a five-character SQLSTATE; connection failures do not. */
export function sqlState(err: unknown): string | null {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code) ? code : null;
}

/**
 * Neon serverless driver over HTTPS (`neon()`): one fetch per query or per transaction, no
 * connection to keep alive, so it fits a Worker. Only for Neon hosts — the driver derives an
 * HTTP endpoint from the host name and sends the connection string to it.
 */
export function neonHttpClient(connectionString: string, timeoutMs = 8000): SqlClient {
  const sql = neon(connectionString);
  const run = (text: string, params: unknown[]) =>
    sql.query(text, params, { fetchOptions: { signal: AbortSignal.timeout(timeoutMs) } });
  return {
    kind: 'neon-http',
    async query<T>(text: string, params: unknown[] = [], opts: QueryOptions = {}): Promise<T[]> {
      try {
        return (await run(text, params)) as T[];
      } catch (err) {
        // A read that failed before reaching PostgreSQL (network, compute waking up) is
        // retried once; SQL errors and writes are not.
        if (!opts.idempotent || sqlState(err)) throw err;
        await new Promise((r) => setTimeout(r, 250));
        return (await run(text, params)) as T[];
      }
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

export type DatabaseTarget =
  { kind: 'neon' | 'local' | 'other'; url: string } | { kind: 'invalid'; reason: string };

/**
 * Classifies DATABASE_URL without ever echoing it (it contains the password). Surrounding
 * quotes, as copied from a shell or .env line, are tolerated.
 */
export function classifyDatabaseUrl(raw: string): DatabaseTarget {
  const url = raw.trim().replace(/^(['"])(.*)\1$/, '$2');
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return {
      kind: 'invalid',
      reason:
        'DATABASE_URL is not a valid postgresql:// URL (remove quotes or a "psql" prefix; URL-encode special characters in the password).',
    };
  }
  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:')
    return { kind: 'invalid', reason: 'DATABASE_URL must start with postgresql://.' };
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host.endsWith('.neon.tech')) return { kind: 'neon', url };
  if (host === 'localhost' || host === '::1' || /^127\.\d+\.\d+\.\d+$/.test(host))
    return { kind: 'local', url };
  return { kind: 'other', url };
}

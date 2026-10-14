/**
 * Applies db/migrations/*.sql (once each, in order, each in its own transaction) and then
 * db/grants.sql (every run) to a PostgreSQL + PostGIS database — Neon or local.
 *
 *   MIGRATION_DATABASE_URL=postgresql://neondb_owner:…@ep-…(no -pooler)…/neondb?sslmode=require pnpm db:migrate
 *
 * Reads MIGRATION_DATABASE_URL from the environment, else from apps/api/.dev.vars. Use the
 * owner role and Neon's direct (unpooled) connection string. DATABASE_URL is deliberately not
 * used: it belongs to the restricted API role, and a generic DATABASE_URL in the shell could
 * point at an unrelated database.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function devVar(name: string): string | undefined {
  const file = path.join(root, 'apps/api/.dev.vars');
  if (!existsSync(file)) return undefined;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && m[1] === name && m[2]) return m[2];
  }
  return undefined;
}

const raw = process.env.MIGRATION_DATABASE_URL?.trim() || devVar('MIGRATION_DATABASE_URL');
if (!raw) {
  console.error(
    'Set MIGRATION_DATABASE_URL (owner role, direct connection string) in the environment or apps/api/.dev.vars. See MANUAL_SETUP.md → Neon.',
  );
  process.exit(1);
}
const url = raw.replace(/^(['"])(.*)\1$/, '$2');

// Never print the connection string: it contains the owner password.
let target: URL;
try {
  target = new URL(url);
  if (target.protocol !== 'postgresql:' && target.protocol !== 'postgres:') throw new Error();
} catch {
  console.error(
    'MIGRATION_DATABASE_URL is not a valid postgresql:// URL (remove a "psql" prefix; URL-encode special characters in the password).',
  );
  process.exit(1);
}
if (target.hostname.includes('-pooler.'))
  console.warn(
    'warning: this is a pooled Neon connection string; Neon recommends the direct (unpooled) one for migrations.',
  );

const client = new pg.Client({ connectionString: url });
client.on('notice', (n) => console.log(`  notice: ${n.message}`));
try {
  await client.connect();
  console.log(`database: ${target.hostname}${target.pathname}`);
  await client.query(`create table if not exists schema_migrations (
    version text primary key,
    applied_at timestamptz not null default now()
  )`);
  const applied = new Set(
    (await client.query<{ version: string }>('select version from schema_migrations')).rows.map(
      (r) => r.version,
    ),
  );
  const dir = path.join(root, 'db/migrations');
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const version = file.replace(/\.sql$/, '');
    if (applied.has(version)) {
      console.log(`  = ${file}`);
      continue;
    }
    await client.query('begin');
    try {
      await client.query(readFileSync(path.join(dir, file), 'utf8'));
      await client.query('insert into schema_migrations (version) values ($1)', [version]);
      await client.query('commit');
      console.log(`  + ${file}`);
    } catch (err) {
      await client.query('rollback');
      throw new Error(`${file}: ${(err as Error).message}`, { cause: err });
    }
  }
  await client.query(readFileSync(path.join(root, 'db/grants.sql'), 'utf8'));
  console.log('  ✓ db/grants.sql');
} catch (err) {
  const message = (err as Error).message.replace(
    /\bpostgres(?:ql)?:\/\/\S+/gi,
    '[connection string]',
  );
  console.error(`db:migrate failed: ${message}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}

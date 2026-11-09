/**
 * One-off tidy-up for live news stored before stories kept their ids across ingestion runs.
 * Ingestion now merges earlier copies of a story it sees again; copies of stories the news
 * window no longer brings back (an RSS item that left its feed, last week's news) stay listed
 * twice until this merges them into the copy with the most articles. Nothing is deleted:
 * listings skip merged events and their ids lead to the kept one. Running it again changes
 * nothing.
 *
 *   pnpm db:merge-duplicates
 *
 * Uses MIGRATION_DATABASE_URL (owner role, direct connection string) from the environment or
 * apps/api/.dev.vars, like db:migrate, and never prints it.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MemoryRepository } from '../apps/api/src/data/memory-repository';
import { PostgresNewsRepository } from '../apps/api/src/data/postgres';
import { nodePostgresClient } from '../apps/api/src/data/sql-node';
import { ProviderHealth } from '../apps/api/src/providers/health';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function devVar(name: string): string | undefined {
  const file = path.join(root, 'apps/api/.dev.vars');
  if (!existsSync(file)) return undefined;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && m[1] === name && m[2]) return m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return undefined;
}

const url = process.env.MIGRATION_DATABASE_URL?.trim() || devVar('MIGRATION_DATABASE_URL');
if (!url) {
  console.error(
    'Set MIGRATION_DATABASE_URL (owner role, direct connection string) in the environment or apps/api/.dev.vars.',
  );
  process.exit(1);
}

const sql = nodePostgresClient(url, { max: 1 });
try {
  const health = new ProviderHealth();
  health.register('database', true);
  const repo = new PostgresNewsRepository(new MemoryRepository(), sql, health);
  const { stories, merged } = await repo.mergeStoredCopies();
  console.log(
    merged === 0
      ? 'No duplicate news events.'
      : `Merged ${merged} duplicate news event${merged === 1 ? '' : 's'} into ${stories} ${stories === 1 ? 'story' : 'stories'}.`,
  );
} catch (err) {
  const message = (err as Error).message.replace(
    /\bpostgres(?:ql)?:\/\/\S+/gi,
    '[connection string]',
  );
  console.error(`db:merge-duplicates failed: ${message}`);
  process.exitCode = 1;
} finally {
  await sql.end().catch(() => undefined);
}

/**
 * Applies WorldLens's corrections (scripts/lib/ohm-patches.ts) to the OpenHistoricalMap
 * countries already built in apps/web/public/data/ohm/, without downloading anything.
 *
 *   pnpm data:ohm-patch            apply and write
 *   pnpm data:ohm-patch --dry-run  list what would change
 *   pnpm data:ohm-patch --carried  also list the ground carried
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { landTestFrom, type LandMaskData } from '../packages/shared/src/fronts';
import { patchPolities, type PolityRow } from './lib/ohm-patches';

const here = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.resolve(here, '../apps/web/public/data/ohm');
const dry = process.argv.includes('--dry-run');

const index = JSON.parse(await readFile(path.join(DIR, 'polities.json'), 'utf8')) as {
  polities: PolityRow[];
  patches?: string[];
  carried?: PolityRow[];
  carriedNotes?: string[];
} & Record<string, unknown>;
const coarse = (
  JSON.parse(await readFile(path.join(DIR, 'ways-coarse.json'), 'utf8')) as { ways: number[][] }
).ways;
const isLand = landTestFrom(
  JSON.parse(
    await readFile(path.resolve(here, '../packages/shared/src/data/fronts/land-mask.json'), 'utf8'),
  ) as LandMaskData,
);

const { log, carried, carriedNotes } = patchPolities(index.polities, coarse, isLand);
for (const line of log) console.log(`- ${line}`);
const before = JSON.stringify(index.carried ?? []);
console.log(
  `${log.length} change(s) to the countries; ${carried.length} stretch(es) of ground carried${dry ? ' (dry run: nothing written)' : ''}`,
);
if (process.argv.includes('--carried')) for (const line of carriedNotes) console.log(`  ~ ${line}`);
if (!dry && (log.length || JSON.stringify(carried) !== before)) {
  index.patches = [...(index.patches ?? []), ...log];
  index.carried = carried;
  index.carriedNotes = carriedNotes;
  await writeFile(path.join(DIR, 'polities.json'), JSON.stringify(index));
}

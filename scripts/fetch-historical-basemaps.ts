/**
 * Optional: download the historical-basemaps snapshots (GPL-3.0, A. Ourednik et al.) from the
 * pinned commit into apps/web/public/vendor/historical-basemaps/ (git-ignored) for offline
 * development. Point the API at them with
 *   HISTORICAL_BASEMAPS_BASE_URL=http://127.0.0.1:5173/vendor/historical-basemaps/
 * In production the API fetches the same pinned files from jsDelivr and caches them (R2 optional).
 *
 *   pnpm data:fetch-basemaps              # download
 *   BASEMAPS_DIR=/path/to/geojson pnpm data:fetch-basemaps   # copy from a local clone
 */
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HISTORICAL_BASEMAPS_COMMIT } from '../apps/api/src/env';
import { BASEMAP_YEARS } from '../apps/api/src/providers/borders';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, '../apps/web/public/vendor/historical-basemaps');

async function main() {
  await mkdir(out, { recursive: true });
  for (const year of BASEMAP_YEARS) {
    const name = `world_${year}.geojson`;
    if (process.env.BASEMAPS_DIR) {
      await copyFile(path.join(process.env.BASEMAPS_DIR, name), path.join(out, name));
    } else {
      const url = `https://cdn.jsdelivr.net/gh/aourednik/historical-basemaps@${HISTORICAL_BASEMAPS_COMMIT}/geojson/${name}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
      await writeFile(path.join(out, name), Buffer.from(await res.arrayBuffer()));
    }
    console.log(`✓ ${name}`);
  }
  await writeFile(
    path.join(out, 'LICENSE-NOTICE.txt'),
    `historical-basemaps by Aourednik et al., GPL-3.0, commit ${HISTORICAL_BASEMAPS_COMMIT}\nhttps://github.com/aourednik/historical-basemaps\n`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

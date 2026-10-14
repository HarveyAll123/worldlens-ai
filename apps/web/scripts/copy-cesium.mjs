// Copies CesiumJS's pre-built static assets (Workers, Assets, ThirdParty, Widgets) into
// public/cesium so Vite serves them in dev and copies them into dist on build.
// Equivalent to the static-copy step in CesiumGS's official Vite example.
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const pkgPath = require.resolve('cesium/package.json');
const version = JSON.parse(readFileSync(pkgPath, 'utf8')).version;
const src = path.join(path.dirname(pkgPath), 'Build', 'Cesium');
const dest = path.join(here, '..', 'public', 'cesium');
const stamp = path.join(dest, '.version');

if (existsSync(stamp) && readFileSync(stamp, 'utf8') === version) process.exit(0);
mkdirSync(dest, { recursive: true });
for (const dir of ['Workers', 'Assets', 'ThirdParty', 'Widgets']) {
  cpSync(path.join(src, dir), path.join(dest, dir), { recursive: true });
}
writeFileSync(stamp, version);
console.info(`[copy-cesium] CesiumJS ${version} assets → public/cesium`);

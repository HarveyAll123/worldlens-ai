/**
 * Builds dated country borders from OpenHistoricalMap (CC0): every admin_level=2 boundary
 * (countries, colonies, protectorates, occupation regimes …) that existed at some point
 * since 1800, each with OHM's start_date / end_date.
 *
 *   pnpm data:ohm
 *   OHM_CACHE_DIR=/tmp/ohm pnpm data:ohm      # reuse downloaded Overpass responses
 *
 * Outputs (CC0), served as static files by the web app:
 *   apps/web/public/data/ohm/polities.json   – name, start, end, Wikidata id, label point,
 *                                               bbox and the indices of the ways that bound it
 *   apps/web/public/data/ohm/ways-coarse.json – every way, simplified (~2 km), for the globe view,
 *                                               plus where it lies (inland / coastal / at sea)
 *   apps/web/public/data/ohm/ways-<tile>.json – the same ways in detail (~100 m), in 30° tiles,
 *                                               loaded only for the area in view when zoomed in
 *
 * Neighbouring OHM boundaries share way objects, so on a given date a way referenced by two
 * active polities is a land border between them; a way referenced once is a coastline (or a
 * border with territory OHM has not mapped) and is not drawn. See apps/web/src/globe/ohm.ts.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { simplifyLine, type LonLat } from '../packages/shared/src/geo';
import { classifyLine, loadLandMask } from './lib/land-mask';
import { literal, qidOf, sparql } from './lib/wikidata';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const OUT = path.join(root, 'apps/web/public/data/ohm');
const OVERPASS = 'https://overpass-api.openhistoricalmap.org/api/interpreter';
const USER_AGENT =
  process.env.OHM_USER_AGENT ??
  'WorldLens/0.1 (https://github.com/HarveyAll123/worldlens-ai; dated borders build)';
const CACHE = process.env.OHM_CACHE_DIR ?? path.join(root, 'node_modules/.cache/ohm');

const FIRST = '1800';

/**
 * Countries are admin_level 2. Occupation regimes and dependent territories are often mapped
 * one level down (the General Government, Reichskommissariats, the Protectorate of Bohemia and
 * Moravia, the 1945–55 occupation zones of Austria, French Indochina's protectorates …), so
 * those are included by type. Ordinary subdivisions at that level (Soviet republics, Russia's
 * federal districts, Nazi Gaue, Spanish captaincies, provinces) are not borders between states
 * and are left out.
 */
const DEPENDENT =
  /(generalgouvernement|general government|reichskommissariat|protectorate|occupation|occupied|military administration|military frontier|\bzone\b|bezirk|condominium|colony|mandate|commissariat)/i;
const SUBDIVISION =
  /(federal district|soviet socialist|\bssr\b|\bgau\b|captaincy|oblast|krai|okrug|province)/i;

/** 2 = state, 3 = occupation regime / dependent territory, null = not a border between states. */
function tierOf(tags: Record<string, string>, name: string): 2 | 3 | null {
  if (tags.boundary === 'occupation_zone') return 3;
  if (tags.admin_level === '2') return 2;
  if (tags.admin_level === '3') return DEPENDENT.test(name) && !SUBDIVISION.test(name) ? 3 : null;
  if (tags.admin_level === '4') return /occupation|occupied/i.test(name) ? 3 : null;
  return null;
}
const COARSE = { tolerance: 0.02, digits: 2 };
const FINE = { tolerance: 0.001, digits: 4 };
const TILE_DEG = 30;

async function overpass<T>(query: string): Promise<T> {
  const key = createHash('sha1').update(query).digest('hex').slice(0, 16);
  const file = path.join(CACHE, `${key}.json`);
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T;
  } catch {
    /* not cached */
  }
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(OVERPASS, {
      method: 'POST',
      headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ data: query }),
    });
    if (res.ok) {
      const text = await res.text();
      await mkdir(CACHE, { recursive: true });
      await writeFile(file, text);
      return JSON.parse(text) as T;
    }
    if (attempt >= 4 || (res.status !== 429 && res.status < 500))
      throw new Error(`Overpass HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    await new Promise((r) => setTimeout(r, 10_000 * (attempt + 1)));
  }
}

/** OHM dates → ISO prefixes that compare correctly as strings ("1941", "1941-04", "1941-04-14"). */
function isoDate(v: string | undefined): string | null {
  const m = /^(\d{1,4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(v?.trim() ?? '');
  if (!m) return null;
  return [m[1]!.padStart(4, '0'), m[2], m[3]].filter(Boolean).join('-');
}

interface Relation {
  type: 'relation';
  id: number;
  tags: Record<string, string>;
  members?: Array<{ type: string; ref: number; role: string }>;
}
interface Way {
  type: 'way';
  id: number;
  geometry: Array<{ lat: number; lon: number }>;
}

function simplified(points: LonLat[], o: { tolerance: number; digits: number }): number[] {
  const f = 10 ** o.digits;
  const flat: number[] = [];
  for (const [x, y] of simplifyLine(points, o.tolerance)) {
    const rx = Math.round(x * f) / f;
    const ry = Math.round(y * f) / f;
    if (flat.length && flat[flat.length - 2] === rx && flat[flat.length - 1] === ry) continue;
    flat.push(rx, ry);
  }
  return flat;
}

interface Pending {
  name: string;
  start: string;
  end: string | null;
  wikidata: string | null;
  wikipedia: string | null;
}

/**
 * Fill in missing Wikidata ids (used for flags and facts), in order of reliability:
 *  1. the relation's own Wikipedia link ("en:Syria");
 *  2. another version of the same polity (same name) that has an id, nearest in time;
 *  3. a Wikidata state (political entity, historical country, colony, protectorate …) whose
 *     English label or alias is the name — the one with most Wikipedia editions.
 */
async function resolveWikidata(polities: Pending[]): Promise<void> {
  const missing = () => polities.filter((p) => !p.wikidata);
  const before = missing().length;

  const byLink = new Map<string, Pending[]>();
  for (const p of missing()) {
    const m = /^([a-z-]{2,12}):(.+)$/.exec(p.wikipedia ?? '');
    if (!m) continue;
    const key = `${m[1]}|${m[2]!.replace(/_/g, ' ')}`;
    byLink.set(key, [...(byLink.get(key) ?? []), p]);
  }
  const links = [...byLink.keys()];
  for (let i = 0; i < links.length; i += 80) {
    const values = links
      .slice(i, i + 80)
      .map((k) => {
        const [lang, title] = k.split('|') as [string, string];
        return `(${literal(title, lang)} <https://${lang}.wikipedia.org/>)`;
      })
      .join(' ');
    const rows = await sparql(
      `SELECT ?item ?title ?site WHERE { VALUES (?title ?site) { ${values} } ?article schema:about ?item ; schema:isPartOf ?site ; schema:name ?title . }`,
    );
    for (const r of rows) {
      const lang = /https:\/\/([a-z-]+)\.wikipedia/.exec(r.site?.value ?? '')?.[1];
      for (const p of byLink.get(`${lang}|${r.title?.value}`) ?? [])
        p.wikidata = qidOf(r.item?.value);
    }
  }

  const year = (d: string | null) => (d ? Number(d.slice(0, 4)) : 2100);
  const known = new Map<string, Pending[]>();
  for (const p of polities) if (p.wikidata) known.set(p.name, [...(known.get(p.name) ?? []), p]);
  for (const p of missing()) {
    const same = known.get(p.name);
    if (!same) continue;
    const mid = (year(p.start) + year(p.end)) / 2;
    same.sort(
      (a, b) =>
        Math.abs((year(a.start) + year(a.end)) / 2 - mid) -
        Math.abs((year(b.start) + year(b.end)) / 2 - mid),
    );
    p.wikidata = same[0]!.wikidata;
  }

  const names = [...new Set(missing().map((p) => p.name))];
  const best = new Map<string, { qid: string; links: number }>();
  for (let i = 0; i < names.length; i += 40) {
    const values = names
      .slice(i, i + 40)
      .map((n) => literal(n, 'en'))
      .join(' ');
    const rows = await sparql(`
      SELECT ?name ?item ?links WHERE {
        VALUES ?name { ${values} }
        { ?item rdfs:label ?name } UNION { ?item skos:altLabel ?name }
        ?item wdt:P31/wdt:P279* ?root ; wikibase:sitelinks ?links .
        # political territorial entity, historical country, state, country, colony, protectorate
        VALUES ?root { wd:Q1048835 wd:Q3024240 wd:Q7275 wd:Q6256 wd:Q133156 wd:Q164142 }
      }`);
    for (const r of rows) {
      const name = r.name!.value;
      const links = Number(r.links?.value ?? 0);
      if ((best.get(name)?.links ?? -1) < links)
        best.set(name, { qid: qidOf(r.item?.value), links });
    }
  }
  for (const p of missing()) p.wikidata = best.get(p.name)?.qid ?? null;
  console.log(`Wikidata ids filled in: ${before - missing().length} of ${before}`);
}

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  const rels = (
    await overpass<{ elements: Relation[] }>(
      `[out:json][timeout:300];
      (
        relation["boundary"="administrative"]["admin_level"="2"];
        relation["boundary"="administrative"]["admin_level"="3"];
        relation["boundary"="administrative"]["admin_level"="4"]["name"~"occupation|occupied",i];
        relation["boundary"="occupation_zone"];
      );
      out body;`,
    )
  ).elements;

  let undated = 0;
  const kept = rels.flatMap((r) => {
    const start = isoDate(r.tags.start_date);
    const end = r.tags.end_date ? isoDate(r.tags.end_date) : null;
    if (!start || (r.tags.end_date && !end)) {
      undated++;
      return [];
    }
    if ((end && end < FIRST) || start > today) return [];
    const wayIds = [
      ...new Set((r.members ?? []).filter((m) => m.type === 'way').map((m) => m.ref)),
    ];
    if (!wayIds.length) return [];
    const rawName = r.tags['name:en'] ?? r.tags.name ?? r.tags.official_name;
    if (!rawName) return [];
    // "Japan (1977-)", "North Korea (1948-1953)": the dates are already in start/end.
    const name = rawName.replace(/\s*\((?:c\.\s*)?\d{3,4}\s*[-–][^)]*\)\s*$/, '').trim() || rawName;
    const tier = tierOf(r.tags, name);
    if (!tier) return [];
    return [
      {
        id: r.id,
        name,
        start,
        end,
        wikidata: r.tags.wikidata ?? null,
        wikipedia: r.tags.wikipedia ?? null,
        hasEnglishName: !!r.tags['name:en'],
        wayIds,
        tier,
      },
    ];
  });
  await resolveWikidata(kept);
  // Entries nobody can identify — no Wikidata or Wikipedia link, no English name, and no
  // Wikidata state by that name — are not drawn (e.g. invented states inside Greenland).
  const identified = kept.filter((p) => p.wikidata || p.wikipedia || p.hasEnglishName);
  console.log(`dropped as unidentifiable: ${kept.length - identified.length}`);
  kept.splice(0, kept.length, ...identified);
  console.log(
    `relations: ${rels.length}; kept (exist since ${FIRST}): ${kept.length}; unparseable dates: ${undated}`,
  );

  // Way geometry, in batches (cached).
  const allIds = [...new Set(kept.flatMap((p) => p.wayIds))].sort((a, b) => a - b);
  const ways = new Map<number, LonLat[]>();
  for (let i = 0; i < allIds.length; i += 2000) {
    const batch = allIds.slice(i, i + 2000);
    const res = await overpass<{ elements: Way[] }>(
      `[out:json][timeout:300]; way(id:${batch.join(',')}); out geom;`,
    );
    for (const w of res.elements)
      if (w.geometry?.length >= 2)
        ways.set(
          w.id,
          w.geometry.map((g) => [g.lon, g.lat] as LonLat),
        );
    process.stdout.write(`\rways: ${Math.min(i + 2000, allIds.length)}/${allIds.length}`);
  }
  console.log(`\nways with geometry: ${ways.size}`);

  // Stable way indices; coarse + fine geometry; fine split into tiles.
  const wayIndex = new Map<number, number>();
  const mask = await loadLandMask();
  const coarse: number[][] = [];
  let classes = '';
  const tiles = new Map<string, Record<number, number[]>>();
  let finePoints = 0;
  for (const id of allIds) {
    const pts = ways.get(id);
    if (!pts) continue;
    const idx = coarse.length;
    wayIndex.set(id, idx);
    coarse.push(simplified(pts, COARSE));
    classes += classifyLine(mask, pts);
    const fine = simplified(pts, FINE);
    finePoints += fine.length / 2;
    const mid = pts[Math.floor(pts.length / 2)]!;
    const tile = `${Math.floor((mid[0] + 180) / TILE_DEG)}_${Math.floor((mid[1] + 90) / TILE_DEG)}`;
    const t = tiles.get(tile) ?? {};
    t[idx] = fine;
    tiles.set(tile, t);
  }

  const polities = kept
    .map((p) => {
      const idx = p.wayIds
        .map((id) => wayIndex.get(id))
        .filter((i): i is number => i !== undefined);
      // Label point: mean of the boundary's coarse vertices; bbox for label priority.
      let sx = 0;
      let sy = 0;
      let n = 0;
      let w = 180;
      let s = 90;
      let e = -180;
      let nn = -90;
      for (const i of idx) {
        const c = coarse[i]!;
        for (let k = 0; k < c.length; k += 2) {
          sx += c[k]!;
          sy += c[k + 1]!;
          n++;
          w = Math.min(w, c[k]!);
          e = Math.max(e, c[k]!);
          s = Math.min(s, c[k + 1]!);
          nn = Math.max(nn, c[k + 1]!);
        }
      }
      if (!n) return null;
      const r1 = (v: number) => Math.round(v * 10) / 10;
      return [
        p.name,
        p.start,
        p.end,
        p.wikidata,
        [r1(sx / n), r1(sy / n)],
        [r1(w), r1(s), r1(e), r1(nn)],
        // Sorted way indices, delta-encoded (keeps the file small).
        idx.sort((a, b) => a - b).map((v, k, arr) => (k ? v - arr[k - 1]! : v)),
        p.tier,
      ];
    })
    .filter((p) => p !== null)
    .sort((a, b) => String(a[1]).localeCompare(String(b[1])));

  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  const meta = {
    source: 'OpenHistoricalMap (https://www.openhistoricalmap.org), CC0 1.0',
    retrieved: today,
    note: 'admin_level=2 boundaries with start_date/end_date; existing at some point since 1800.',
  };
  await writeFile(
    path.join(OUT, 'polities.json'),
    JSON.stringify({
      ...meta,
      columns: ['name', 'start', 'end', 'wikidata', 'label', 'bbox', 'waysDelta', 'tier'],
      tileDeg: TILE_DEG,
      tiles: [...tiles.keys()].sort(),
      polities,
    }),
  );
  await writeFile(
    path.join(OUT, 'ways-coarse.json'),
    JSON.stringify({
      ...meta,
      // One character per way: 2 inland, 1 on land near the coast, 0 at sea (Natural Earth
      // 1:10m land mask). Coastlines and maritime limits are not drawn as borders.
      classes,
      ways: coarse,
    }),
  );
  for (const [tile, t] of tiles)
    await writeFile(path.join(OUT, `ways-${tile}.json`), JSON.stringify({ ...meta, ways: t }));
  const coarsePoints = coarse.reduce((acc, c) => acc + c.length / 2, 0);
  const tally = [...classes].reduce<Record<string, number>>(
    (t, c) => ({ ...t, [c]: (t[c] ?? 0) + 1 }),
    {},
  );
  console.log(
    `way classes: inland ${tally['2'] ?? 0}, coastal ${tally['1'] ?? 0}, sea ${tally['0'] ?? 0}`,
  );
  console.log(
    `wrote ${polities.length} polities, ${coarse.length} ways (coarse ${coarsePoints} pts, fine ${finePoints} pts in ${tiles.size} tiles) → ${path.relative(root, OUT)}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

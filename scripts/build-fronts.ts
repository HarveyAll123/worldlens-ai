/**
 * Builds the theatres whose front lines the globe reconstructs day by day
 * (packages/shared/src/fronts.ts) from the place lists in scripts/fronts/.
 *
 *   pnpm data:fronts            resolve new places' coordinates (Wikidata, CC0), validate, write
 *   pnpm data:fronts --offline  never ask the network: fail on a place with no cached coordinates
 *
 * Coordinates: each place names its English Wikipedia article; the article's Wikidata item
 * gives the coordinates (P625). They are cached in scripts/fronts/coords.json (committed), so
 * a rebuild is reproducible and needs no network. The dates are WorldLens's own compilation
 * (see CONTENT_LICENSING.md → Front lines).
 *
 * Output (committed): packages/shared/src/data/fronts/theatres.json
 */
import { existsSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { THEATRES } from './fronts/index';
import type { TheatreSource } from './fronts/types';

const here = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(here, 'fronts/coords.json');
const OUT = path.resolve(here, '../packages/shared/src/data/fronts/theatres.json');
const OFFLINE = process.argv.includes('--offline');
const USER_AGENT =
  process.env.WIKIDATA_USER_AGENT ??
  'WorldLens/0.1 (https://github.com/HarveyAll123/worldlens-ai; data build)';
const DAY_MS = 86_400_000;
/** "Since before the theatre opens" / "until after it closes": far enough to be at rest. */
const BEYOND_DAYS = 100_000;

interface Coord {
  lat: number;
  lon: number;
  /** Wikidata item the coordinates are from (absent for "@lat,lon" places). */
  qid?: string;
}
interface ParsedPlace {
  name: string;
  ref: string;
  held: Array<[number, number]>;
  neutral: boolean;
}

const dayOf = (iso: string, what: string): number => {
  if (!/^-?\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error(`${what}: "${iso}" is not YYYY-MM-DD`);
  const ms = Date.parse(`${iso}T00:00:00Z`);
  if (!Number.isFinite(ms)) throw new Error(`${what}: "${iso}" is not a date`);
  return Math.round(ms / DAY_MS);
};

const KM_PER_DEG = 111.2;

/**
 * "@line course | periods on its left | periods on its right | spacing km | offset km": a line
 * whose course is known. Unnamed places are set in pairs along it, `offset` km to either side
 * every `spacing` km, so the front the engine works out between them is the line itself. Left
 * and right are as one travels along it; "skip" for a side sets no places on it.
 *
 * The course is a file in scripts/fronts/data/ (a LineString of [lon, lat]), or written out:
 * "label = lat,lon; lat,lon; …" (the label names its places and must be the theatre's only one
 * of that name).
 */
function alongLine(directive: string, id: string): string[] {
  const cols = directive
    .slice('@line'.length)
    .split('|')
    .map((c) => c.trim());
  if (cols.length !== 5) throw new Error(`${id}: expected "@line course | left | right | km | km"`);
  const [course, left, right, spacingKm, offsetKm] = cols as [
    string,
    string,
    string,
    string,
    string,
  ];
  let label = course;
  let coordinates: Array<[number, number]>;
  const written = /^([^=]+)=(.+)$/.exec(course);
  if (written) {
    label = written[1]!.trim();
    coordinates = written[2]!.split(';').map((pair) => {
      const [lat, lon] = pair.split(',').map((v) => Number(v.trim()));
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat!) > 90)
        throw new Error(`${id}: cannot read "${pair.trim()}" in @line ${label}`);
      return [lon!, lat!];
    });
  } else
    coordinates = (
      JSON.parse(readFileSync(path.join(here, 'fronts/data', course), 'utf8')) as {
        coordinates: Array<[number, number]>;
      }
    ).coordinates;
  const spacing = Number(spacingKm);
  const offset = Number(offsetKm);
  if (!(spacing > 0) || !(offset > 0)) throw new Error(`${id}: bad spacing or offset in @line`);
  if (coordinates.length < 2) throw new Error(`${id}: @line ${label} has no course`);
  // Distances along the line, in kilometres on a local flat map.
  const lat0 = coordinates.reduce((a, c) => a + c[1], 0) / coordinates.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const xy = coordinates.map(([lon, lat]) => [lon * k * KM_PER_DEG, lat * KM_PER_DEG] as const);
  const along = [0];
  for (let i = 1; i < xy.length; i++)
    along.push(along[i - 1]! + Math.hypot(xy[i]![0] - xy[i - 1]![0], xy[i]![1] - xy[i - 1]![1]));
  const total = along[along.length - 1]!;
  const at = (s: number): readonly [number, number] => {
    const d = Math.max(0, Math.min(total, s));
    let i = 1;
    while (i < along.length - 1 && along[i]! < d) i++;
    const f = (d - along[i - 1]!) / (along[i]! - along[i - 1]! || 1);
    return [
      xy[i - 1]![0] + f * (xy[i]![0] - xy[i - 1]![0]),
      xy[i - 1]![1] + f * (xy[i]![1] - xy[i - 1]![1]),
    ];
  };
  // The direction is taken over a stretch about as long as the places stand off: a surveyed
  // line wiggles, and a sketched one turns at its corners.
  const reach = Math.max(offset, 3);
  const out: string[] = [];
  let n = 0;
  for (let s = spacing / 2; s <= total; s += spacing) {
    const [px, py] = at(s);
    const [ax, ay] = at(s - reach);
    const [bx, by] = at(s + reach);
    const tl = Math.hypot(bx - ax, by - ay) || 1;
    const tx = (bx - ax) / tl;
    const ty = (by - ay) / tl;
    // Left of the direction of travel: (-ty, tx).
    const pin = (side: 1 | -1) =>
      `@${((py + side * tx * offset) / KM_PER_DEG).toFixed(4)},${((px - side * ty * offset) / (k * KM_PER_DEG)).toFixed(4)}`;
    n++;
    if (left !== 'skip') out.push(`~${label} left ${n} | ${pin(1)} | ${left}`);
    if (right !== 'skip') out.push(`~${label} right ${n} | ${pin(-1)} | ${right}`);
  }
  return out;
}

function parsePlaces(t: TheatreSource): ParsedPlace[] {
  const start = dayOf(t.start, `${t.id} start`);
  const end = dayOf(t.end, `${t.id} end`);
  const out: ParsedPlace[] = [];
  const lines = t.places
    .split('\n')
    .flatMap((raw) => (raw.trim().startsWith('@line') ? alongLine(raw.trim(), t.id) : [raw]));
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const cols = line.split('|').map((c) => c.trim());
    if (cols.length !== 3) throw new Error(`${t.id}: expected "Name | title | periods": ${line}`);
    const [name, title, periods] = cols as [string, string, string];
    const where = `${t.id} / ${name}`;
    const held: Array<[number, number]> = [];
    if (periods && periods !== '-' && periods !== 'n')
      for (const p of periods.split(',').map((s) => s.trim())) {
        const m = /^(<|-?\d{4}-\d{2}-\d{2})\.\.(>|-?\d{4}-\d{2}-\d{2})$/.exec(p);
        if (!m) throw new Error(`${where}: cannot read period "${p}"`);
        const from = m[1] === '<' ? start - BEYOND_DAYS : dayOf(m[1]!, where);
        const to = m[2] === '>' ? end + BEYOND_DAYS : dayOf(m[2]!, where);
        if (to <= from) throw new Error(`${where}: period "${p}" ends before it starts`);
        if (m[1] !== '<' && (from < start || from > end))
          throw new Error(`${where}: ${m[1]} is outside the theatre (${t.start} to ${t.end})`);
        if (m[2] !== '>' && (to < start || to > end))
          throw new Error(`${where}: ${m[2]} is outside the theatre (${t.start} to ${t.end})`);
        if (held.length && from < held[held.length - 1]![1])
          throw new Error(`${where}: periods overlap or are out of order`);
        held.push([from, to]);
      }
    out.push({ name, ref: title || name, held, neutral: periods === 'n' });
  }
  const names = new Set<string>();
  for (const p of out) {
    if (names.has(p.name)) throw new Error(`${t.id}: "${p.name}" is listed twice`);
    names.add(p.name);
  }
  return out;
}

async function getJson<T>(url: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (res.ok) return (await res.json()) as T;
    if (attempt >= 3 || (res.status !== 429 && res.status < 500))
      throw new Error(`HTTP ${res.status} for ${url.slice(0, 120)}`);
    await new Promise((r) => setTimeout(r, 4_000 * (attempt + 1)));
  }
}

/** English Wikipedia titles → Wikidata items (following redirects); flags what is not a place. */
async function itemsFor(
  titles: string[],
): Promise<{ items: Map<string, string>; problems: string[] }> {
  const out = new Map<string, string>();
  const problems: string[] = [];
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const json = await getJson<{
      query: {
        normalized?: Array<{ from: string; to: string }>;
        redirects?: Array<{ from: string; to: string }>;
        pages: Record<
          string,
          { title: string; missing?: string; pageprops?: Record<string, string | undefined> }
        >;
      };
    }>(
      `https://en.wikipedia.org/w/api.php?${new URLSearchParams({
        action: 'query',
        format: 'json',
        redirects: '1',
        prop: 'pageprops',
        ppprop: 'wikibase_item|disambiguation',
        titles: batch.join('|'),
      })}`,
    );
    const final = new Map<string, string>(batch.map((t) => [t, t]));
    for (const step of [json.query.normalized ?? [], json.query.redirects ?? []])
      for (const { from, to } of step)
        for (const [asked, now] of final) if (now === from) final.set(asked, to);
    const pages = new Map(Object.values(json.query.pages).map((p) => [p.title, p]));
    for (const asked of batch) {
      const page = pages.get(final.get(asked)!);
      if (!page || page.missing !== undefined) problems.push(`no article "${asked}"`);
      else if (page.pageprops?.disambiguation !== undefined)
        problems.push(`"${asked}" is a disambiguation page (${page.title}): name the article`);
      else if (!page.pageprops?.wikibase_item) problems.push(`"${asked}" has no Wikidata item`);
      else out.set(asked, page.pageprops.wikibase_item);
    }
  }
  return { items: out, problems };
}

async function coordinatesOf(qids: string[]): Promise<Map<string, { lat: number; lon: number }>> {
  const out = new Map<string, { lat: number; lon: number }>();
  for (let i = 0; i < qids.length; i += 50) {
    const json = await getJson<{
      entities: Record<
        string,
        {
          claims?: {
            P625?: Array<{
              mainsnak: { datavalue?: { value: { latitude: number; longitude: number } } };
            }>;
          };
        }
      >;
    }>(
      `https://www.wikidata.org/w/api.php?${new URLSearchParams({
        action: 'wbgetentities',
        format: 'json',
        props: 'claims',
        ids: qids.slice(i, i + 50).join('|'),
      })}`,
    );
    for (const [qid, e] of Object.entries(json.entities)) {
      const v = e.claims?.P625?.[0]?.mainsnak.datavalue?.value;
      if (v) out.set(qid, { lat: v.latitude, lon: v.longitude });
    }
  }
  return out;
}

function validPattern(source: string, id: string): string {
  try {
    new RegExp(source, 'i');
  } catch {
    throw new Error(`${id}: "${source}" is not a valid pattern`);
  }
  return source;
}

const kmBetween = (a: Coord, b: Coord) =>
  Math.hypot((b.lon - a.lon) * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180), b.lat - a.lat) *
  111.2;

const cache: Record<string, Coord> = existsSync(CACHE)
  ? (JSON.parse(readFileSync(CACHE, 'utf8')) as Record<string, Coord>)
  : {};
const parsed = THEATRES.map((t) => ({ t, places: parsePlaces(t) }));

// Coordinates for every place not yet cached.
const wanted = new Set<string>();
for (const { places } of parsed)
  for (const p of places) {
    const at = /^@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/.exec(p.ref);
    if (at) cache[p.ref] = { lat: Number(at[1]), lon: Number(at[2]) };
    else if (p.ref.startsWith('@')) throw new Error(`cannot read coordinates "${p.ref}"`);
    else if (!cache[p.ref]) wanted.add(p.ref);
  }
if (wanted.size) {
  if (OFFLINE)
    throw new Error(`No cached coordinates for: ${[...wanted].join(', ')} (run without --offline)`);
  console.log(`resolving ${wanted.size} places…`);
  const { items, problems } = await itemsFor([...wanted]);
  const coords = await coordinatesOf([...new Set(items.values())]);
  for (const [title, qid] of items) {
    const c = coords.get(qid);
    if (c) cache[title] = { lat: +c.lat.toFixed(4), lon: +c.lon.toFixed(4), qid };
    else problems.push(`"${title}" (${qid}) has no coordinates: name the place's own article`);
  }
  // What was found is kept even when something else needs fixing.
  await saveCache(false);
  if (problems.length)
    throw new Error(`Places to fix (or give as "@lat,lon"):\n  ${problems.join('\n  ')}`);
}
await saveCache(true);

/** Writes the cache, sorted; `prune` drops places no theatre uses any more. */
async function saveCache(prune: boolean): Promise<void> {
  const used = new Set(parsed.flatMap(({ places }) => places.map((p) => p.ref)));
  const sorted = Object.fromEntries(
    Object.entries(cache)
      .filter(([k]) => !k.startsWith('@') && (!prune || used.has(k)))
      .sort(([a], [b]) => a.localeCompare(b)),
  );
  await writeFile(CACHE, `${JSON.stringify(sorted, null, 1)}\n`);
}

const ids = new Set<string>();
const theatres = parsed.map(({ t, places }) => {
  if (ids.has(t.id)) throw new Error(`theatre id "${t.id}" is used twice`);
  ids.add(t.id);
  const maxEdgeKm = t.maxEdgeKm ?? 500;
  const located = places.map((p) => ({ ...p, at: cache[p.ref]! }));
  let flips = 0;
  for (const p of located) {
    flips += p.held.length * 2;
    let nearest = Infinity;
    let nearestName = '';
    for (const q of located) {
      if (q === p) continue;
      const km = kmBetween(p.at, q.at);
      if (km < nearest) [nearest, nearestName] = [km, q.name];
    }
    if (nearest < 4 && !p.name.startsWith('~') && !nearestName.startsWith('~'))
      throw new Error(
        `${t.id}: "${p.name}" and "${nearestName}" are the same spot (${nearest.toFixed(1)} km)`,
      );
    if (nearest > maxEdgeKm)
      console.warn(`  ! ${t.id}: "${p.name}" is ${Math.round(nearest)} km from any other place`);
  }
  // A named place beside a line of known course must hold what that side of the line holds
  // when the theatre opens: otherwise it was put on the wrong side.
  const startDay = dayOf(t.start, t.id);
  const heldAtStart = (p: { held: Array<[number, number]> }) =>
    p.held.some(([from, to]) => startDay >= from && startDay < to);
  const linePins = located.filter((p) => p.name.startsWith('~'));
  if (linePins.length)
    for (const p of located) {
      if (p.name.startsWith('~') || p.neutral) continue;
      let nearest = linePins[0]!;
      for (const q of linePins)
        if (kmBetween(p.at, q.at) < kmBetween(p.at, nearest.at)) nearest = q;
      const km = kmBetween(p.at, nearest.at);
      // (Close by only: a line may run near a frontier with other ground across it.)
      if (km < 15 && heldAtStart(p) !== heldAtStart(nearest))
        throw new Error(
          `${t.id}: "${p.name}" is ${Math.round(km)} km from the line, on the side that ${heldAtStart(nearest) ? 'is' : 'is not'} held by ${t.sideA} — its periods say otherwise`,
        );
      if (km < 9)
        console.warn(`  ! ${t.id}: "${p.name}" is only ${km.toFixed(1)} km from the line`);
    }
  console.log(
    `${t.id}: ${located.length} places${linePins.length ? ` (${linePins.length} set along a known line)` : ''}, ${located.filter((p) => p.held.length).length} held by ${t.sideA} at some time, ${t.start} → ${t.end}`,
  );
  void flips;
  return {
    id: t.id,
    name: t.name,
    war: t.war,
    conflictId: t.conflictId,
    sideA: t.sideA,
    sideB: t.sideB,
    start: dayOf(t.start, t.id),
    end: dayOf(t.end, t.id),
    horizonDays: t.horizonDays ?? 30,
    maxEdgeKm,
    clipToLand: t.clipToLand ?? true,
    colorA: t.colorA,
    colorB: t.colorB,
    politiesA: validPattern(t.politiesA, t.id),
    politiesB: validPattern(t.politiesB, t.id),
    sources: t.sources,
    ...(t.note ? { note: t.note } : {}),
    places: located.map((p) => [
      p.name,
      +p.at.lat.toFixed(3),
      +p.at.lon.toFixed(3),
      p.held,
      ...(p.neutral ? [1] : []),
    ]),
  };
});

const lines = [
  '{',
  '"columns": ["name", "lat", "lon", "held: [fromDay, toDay) since 1970-01-01", "1 = neutral"],',
  '"theatres": [',
  theatres
    .map((t) => {
      const { places, ...meta } = t;
      return `${JSON.stringify(meta).slice(0, -1)},"places":[\n${places
        .map((p) => JSON.stringify(p))
        .join(',\n')}\n]}`;
    })
    .join(',\n'),
  ']}',
];
await writeFile(OUT, `${lines.join('\n')}\n`);
console.log(
  `${theatres.length} theatres, ${theatres.reduce((s, t) => s + t.places.length, 0)} places → ${OUT}`,
);

/**
 * Builds the battle layer from Wikidata (CC0): every battle, siege, naval battle and offensive
 * since 1800 that Wikidata gives a coordinate and a date.
 *
 *   pnpm data:battles
 *
 * Output (committed; CC0): packages/shared/src/data/battles.json — one compact row per battle.
 * Wikidata changes daily, so re-running the script refreshes the snapshot; the output records
 * when it was generated. Battles already curated in historical-events.ts (same English
 * Wikipedia article) are skipped so the curated record wins.
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFLICTS } from '../packages/shared/src/data/conflicts';
import { HISTORICAL_EVENTS } from '../packages/shared/src/data/historical-events';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const OUT = path.join(root, 'packages/shared/src/data/battles.json');

const ENDPOINT = 'https://query.wikidata.org/sparql';
// Wikimedia's User-Agent policy asks for a contact; override with WIKIDATA_USER_AGENT.
const USER_AGENT =
  process.env.WIKIDATA_USER_AGENT ??
  'WorldLens/0.1 (https://github.com/HarveyAll123/worldlens-ai; battle layer build)';

const TYPES: Record<string, 'battle' | 'siege' | 'naval' | 'offensive'> = {
  Q178561: 'battle',
  Q188055: 'siege',
  Q1261499: 'naval',
  Q2001676: 'offensive',
};

type Binding = Record<string, { value: string } | undefined>;

async function sparql(query: string): Promise<Binding[]> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Accept: 'application/sparql-results+json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT,
      },
      body: new URLSearchParams({ query }),
    });
    if (res.ok)
      return ((await res.json()) as { results: { bindings: Binding[] } }).results.bindings;
    if (attempt >= 3 || (res.status !== 429 && res.status < 500))
      throw new Error(
        `Wikidata query failed: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`,
      );
    await new Promise((r) => setTimeout(r, 5_000 * (attempt + 1)));
  }
}

const qid = (uri: string | undefined) => uri?.replace('http://www.wikidata.org/entity/', '') ?? '';
/** English Wikipedia title with spaces (as article URLs encode them as underscores). */
const wikiTitle = (url: string | undefined) =>
  url
    ? decodeURIComponent(url.replace('https://en.wikipedia.org/wiki/', '')).replace(/_/g, ' ')
    : null;

/** Wikidata time + precision (11 day, 10 month, 9 year) → partial ISO date. */
function isoAt(time: string, precision: number): string | null {
  const m = /^([+-]?\d{4,})-(\d{2})-(\d{2})T/.exec(time);
  if (!m) return null;
  const year = m[1]!.replace(/^\+/, '');
  if (precision >= 11) return `${year}-${m[2]}-${m[3]}`;
  if (precision === 10) return `${year}-${m[2]}`;
  if (precision === 9) return year;
  return null;
}

const PRECISION_CODE = { 11: 'd', 10: 'm', 9: 'y' } as const;

interface Battle {
  qid: string;
  label: string;
  description: string | null;
  type: (typeof TYPES)[string];
  start: string;
  end: string | null;
  precision: 'd' | 'm' | 'y';
  lat: number;
  lon: number;
  sitelinks: number;
  article: string | null;
  parents: string[];
}

async function fetchBattles(): Promise<Map<string, Battle>> {
  const rows = await sparql(`
    SELECT ?b ?type ?label ?desc ?coord ?time ?prec ?end ?endPrec ?sitelinks ?article ?part WHERE {
      VALUES ?type { ${Object.keys(TYPES)
        .map((t) => `wd:${t}`)
        .join(' ')} }
      ?b wdt:P31 ?type ; wdt:P625 ?coord ; wikibase:sitelinks ?sitelinks ; rdfs:label ?label .
      FILTER(LANG(?label) = "en")
      { ?b p:P585/psv:P585 [ wikibase:timeValue ?time ; wikibase:timePrecision ?prec ] }
      UNION
      { ?b p:P580/psv:P580 [ wikibase:timeValue ?time ; wikibase:timePrecision ?prec ] .
        OPTIONAL { ?b p:P582/psv:P582 [ wikibase:timeValue ?end ; wikibase:timePrecision ?endPrec ] } }
      FILTER(YEAR(?time) >= 1800 && ?time <= NOW())
      OPTIONAL { ?b schema:description ?desc . FILTER(LANG(?desc) = "en") }
      OPTIONAL { ?article schema:about ?b ; schema:isPartOf <https://en.wikipedia.org/> }
      OPTIONAL { ?b wdt:P361 ?part }
    }`);
  const out = new Map<string, Battle>();
  for (const r of rows) {
    const id = qid(r.b?.value);
    const prec = Number(r.prec?.value);
    const start = r.time ? isoAt(r.time.value, prec) : null;
    const coord = /^Point\(([-\d.eE]+) ([-\d.eE]+)\)$/.exec(r.coord?.value ?? '');
    if (!id || !start || !coord || !(prec in PRECISION_CODE)) continue;
    const lon = Number(coord[1]);
    const lat = Number(coord[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180)
      continue;
    const existing = out.get(id);
    if (existing) {
      // Several statements → several rows: keep the first record, collect every "part of".
      const part = qid(r.part?.value);
      if (part && !existing.parents.includes(part)) existing.parents.push(part);
      continue;
    }
    // An end date coarser than a year (decade, century) is ignored rather than coarsening the start.
    const endPrec = Number(r.endPrec?.value);
    const endUsable = !!r.end && endPrec >= 9;
    const precision = endUsable ? Math.min(prec, endPrec) : prec;
    const code = PRECISION_CODE[precision as keyof typeof PRECISION_CODE];
    const end = endUsable && code ? isoAt(r.end!.value, precision) : null;
    const startAt = code ? isoAt(r.time!.value, precision) : null;
    if (!code || !startAt) continue;
    const part = qid(r.part?.value);
    out.set(id, {
      qid: id,
      label: r.label!.value,
      description: r.desc?.value ?? null,
      type: TYPES[qid(r.type?.value)] ?? 'battle',
      start: startAt,
      end: end && end > startAt ? end : null,
      precision: code,
      lat: Math.round(lat * 1e4) / 1e4,
      lon: Math.round(lon * 1e4) / 1e4,
      sitelinks: Number(r.sitelinks?.value ?? 0),
      article: wikiTitle(r.article?.value),
      parents: part ? [part] : [],
    });
  }
  return out;
}

interface Item {
  label: string | null;
  article: string | null;
  parents: string[];
}

/** Labels, Wikipedia titles and "part of" links for the given items (batched). */
async function fetchItems(ids: string[]): Promise<Map<string, Item>> {
  const out = new Map<string, Item>();
  for (let i = 0; i < ids.length; i += 400) {
    const values = ids
      .slice(i, i + 400)
      .map((id) => `wd:${id}`)
      .join(' ');
    const rows = await sparql(`
      SELECT ?x ?label ?article ?parent WHERE {
        VALUES ?x { ${values} }
        OPTIONAL { ?x rdfs:label ?label . FILTER(LANG(?label) = "en") }
        OPTIONAL { ?article schema:about ?x ; schema:isPartOf <https://en.wikipedia.org/> }
        OPTIONAL { ?x wdt:P361 ?parent }
      }`);
    for (const r of rows) {
      const id = qid(r.x?.value);
      const item = out.get(id) ?? {
        label: r.label?.value ?? null,
        article: wikiTitle(r.article?.value),
        parents: [],
      };
      const parent = qid(r.parent?.value);
      if (parent && !item.parents.includes(parent)) item.parents.push(parent);
      out.set(id, item);
    }
  }
  return out;
}

/** Participants (P710) and location (P276) labels, batched. */
async function fetchDetails(
  ids: string[],
): Promise<
  Map<string, { participants: Array<[string, 'person' | 'state' | 'other']>; place: string | null }>
> {
  const out = new Map<
    string,
    { participants: Array<[string, 'person' | 'state' | 'other']>; place: string | null }
  >();
  for (let i = 0; i < ids.length; i += 400) {
    const values = ids
      .slice(i, i + 400)
      .map((id) => `wd:${id}`)
      .join(' ');
    const rows = await sparql(`
      SELECT ?b ?pLabel ?human ?state ?placeLabel WHERE {
        VALUES ?b { ${values} }
        { ?b wdt:P710 ?p . ?p rdfs:label ?pLabel . FILTER(LANG(?pLabel) = "en")
          BIND(EXISTS { ?p wdt:P31 wd:Q5 } AS ?human)
          BIND(EXISTS { ?p wdt:P31/wdt:P279? ?k . VALUES ?k { wd:Q6256 wd:Q3024240 wd:Q7275 wd:Q3624078 } } AS ?state) }
        UNION
        { ?b wdt:P276 ?place . ?place rdfs:label ?placeLabel . FILTER(LANG(?placeLabel) = "en") }
      }`);
    for (const r of rows) {
      const id = qid(r.b?.value);
      const d = out.get(id) ?? { participants: [], place: null };
      const name = r.pLabel?.value;
      if (name && d.participants.length < 8 && !d.participants.some(([n]) => n === name))
        d.participants.push([
          name,
          r.human?.value === 'true' ? 'person' : r.state?.value === 'true' ? 'state' : 'other',
        ]);
      if (!d.place && r.placeLabel?.value) d.place = r.placeLabel.value;
      out.set(id, d);
    }
  }
  return out;
}

/** Notability proxy: how many Wikipedia language editions describe the battle. */
function importance(sitelinks: number): 1 | 2 | 3 | 4 {
  if (sitelinks >= 40) return 4;
  if (sitelinks >= 15) return 3;
  if (sitelinks >= 5) return 2;
  return 1;
}

async function main() {
  const battles = await fetchBattles();
  console.log(`battles with date + coordinates: ${battles.size}`);

  // Walk "part of" up to four levels to name the war and link curated conflicts.
  const items = new Map<string, Item>();
  let frontier = [...new Set([...battles.values()].flatMap((b) => b.parents))];
  for (let depth = 0; depth < 4 && frontier.length; depth++) {
    const fetched = await fetchItems(frontier.filter((id) => !items.has(id)));
    for (const [id, item] of fetched) items.set(id, item);
    frontier = [...new Set([...fetched.values()].flatMap((i) => i.parents))].filter(
      (id) => !items.has(id),
    );
  }
  // Case-insensitive: Wikipedia renames articles ("Russo-Ukrainian War" → "Russo-Ukrainian war").
  const titleKey = (t: string) => t.replace(/_/g, ' ').toLowerCase();
  const conflictByArticle = new Map(CONFLICTS.map((c) => [titleKey(c.wikipediaTitle), c]));
  // A battle links to a curated conflict only inside that conflict's years (±1): Wikidata's
  // "part of" chains can climb into a later, broader dispute (e.g. 1920s battles of the Chinese
  // Civil War → Cross-Strait relations, which starts in 1949).
  const year = (iso: string) => Number(/^-?\d+/.exec(iso)?.[0]);
  const withinConflict = (start: string, c: (typeof CONFLICTS)[number]) =>
    year(start) >= year(c.time.start) - 1 && (!c.time.end || year(start) <= year(c.time.end) + 1);
  const ancestry = (start: string[]): string[] => {
    const chain: string[] = [];
    let level = start;
    for (let depth = 0; depth < 4 && level.length; depth++) {
      const id = level[0]!;
      if (chain.includes(id)) break;
      chain.push(id);
      level = items.get(id)?.parents ?? [];
    }
    return chain;
  };

  const curated = new Set(
    HISTORICAL_EVENTS.map((e) => e.wikipediaTitle?.replace(/_/g, ' ')).filter(Boolean),
  );
  const kept = [...battles.values()].filter((b) => !(b.article && curated.has(b.article)));
  console.log(`skipped (already curated): ${battles.size - kept.length}`);

  const details = await fetchDetails(kept.map((b) => b.qid));
  const rows = kept
    .map((b) => {
      const chain = ancestry(b.parents);
      const parent = chain[0] ? (items.get(chain[0])?.label ?? null) : null;
      // The closest ancestor named as a war (the top of the chain is often a broad grouping
      // such as "post-Soviet conflicts").
      const warId = chain.find((id) => /\bwars?\b/i.test(items.get(id)?.label ?? ''));
      const war = warId ? (items.get(warId)?.label ?? null) : null;
      let conflictId: string | null = null;
      for (const id of chain) {
        const article = items.get(id)?.article;
        const match = article ? conflictByArticle.get(titleKey(article)) : undefined;
        if (match && withinConflict(b.start, match)) {
          conflictId = match.id;
          break;
        }
      }
      const d = details.get(b.qid);
      return [
        b.qid,
        b.label,
        b.description,
        b.type,
        b.start,
        b.end,
        b.precision,
        b.lat,
        b.lon,
        importance(b.sitelinks),
        b.article,
        parent,
        war && war !== parent ? war : null,
        conflictId,
        d?.place ?? null,
        d?.participants ?? [],
      ];
    })
    .sort(
      (a, b) =>
        String(a[4]).localeCompare(String(b[4])) || String(a[0]).localeCompare(String(b[0])),
    );

  const file = {
    source: 'Wikidata (https://www.wikidata.org), CC0 1.0',
    generated: new Date().toISOString().slice(0, 10),
    columns: [
      'qid',
      'label',
      'description',
      'type',
      'start',
      'end',
      'precision',
      'lat',
      'lon',
      'importance',
      'enwiki',
      'partOf',
      'war',
      'conflictId',
      'place',
      'participants',
    ],
    rows,
  };
  await writeFile(OUT, JSON.stringify(file) + '\n');
  const byImportance = [1, 2, 3, 4].map((i) => rows.filter((r) => r[9] === i).length);
  console.log(
    `wrote ${rows.length} battles → ${path.relative(root, OUT)} (importance 1–4: ${byImportance.join(' / ')}; linked to curated conflicts: ${rows.filter((r) => r[13]).length})`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

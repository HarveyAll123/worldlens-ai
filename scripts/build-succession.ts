/**
 * Which dated country comes before and after which, from Wikidata, so a selected country can
 * follow the timeline (Weimar Republic ← German Reich → occupation zones → West/East Germany).
 *
 *   pnpm data:succession          (run after pnpm data:ohm)
 *
 * Statements used, in both directions so links stated only on the other item count too:
 *  - succession: P1365 replaces, P1366 replaced by, P155 follows, P156 followed by;
 *  - identity: P1269 facet of, P460 said to be the same as. An item that is a facet of exactly
 *    one OHM polity is that country: Wikidata keeps "Weimar Republic", "Nazi Germany" and
 *    "German Empire" as facets of "German Reich", which OpenHistoricalMap uses for 1918–1945,
 *    and the occupation zones say they replaced "Nazi Germany". Facets of several polities
 *    ("history of the Iberian Peninsula"-style items) join nothing, or Spain and Portugal would
 *    become one country.
 *  - "follows / followed by" are also used for lists and events, so they only count between
 *    items that are (or belong to) OHM polities; "replaces / replaced by" may pass through items
 *    that are not on the map (Allied Control Council), so those in-between items' own replace
 *    statements are fetched too;
 *  - P361 part of, from a polity to an item not on the map: the polity continued inside it and
 *    its successors follow (the occupation zones are part of the Bizone/Trizone, which West
 *    Germany replaced).
 *
 * Output: apps/web/public/data/ohm/succession.json — for each OHM polity's Wikidata id, the
 * other polity ids that are the same country, and those reachable forward / backward through
 * up to MAX_DEPTH successions, with their depth. Wikidata is CC0.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { qidOf, sparql } from './lib/wikidata';

const here = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.resolve(here, '../apps/web/public/data/ohm');
const MAX_DEPTH = 3;
const FORWARD = new Set(['P1366', 'P156']); // subject → object
const BACKWARD = new Set(['P1365', 'P155']); // object → subject
const SAME = new Set(['P1269', 'P460']);

type Edge = [string, string, string]; // subject, property, object

/** "replaces / replaced by" statements made by items that are not on the map. */
async function fetchReplaceEdges(qids: string[]): Promise<Edge[]> {
  const edges: Edge[] = [];
  for (let i = 0; i < qids.length; i += 150) {
    const values = qids
      .slice(i, i + 150)
      .map((q) => `wd:${q}`)
      .join(' ');
    const rows = await sparql(`
      SELECT ?a ?p ?b WHERE {
        VALUES ?a { ${values} }
        VALUES ?p { wdt:P1365 wdt:P1366 }
        ?a ?p ?b .
      }`);
    for (const r of rows) {
      const a = qidOf(r.a?.value);
      const b = qidOf(r.b?.value);
      const p = r.p?.value.split('/').pop() ?? '';
      if (/^Q\d+$/.test(b) && a !== b) edges.push([a, p, b]);
    }
  }
  return edges;
}

async function fetchEdges(qids: string[]): Promise<Edge[]> {
  const edges: Edge[] = [];
  for (let i = 0; i < qids.length; i += 150) {
    const values = qids
      .slice(i, i + 150)
      .map((q) => `wd:${q}`)
      .join(' ');
    const rows = await sparql(`
      SELECT ?a ?p ?b WHERE {
        VALUES ?x { ${values} }
        VALUES ?p { wdt:P1365 wdt:P1366 wdt:P155 wdt:P156 wdt:P1269 wdt:P460 }
        { ?x ?p ?b . BIND(?x AS ?a) } UNION { ?a ?p ?x . BIND(?x AS ?b) }
      }`);
    for (const r of rows) {
      const a = qidOf(r.a?.value);
      const b = qidOf(r.b?.value);
      const p = r.p?.value.split('/').pop() ?? '';
      if (/^Q\d+$/.test(a) && /^Q\d+$/.test(b) && a !== b) edges.push([a, p, b]);
    }
    const parts = await sparql(`
      SELECT ?a ?b WHERE { VALUES ?a { ${values} } ?a wdt:P361 ?b . }`);
    for (const r of parts) {
      const a = qidOf(r.a?.value);
      const b = qidOf(r.b?.value);
      if (/^Q\d+$/.test(b) && a !== b) edges.push([a, 'P361', b]);
    }
    process.stdout.write(`\r${Math.min(i + 150, qids.length)}/${qids.length}`);
  }
  console.log('');
  return edges;
}

/** "Same country" groups: an item joins the one OHM polity it is a facet of / same as. */
function groupsOf(edges: Edge[], polities: Set<string>): (q: string) => string {
  const parent = new Map<string, string>();
  const find = (q: string): string => {
    let r = q;
    while (parent.has(r) && parent.get(r) !== r) r = parent.get(r)!;
    parent.set(q, r);
    return r;
  };
  const targets = new Map<string, Set<string>>();
  for (const [a, p, b] of edges)
    if (SAME.has(p) && polities.has(b)) targets.set(a, (targets.get(a) ?? new Set()).add(b));
  for (const [a, set] of targets) if (set.size === 1) parent.set(find(a), find([...set][0]!));
  return find;
}

async function main() {
  const index = JSON.parse(await readFile(path.join(DIR, 'polities.json'), 'utf8')) as {
    polities: Array<[string, string, string | null, string | null]>;
  };
  const polityQids = [
    ...new Set(index.polities.map((p) => p[3]).filter((q): q is string => !!q && /^Q\d+$/.test(q))),
  ].sort();
  console.log(`Wikidata items: ${polityQids.length}`);
  const edges = await fetchEdges(polityQids);
  const known = new Set(polityQids);
  const between = [
    ...new Set(
      edges
        .filter(([, p]) => p === 'P1365' || p === 'P1366' || p === 'P361')
        .flatMap(([a, , b]) => [a, b])
        .filter((q) => !known.has(q)),
    ),
  ];
  edges.push(...(await fetchReplaceEdges(between)));
  console.log(`statements: ${edges.length} (${between.length} in-between items)`);

  const polities = new Set(polityQids);
  const group = groupsOf(edges, polities);
  const members = new Map<string, string[]>(); // group → OHM polity ids in it
  for (const q of polityQids) members.set(group(q), [...(members.get(group(q)) ?? []), q]);
  const onMap = (q: string) => members.has(group(q));
  const largest = [...members.values()].sort((a, b) => b.length - a.length)[0] ?? [];
  console.log(`largest "same country" group: ${largest.length} polities (${largest.join(' ')})`);

  const next = new Map<string, Set<string>>();
  const prev = new Map<string, Set<string>>();
  const link = (from: string, to: string) => {
    const [a, b] = [group(from), group(to)];
    if (a === b) return;
    next.set(a, (next.get(a) ?? new Set()).add(b));
    prev.set(b, (prev.get(b) ?? new Set()).add(a));
  };
  for (const [a, p, b] of edges) {
    const strict = p === 'P155' || p === 'P156';
    if (strict && !(onMap(a) && onMap(b))) continue;
    if (p === 'P361') {
      if (onMap(a) && !onMap(b)) link(a, b);
    } else if (FORWARD.has(p)) link(a, b);
    else if (BACKWARD.has(p)) link(b, a);
  }

  /** OHM polity ids reachable from a group, nearest first: [id, depth]. */
  const reach = (start: string, graph: Map<string, Set<string>>): Array<[string, number]> => {
    const out: Array<[string, number]> = [];
    const seen = new Set([start]);
    let frontier = [start];
    for (let depth = 1; depth <= MAX_DEPTH && frontier.length; depth++) {
      const nextFrontier: string[] = [];
      for (const g of frontier)
        for (const n of graph.get(g) ?? []) {
          if (seen.has(n)) continue;
          seen.add(n);
          nextFrontier.push(n);
          for (const q of members.get(n) ?? []) out.push([q, depth]);
        }
      frontier = nextFrontier;
    }
    return out;
  };

  const items: Record<string, [string[], Array<[string, number]>, Array<[string, number]>]> = {};
  let linked = 0;
  for (const q of polityQids) {
    const g = group(q);
    const same = (members.get(g) ?? []).filter((m) => m !== q);
    const forward = reach(g, next);
    const backward = reach(g, prev);
    if (forward.length || backward.length) linked++;
    if (same.length || forward.length || backward.length) items[q] = [same, forward, backward];
  }

  await writeFile(
    path.join(DIR, 'succession.json'),
    JSON.stringify({
      source:
        'Wikidata (CC0): P1365/P1366/P155/P156 succession, P1269/P460 identity; both directions',
      retrieved: new Date().toISOString().slice(0, 10),
      columns: ['same country', 'successors [id, depth]', 'predecessors [id, depth]'],
      items,
    }),
  );
  console.log(
    `wrote ${Object.keys(items).length} items; ${linked} of ${polityQids.length} polity ids have a successor or predecessor`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

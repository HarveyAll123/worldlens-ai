/**
 * Flags and basic facts for the dated countries (OpenHistoricalMap polities) from Wikidata:
 * every flag statement (P41) with its start/end qualifiers, the English Wikipedia article,
 * a short description and the capital(s).
 *
 *   pnpm data:flags          (run after pnpm data:ohm)
 *
 * Output: apps/web/public/data/ohm/flags.json, keyed by Wikidata id. Wikidata is CC0; the flag
 * images themselves stay on Wikimedia Commons (mostly public domain) and are hotlinked with a
 * link to their file page. Historical flags are shown as they were — no symbol is altered.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { qidOf, sparql } from './lib/wikidata';

const here = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.resolve(here, '../apps/web/public/data/ohm');
/** Wikidata time → ISO date prefix at its precision ("1935", "1935-09", "1935-09-15"). */
function isoAt(time: string | undefined, precision: string | undefined): string | null {
  const m = time ? /^([+-]?\d{4,})-(\d{2})-(\d{2})T/.exec(time) : null;
  if (!m) return null;
  const y = m[1]!.replace(/^\+/, '');
  const p = Number(precision ?? 11);
  return p >= 11 ? `${y}-${m[2]}-${m[3]}` : p === 10 ? `${y}-${m[2]}` : y;
}

const fileOf = (url: string) => decodeURIComponent(url.split('/Special:FilePath/')[1] ?? '');

/**
 * Years in a flag file name, for statements without date qualifiers: "(1924–1959)" →
 * ["1924", "1960"], "(1991–)" → ["1991", null], "(1918)" → ["1918", "1919"]. Ends are exclusive
 * (in use until the end of the named year), as the app compares start ≤ day < end. A name with
 * several ranges ("… (1958–1971), … (1980–2024)") spans all of them.
 */
export function yearsFromFileName(file: string): [string | null, string | null] {
  const ranges = [...file.matchAll(/\((\d{4})\s*(?:([–-])\s*(\d{4})?)?\)/g)].map((m) => ({
    start: Number(m[1]),
    end: !m[2] ? Number(m[1]) + 1 : m[3] ? Number(m[3]) + 1 : null,
  }));
  if (!ranges.length) return [null, null];
  const start = Math.min(...ranges.map((r) => r.start));
  const end = ranges.some((r) => r.end === null) ? null : Math.max(...ranges.map((r) => r.end!));
  return [String(start), end === null ? null : String(end)];
}

interface Entry {
  label: string | null;
  wiki: string | null;
  description: string | null;
  capitals: string[];
  /** [Commons file name, start, end, preferred rank] */
  flags: Array<[string, string | null, string | null, boolean]>;
  /**
   * States this item is a period or version of, in the order to try them when the item has no
   * flag for a date: part of, facet of, subclass of, replaces, replaced by, follows, followed by,
   * country.
   */
  related: string[];
}

async function fetchEntries(qids: string[], out: Record<string, Entry>): Promise<void> {
  // Image of the item's "flag" item (P163), used only when the item lists no flag image.
  const fallbacks = new Map<string, string>();
  for (let i = 0; i < qids.length; i += 200) {
    const values = qids
      .slice(i, i + 200)
      .map((q) => `wd:${q}`)
      .join(' ');
    const rows = await sparql(`
      SELECT ?item ?label ?flag ?start ?startPrec ?end ?endPrec ?rank ?flagItemImage ?article ?desc ?capitalLabel WHERE {
        VALUES ?item { ${values} }
        OPTIONAL { ?item rdfs:label ?label . FILTER(LANG(?label) = "en") }
        OPTIONAL {
          ?item p:P41 ?st . ?st ps:P41 ?flag ; wikibase:rank ?rank .
          FILTER(?rank != wikibase:DeprecatedRank)
          OPTIONAL { ?st pqv:P580 [ wikibase:timeValue ?start ; wikibase:timePrecision ?startPrec ] }
          OPTIONAL { ?st pqv:P582 [ wikibase:timeValue ?end ; wikibase:timePrecision ?endPrec ] }
        }
        OPTIONAL { ?item wdt:P163 ?flagItem . ?flagItem wdt:P18 ?flagItemImage . }
        OPTIONAL { ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> }
        OPTIONAL { ?item schema:description ?desc . FILTER(LANG(?desc) = "en") }
        OPTIONAL { ?item wdt:P36 ?capital . ?capital rdfs:label ?capitalLabel . FILTER(LANG(?capitalLabel) = "en") }
      }`);
    for (const r of rows) {
      const q = qidOf(r.item?.value);
      const e = (out[q] ??= {
        label: null,
        wiki: null,
        description: null,
        capitals: [],
        flags: [],
        related: [],
      });
      if (r.label && !e.label) e.label = r.label.value;
      if (r.article && !e.wiki)
        e.wiki = decodeURIComponent(r.article.value.replace('https://en.wikipedia.org/wiki/', ''));
      if (r.desc && !e.description) e.description = r.desc.value;
      const cap = r.capitalLabel?.value;
      if (cap && !e.capitals.includes(cap) && e.capitals.length < 3) e.capitals.push(cap);
      if (r.flagItemImage && !fallbacks.has(q)) fallbacks.set(q, fileOf(r.flagItemImage.value));
      if (!r.flag) continue;
      const file = fileOf(r.flag.value);
      if (!file) continue;
      let start = isoAt(r.start?.value, r.startPrec?.value);
      let end = isoAt(r.end?.value, r.endPrec?.value);
      if (!start && !end) [start, end] = yearsFromFileName(file);
      const flag: Entry['flags'][number] = [
        file,
        start,
        end,
        r.rank?.value.endsWith('PreferredRank') ?? false,
      ];
      if (!e.flags.some((f) => f[0] === flag[0] && f[1] === flag[1] && f[2] === flag[2]))
        e.flags.push(flag);
    }
    process.stdout.write(`\r${Math.min(i + 200, qids.length)}/${qids.length}`);
  }
  for (const [q, fallback] of fallbacks) {
    const e = out[q];
    if (e && !e.flags.length && fallback)
      e.flags.push([fallback, ...yearsFromFileName(fallback), false]);
  }
  for (const e of Object.values(out))
    e.flags.sort((a, b) => (a[1] ?? '').localeCompare(b[1] ?? ''));
  console.log('');
}

/** Related states (that have a flag) for each item, in priority order. */
async function fetchRelated(qids: string[]): Promise<Map<string, string[]>> {
  // part of, facet of, subclass of, replaces, replaced by, follows, followed by, country
  const props = ['P361', 'P1269', 'P279', 'P1365', 'P1366', 'P155', 'P156', 'P17'];
  const found = new Map<string, Array<[number, string]>>();
  for (let i = 0; i < qids.length; i += 200) {
    const values = qids
      .slice(i, i + 200)
      .map((q) => `wd:${q}`)
      .join(' ');
    const union = props
      .map((p, k) => `{ ?item wdt:${p} ?rel . BIND(${k} AS ?prio) }`)
      .join(' UNION ');
    const rows = await sparql(`
      SELECT ?item ?rel ?prio WHERE {
        VALUES ?item { ${values} }
        ${union}
        FILTER EXISTS { ?rel wdt:P41 [] }
      }`);
    for (const r of rows) {
      const q = qidOf(r.item?.value);
      const rel = qidOf(r.rel?.value);
      if (rel && rel !== q) found.set(q, [...(found.get(q) ?? []), [Number(r.prio?.value), rel]]);
    }
  }
  return new Map(
    [...found].map(([q, list]) => [
      q,
      [...new Set(list.sort((a, b) => a[0] - b[0]).map(([, rel]) => rel))].slice(0, 6),
    ]),
  );
}

async function main() {
  const index = JSON.parse(await readFile(path.join(DIR, 'polities.json'), 'utf8')) as {
    polities: Array<[string, string, string | null, string | null]>;
  };
  const qids = [
    ...new Set(index.polities.map((p) => p[3]).filter((q): q is string => !!q && /^Q\d+$/.test(q))),
  ].sort();
  console.log(`Wikidata items: ${qids.length}`);

  const out: Record<string, Entry> = {};
  await fetchEntries(qids, out);
  const related = await fetchRelated(qids);
  for (const [q, rels] of related) if (out[q]) out[q].related = rels;
  const extra = [...new Set([...related.values()].flat())].filter((q) => !out[q]).sort();
  console.log(`related states with flags: ${extra.length}`);
  await fetchEntries(extra, out);

  await writeFile(
    path.join(DIR, 'flags.json'),
    JSON.stringify({
      source:
        'Wikidata (CC0): P41 flag image with P580/P582 qualifiers (or years in the file name), P163 fallback, related states (P361/P1269/P279/P1365/P1366/P155/P156/P17), P36 capital, enwiki',
      images: 'Wikimedia Commons (file page linked from each flag)',
      retrieved: new Date().toISOString().slice(0, 10),
      items: out,
    }),
  );
  const own = qids.filter((q) => out[q]?.flags.length).length;
  console.log(
    `wrote ${Object.keys(out).length} items; ${own} of ${qids.length} polity items have their own flag`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

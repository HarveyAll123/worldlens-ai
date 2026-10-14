/** Deterministic text utilities used by search, deduplication and clustering. */

const STOPWORDS = new Set(
  `a an and are as at be been but by for from has have he her his in into is it its of on or
  our over says said say than that the their them then there these they this to up was were
  what when where which while who will with would after before about against amid new more
  most also not no yes you your we us i me my mine ours out off very can could may might
  should shall just over under again further once here why how all any both each few other
  some such only own same so too s t don now report reports reported according week day
  today yesterday tomorrow update live latest breaking`.split(/\s+/),
);

/** Remove diacritics but keep case and punctuation ("Tōhoku" → "Tohoku"). */
export function foldDiacritics(s: string): string {
  return s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
}

export function normalizeText(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\u2019']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function tokenize(s: string, { keepStopwords = false } = {}): string[] {
  const out: string[] = [];
  for (const t of normalizeText(s).split(' ')) {
    if (!t) continue;
    if (!keepStopwords && (STOPWORDS.has(t) || t.length < 2)) continue;
    out.push(stem(t));
  }
  return out;
}

/** Very light suffix stripping so "drills"/"drill", "talks"/"talk" match. */
export function stem(t: string): string {
  if (t.length > 4 && t.endsWith('ies')) return t.slice(0, -3) + 'y';
  if (t.length > 4 && /(ss|x|z|ch|sh)es$/.test(t)) return t.slice(0, -2);
  if (t.length > 3 && t.endsWith('s') && !/(ss|us|is)$/.test(t)) return t.slice(0, -1);
  return t;
}

export function jaccard<T>(a: Set<T>, b: Set<T>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Character trigram shingles for near-duplicate headline detection. */
export function shingles(s: string, k = 3): Set<string> {
  const n = normalizeText(s).replace(/\s+/g, ' ');
  const out = new Set<string>();
  for (let i = 0; i + k <= n.length; i++) out.add(n.slice(i, i + k));
  return out;
}

export function headlineSimilarity(a: string, b: string): number {
  return jaccard(shingles(a), shingles(b));
}

export type TermVector = Map<string, number>;

export function termVector(tokens: string[]): TermVector {
  const v: TermVector = new Map();
  for (const t of tokens) v.set(t, (v.get(t) ?? 0) + 1);
  return v;
}

/** TF-IDF weighting given document frequencies. */
export function tfidf(v: TermVector, df: Map<string, number>, docCount: number): TermVector {
  const out: TermVector = new Map();
  for (const [t, tf] of v) {
    const idf = Math.log((docCount + 1) / ((df.get(t) ?? 0) + 1)) + 1;
    out.set(t, (1 + Math.log(tf)) * idf);
  }
  return out;
}

export function cosine(a: TermVector, b: TermVector): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [, w] of a) na += w * w;
  for (const [, w] of b) nb += w * w;
  if (na === 0 || nb === 0) return 0;
  const [small, large] = a.size < b.size ? [a, b] : [b, a];
  for (const [t, w] of small) {
    const o = large.get(t);
    if (o) dot += w * o;
  }
  return dot / Math.sqrt(na * nb);
}

/** Strip control characters and collapse whitespace in untrusted metadata. */
export function sanitizeText(s: unknown, maxLen = 500): string {
  if (typeof s !== 'string') return '';
  return s
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\ufeff]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

/** Extract 4-digit years 1000–2999 from a query, in order. */
export function extractYears(s: string): number[] {
  const out: number[] = [];
  for (const m of s.matchAll(/\b(1[0-9]{3}|2[0-9]{3})s?\b/g)) out.push(Number(m[1]));
  return out;
}

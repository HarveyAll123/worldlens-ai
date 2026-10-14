/**
 * Step 6: cluster articles into events using several signals together:
 *   lexical/semantic similarity (TF-IDF cosine over headline terms + synonyms),
 *   headline near-duplication (character shingles),
 *   named-entity overlap (places/regions/organisations weigh more than countries),
 *   geographic distance, temporal distance and event category.
 *
 * Hard constraints keep distinct incidents apart even when they involve the same countries:
 *   - two different, specific places more than 150 km apart never merge;
 *   - articles more than 72 h apart never merge;
 *   - confidently incompatible categories (e.g. an earthquake vs. a trade talk) never merge.
 *
 * Embeddings can be added as one more signal later; they are intentionally not required.
 */
import {
  cosine,
  haversineKm,
  headlineSimilarity,
  jaccard,
  tfidf,
  termVector,
  tokenize,
  type EventCategory,
  type EventLocation,
  type TermVector,
} from '@worldlens/shared';
import { categorize, categoryAffinity } from './categorize';
import { entityKeys, extractEntities, type Entities } from './entities';
import { locationCandidates, resolveLocation, type LocationCandidate } from './locate';
import type { NormalizedArticle } from './normalize';

const SYNONYMS: Record<string, string> = {
  quake: 'earthquake',
  temblor: 'earthquake',
  tremor: 'earthquake',
  blaze: 'wildfire',
  bushfire: 'wildfire',
  inferno: 'wildfire',
  deluge: 'flood',
  flooding: 'flood',
  floodwater: 'flood',
  airstrike: 'strike',
  'air-strike': 'strike',
  exercise: 'drill',
  wargame: 'drill',
  manoeuvre: 'drill',
  maneuver: 'drill',
  dead: 'killed',
  death: 'killed',
  toll: 'killed',
  talk: 'talks',
  negotiation: 'talks',
  protester: 'protest',
  demonstrator: 'protest',
  demonstration: 'protest',
};

export function clusterTokens(text: string): string[] {
  return tokenize(text).map((t) => SYNONYMS[t] ?? t);
}

export interface ArticleFeatures {
  article: NormalizedArticle;
  tokens: string[];
  vector: TermVector;
  entities: Entities;
  specific: Set<string>;
  broad: Set<string>;
  candidates: LocationCandidate[];
  location: EventLocation | null;
  category: EventCategory;
  categoryConfidence: number;
}

export interface Cluster {
  members: ArticleFeatures[];
  centroid: TermVector;
  specific: Set<string>;
  broad: Set<string>;
  location: EventLocation | null;
  category: EventCategory;
  categoryConfidence: number;
  firstMs: number;
  lastMs: number;
  linkScores: number[];
}

export interface ClusterOptions {
  threshold: number;
  maxHoursApart: number;
  maxPlaceDistanceKm: number;
}

export const DEFAULT_CLUSTER_OPTIONS: ClusterOptions = {
  threshold: 0.42,
  maxHoursApart: 72,
  maxPlaceDistanceKm: 150,
};

export function buildFeatures(articles: NormalizedArticle[]): ArticleFeatures[] {
  const tokenLists = articles.map((a) => clusterTokens(a.headline));
  const df = new Map<string, number>();
  for (const toks of tokenLists) for (const t of new Set(toks)) df.set(t, (df.get(t) ?? 0) + 1);
  return articles.map((article, i) => {
    const tokens = tokenLists[i]!;
    const entities = extractEntities(article.headline);
    const { specific, broad } = entityKeys(entities);
    const candidates = locationCandidates(entities);
    const { category, confidence } = categorize(article.headline);
    return {
      article,
      tokens,
      vector: tfidf(termVector(tokens), df, articles.length),
      entities,
      specific,
      broad,
      candidates,
      location: resolveLocation([candidates]),
      category,
      categoryConfidence: confidence,
    };
  });
}

function weightedEntityOverlap(a: ArticleFeatures, c: Cluster): number {
  let inter = 0;
  let union = 0;
  for (const k of new Set([...a.specific, ...c.specific])) {
    union += 1;
    if (a.specific.has(k) && c.specific.has(k)) inter += 1;
  }
  for (const k of new Set([...a.broad, ...c.broad])) {
    union += 0.4;
    if (a.broad.has(k) && c.broad.has(k)) inter += 0.4;
  }
  return union === 0 ? 0 : inter / union;
}

function specificPlaces(loc: EventLocation | null): boolean {
  return !!loc && (loc.precision === 'city' || loc.precision === 'exact');
}

/** Score linking an article to a cluster, or null if a hard constraint blocks it. */
export function linkScore(a: ArticleFeatures, c: Cluster, opts: ClusterOptions): number | null {
  const t = a.article.publishedAtMs;
  const hoursApart = Math.max(Math.abs(t - c.firstMs), Math.abs(t - c.lastMs)) / 3_600_000;
  if (hoursApart > opts.maxHoursApart) return null;

  let geo = 0.4;
  if (a.location && c.location) {
    const d = haversineKm(a.location.lat, a.location.lon, c.location.lat, c.location.lon);
    if (specificPlaces(a.location) && specificPlaces(c.location) && d > opts.maxPlaceDistanceKm) return null;
    const coarse = a.location.precision === 'country' || c.location.precision === 'country';
    geo = d <= 100 ? 1 : d <= 400 ? 0.6 : d <= 900 ? 0.25 : 0;
    if (coarse) geo = Math.min(geo, 0.5);
  }

  const affinity = categoryAffinity(a.category, c.category);
  if (affinity < 0 && a.categoryConfidence >= 0.6 && c.categoryConfidence >= 0.6) return null;

  const cos = cosine(a.vector, c.centroid);
  let head = 0;
  let jac = 0;
  const aTokens = new Set(a.tokens);
  for (const m of c.members.slice(-5)) {
    head = Math.max(head, headlineSimilarity(a.article.headline, m.article.headline));
    jac = Math.max(jac, jaccard(aTokens, new Set(m.tokens)));
  }
  const lexical = Math.max(cos, jac);
  const ent = weightedEntityOverlap(a, c);
  const sharesSpecific = [...a.specific].some((k) => c.specific.has(k));
  const time = hoursApart <= 6 ? 1 : hoursApart <= 24 ? 0.7 : hoursApart <= 48 ? 0.4 : 0.1;

  // Require a textual connection — or, failing that, agreement on a specific entity,
  // the same place and the same category (short headlines often share few words).
  const corroborated = sharesSpecific && geo >= 0.6 && affinity === 1;
  if (lexical < 0.2 && head < 0.35 && !corroborated) return null;
  if (ent === 0 && lexical < 0.45) return null;

  return 0.35 * lexical + 0.15 * head + 0.2 * ent + 0.15 * geo + 0.1 * time + 0.05 * Math.max(0, affinity);
}

function addToCluster(c: Cluster, a: ArticleFeatures, score: number): void {
  c.members.push(a);
  c.linkScores.push(score);
  for (const [k, w] of a.vector) c.centroid.set(k, (c.centroid.get(k) ?? 0) + w);
  for (const k of a.specific) c.specific.add(k);
  for (const k of a.broad) c.broad.add(k);
  c.firstMs = Math.min(c.firstMs, a.article.publishedAtMs);
  c.lastMs = Math.max(c.lastMs, a.article.publishedAtMs);
  c.location = resolveLocation(c.members.map((m) => m.candidates));
  const cats = new Map<EventCategory, number>();
  for (const m of c.members) cats.set(m.category, (cats.get(m.category) ?? 0) + m.categoryConfidence);
  const [best] = [...cats.entries()].sort((x, y) => y[1] - x[1]);
  if (best) {
    c.category = best[0];
    c.categoryConfidence = Math.min(0.95, best[1] / c.members.length);
  }
}

function newCluster(a: ArticleFeatures): Cluster {
  return {
    members: [a],
    centroid: new Map(a.vector),
    specific: new Set(a.specific),
    broad: new Set(a.broad),
    location: a.location,
    category: a.category,
    categoryConfidence: a.categoryConfidence,
    firstMs: a.article.publishedAtMs,
    lastMs: a.article.publishedAtMs,
    linkScores: [],
  };
}

/** Greedy single-pass clustering in time order (deterministic for a given input). */
export function clusterArticles(
  articles: NormalizedArticle[],
  opts: ClusterOptions = DEFAULT_CLUSTER_OPTIONS,
): Cluster[] {
  const features = buildFeatures(
    [...articles].sort((x, y) => x.publishedAtMs - y.publishedAtMs || x.url.localeCompare(y.url)),
  );
  const clusters: Cluster[] = [];
  for (const f of features) {
    let best: Cluster | null = null;
    let bestScore = -1;
    for (const c of clusters) {
      const s = linkScore(f, c, opts);
      if (s !== null && s > bestScore) {
        best = c;
        bestScore = s;
      }
    }
    if (best && bestScore >= opts.threshold) addToCluster(best, f, bestScore);
    else clusters.push(newCluster(f));
  }
  return clusters;
}

/** Cluster confidence: mean link strength (singletons get a neutral prior). */
export function clusterConfidence(c: Cluster): number {
  if (c.linkScores.length === 0) return 0.5;
  const mean = c.linkScores.reduce((s, x) => s + x, 0) / c.linkScores.length;
  return Math.round(Math.min(0.95, 0.4 + mean) * 100) / 100;
}

/** The member most similar to the others — used for the event headline and image. */
export function representative(c: Cluster): ArticleFeatures {
  if (c.members.length <= 2) return c.members[0]!;
  let best = c.members[0]!;
  let bestScore = -1;
  for (const m of c.members) {
    let s = 0;
    for (const o of c.members) if (o !== m) s += cosine(m.vector, o.vector);
    if (s > bestScore) {
      bestScore = s;
      best = m;
    }
  }
  return best;
}

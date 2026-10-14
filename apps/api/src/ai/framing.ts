/**
 * "How sources frame this event" — AI-assisted with a deterministic fallback.
 * Both are grounded only in the attached headlines/snippets, and both keep
 * claims/allegations/assessments distinct from facts.
 */
import { z } from 'zod';
import { FramingSchema, tokenize, type Article, type Framing, type NewsSource } from '@worldlens/shared';
import { fnv1a64 } from '../lib/cache';
import type { AiBudget } from './budget';
import { FRAMING_SYSTEM_PROMPT, SUMMARY_SYSTEM_PROMPT } from './prompts';
import type { AiProvider } from './provider';

type Kind = 'fact' | 'claim' | 'allegation' | 'assessment';

export function classifyStatement(text: string): Kind | 'unattributed' {
  const t = text.toLowerCase();
  if (/\b(accus|alleg|blam|condemn|deni(ed|es)|deny|dangerous manoeuvre|violat|intrud)/.test(t)) return 'allegation';
  if (/^analysis\b|\b(analyst|expert|appear|likely|suggest|signal|could|may|tests?\b|seen as)/.test(t)) return 'assessment';
  if (/\b(said|says|according to|statement|spokes|told|announced|reported|calls? it|described)\b/.test(t)) return 'claim';
  return 'unattributed';
}

function angle(headline: string): string {
  const h = headline.toLowerCase();
  if (/^analysis/.test(h)) return 'Analysis / interpretation of motives';
  if (/['‘’"“”]/.test(headline)) return 'Uses quoted official characterisation';
  if (/\b(shipping|freight|market|flight|trade|price)/.test(h)) return 'Economic or practical impact';
  if (/\b(urge|calm|restraint|de-escalat|dialogue)/.test(h)) return 'Diplomatic reaction';
  if (/\b(track|monitor|detect|shadow|ministry|coast guard)/.test(h)) return 'Security monitoring by officials';
  if (/\b(relief|aid|shelter|need)/.test(h)) return 'Humanitarian needs';
  return 'Straight report';
}

/** Deterministic comparison from headlines/snippets. */
export function heuristicFraming(eventId: string, articles: Article[], sources: NewsSource[], isDemo: boolean): Framing {
  const name = new Map(sources.map((s) => [s.id, s.name]));
  const termSources = new Map<string, Set<string>>();
  for (const a of articles) {
    for (const t of new Set(tokenize(`${a.headline}`)))
      if (t.length > 3) (termSources.get(t) ?? termSources.set(t, new Set()).get(t)!).add(a.sourceId);
  }
  const sourceCount = new Set(articles.map((a) => a.sourceId)).size;
  const shared = [...termSources.entries()]
    .filter(([, s]) => s.size >= 2)
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, 6);
  const commonlyReported: Framing['commonlyReported'] = shared.length
    ? [
        {
          text: `Terms reported by several outlets: ${shared.map(([t]) => t).join(', ')}`,
          kind: shared[0]![1].size >= 3 ? 'fact' : 'claim',
          sourceIds: [...new Set(shared.flatMap(([, s]) => [...s]))],
        },
      ]
    : [];
  for (const a of articles) {
    const k = classifyStatement(`${a.headline} ${a.snippet ?? ''}`);
    if (k === 'allegation' || k === 'claim') {
      commonlyReported.push({ text: a.headline, kind: k, sourceIds: [a.sourceId] });
    }
  }
  // Disagreements: quoted characterisations that differ between outlets.
  const quoted = articles
    .map((a) => ({ a, q: /['‘"“]([^'’"”]{3,40})['’"”]/.exec(a.headline)?.[1] }))
    .filter((x): x is { a: Article; q: string } => !!x.q);
  const disagreements: Framing['disagreements'] =
    quoted.length >= 1 && sourceCount >= 2
      ? [
          {
            topic: 'How the event is characterised',
            positions: [
              ...quoted.map(({ a, q }) => ({ text: `“${q}” (${name.get(a.sourceId) ?? a.sourceId})`, sourceIds: [a.sourceId] })),
              ...articles
                .filter((a) => !quoted.some((x) => x.a.sourceId === a.sourceId) && classifyStatement(a.headline) !== 'unattributed')
                .slice(0, 2)
                .map((a) => ({ text: a.headline, sourceIds: [a.sourceId] })),
            ].slice(0, 4),
          },
        ]
      : [];
  const framingDifferences = [...new Map(articles.map((a) => [a.sourceId, a])).values()].map((a) => ({
    sourceId: a.sourceId,
    framing: angle(a.headline),
  }));
  return {
    eventId,
    method: 'heuristic',
    commonlyReported: commonlyReported.slice(0, 8),
    disagreements,
    framingDifferences,
    caveats: [
      'Automated heuristic comparison of headlines and short snippets only — read the original reporting before drawing conclusions.',
      'Attributed statements are labelled as claims or allegations, not facts.',
      ...(isDemo ? ['DEMO: these outlets and articles are fictional.'] : []),
    ],
    generatedAt: new Date().toISOString(),
  };
}

const AiFramingSchema = FramingSchema.pick({
  commonlyReported: true,
  disagreements: true,
  framingDifferences: true,
  caveats: true,
});

function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('No JSON object in model output');
  return JSON.parse(text.slice(start, end + 1));
}

export async function aiFraming(
  eventId: string,
  articles: Article[],
  sources: NewsSource[],
  isDemo: boolean,
  deps: { provider: AiProvider; budget: AiBudget },
): Promise<Framing> {
  const key = `framing:${eventId}:${fnv1a64(articles.map((a) => a.id).join(','))}`;
  const cached = deps.budget.outputs.get(key) as Framing | undefined;
  if (cached) return cached;
  const validIds = new Set(articles.map((a) => a.sourceId));
  const input = articles.slice(0, 25).map((a) => ({
    source_id: a.sourceId,
    publisher: sources.find((s) => s.id === a.sourceId)?.name ?? a.sourceId,
    headline: a.headline,
    snippet: a.snippet ?? null,
  }));
  const res = await deps.provider.turn({
    tier: 'strong',
    purpose: 'framing',
    system: FRAMING_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: JSON.stringify({ event_id: eventId, articles: input }) }],
    maxTokens: 4000,
    effort: 'low',
  });
  deps.budget.record('framing', res.model, res.usage);
  if (res.stopReason === 'refusal') throw new Error('Model declined');
  const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  const parsed = AiFramingSchema.parse(extractJson(text));
  const clean = (ids: string[]) => ids.filter((id) => validIds.has(id));
  const out: Framing = {
    eventId,
    method: 'ai',
    model: res.model,
    commonlyReported: parsed.commonlyReported.map((c) => ({ ...c, sourceIds: clean(c.sourceIds) })).slice(0, 8),
    disagreements: parsed.disagreements.slice(0, 5).map((d) => ({ ...d, positions: d.positions.map((p) => ({ ...p, sourceIds: clean(p.sourceIds) })) })),
    framingDifferences: parsed.framingDifferences.filter((f) => validIds.has(f.sourceId)).slice(0, 12),
    caveats: [
      'AI-assisted comparison grounded only in the listed headlines and snippets; it may miss context in the full articles.',
      ...parsed.caveats.slice(0, 3),
      ...(isDemo ? ['DEMO: these outlets and articles are fictional.'] : []),
    ],
    generatedAt: new Date().toISOString(),
  };
  deps.budget.outputs.set(key, out, 6 * 3_600_000);
  return out;
}

const SummarySchema = z.object({ summary: z.string().max(600), why_it_matters: z.string().max(400) });

/** Cheap-tier cluster summary from headlines only. Cached by article set. */
export async function aiClusterSummary(
  headlines: string[],
  deps: { provider: AiProvider; budget: AiBudget },
): Promise<{ summary: string; whyItMatters: string } | null> {
  const key = `summary:${fnv1a64(headlines.join('|'))}`;
  const cached = deps.budget.outputs.get(key) as { summary: string; whyItMatters: string } | undefined;
  if (cached) return cached;
  if (!deps.budget.canSpend()) return null;
  const res = await deps.provider.turn({
    tier: 'fast',
    purpose: 'summary',
    system: SUMMARY_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: JSON.stringify({ headlines: headlines.slice(0, 15) }) }],
    maxTokens: 1200,
    effort: 'low',
  });
  deps.budget.record('summary', res.model, res.usage);
  if (res.stopReason === 'refusal') return null;
  const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  const parsed = SummarySchema.safeParse(extractJson(text));
  if (!parsed.success) return null;
  const out = { summary: parsed.data.summary, whyItMatters: parsed.data.why_it_matters };
  deps.budget.outputs.set(key, out, 12 * 3_600_000);
  return out;
}

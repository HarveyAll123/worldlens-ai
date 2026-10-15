/**
 * Battles, sieges, naval battles and offensives since 1800 from Wikidata (CC0), built by
 * `pnpm data:battles` (scripts/build-battles.ts). Records come straight from Wikidata — dates,
 * coordinates, participants and "part of" links are Wikidata's statements, not curated by
 * WorldLens — so they carry `provenance.provider = 'wikidata'` and the Wikidata item as a
 * reference. Battles also curated in historical-events.ts are excluded at build time.
 *
 * Importance (level-of-detail) is derived from how many Wikipedia language editions describe
 * the battle: ≥40 → 4, ≥15 → 3, ≥5 → 2, else 1. Curated events keep the 5 tier for themselves.
 */
import type { Participant, WorldEvent } from '../schemas';
import type { Granularity } from '../temporal';
import battlesJson from './battles.json';

type Row = [
  qid: string,
  label: string,
  description: string | null,
  type: 'battle' | 'siege' | 'naval' | 'offensive',
  start: string,
  end: string | null,
  precision: 'd' | 'm' | 'y',
  lat: number,
  lon: number,
  importance: 1 | 2 | 3 | 4,
  enwiki: string | null,
  partOf: string | null,
  war: string | null,
  conflictId: string | null,
  place: string | null,
  participants: Array<[string, 'person' | 'state' | 'other']>,
];

const data = battlesJson as unknown as { generated: string; rows: Row[] };

/** Date the Wikidata snapshot was taken. */
export const BATTLES_GENERATED = data.generated;

const PRECISION: Record<Row[6], Granularity> = { d: 'day', m: 'month', y: 'year' };
const TYPE_TAG: Record<Row[3], string> = {
  battle: 'battle',
  siege: 'siege',
  naval: 'naval-battle',
  offensive: 'offensive',
};

function summaryOf(r: Row): string | undefined {
  const [, , description, , , , , , , , , partOf, war] = r;
  const parts: string[] = [];
  if (description) parts.push(`${description.charAt(0).toUpperCase()}${description.slice(1)}.`);
  const lower = (description ?? '').toLowerCase();
  if (partOf && !lower.includes(partOf.toLowerCase())) {
    const context = war && !lower.includes(war.toLowerCase()) ? ` (${war})` : '';
    parts.push(`Part of: ${partOf}${context}.`);
  }
  return parts.length ? parts.join(' ').slice(0, 1200) : undefined;
}

function build(r: Row): WorldEvent {
  const [
    qid,
    label,
    ,
    type,
    start,
    end,
    precision,
    lat,
    lon,
    importance,
    enwiki,
    ,
    war,
    conflictId,
    place,
    participants,
  ] = r;
  const summary = summaryOf(r);
  return {
    id: `wd-${qid}`,
    kind: 'historical',
    isDemo: false,
    title: label.slice(0, 300),
    ...(summary ? { summary } : {}),
    category: 'conflict',
    tags: ['battle-layer', TYPE_TAG[type], ...(war ? [war.slice(0, 60)] : [])],
    time: {
      start,
      ...(end ? { end } : {}),
      precision: PRECISION[precision],
      approximate: false,
    },
    location: {
      name: (place ?? label).slice(0, 200),
      lat,
      lon,
      precision: 'city',
      confidence: 0.85,
    },
    extraLocations: [],
    participants: participants.map(([name, kind]): Participant => ({
      name: name.slice(0, 200),
      type: kind === 'other' ? 'other' : kind,
    })),
    ...(enwiki ? { wikipediaTitle: enwiki.replace(/ /g, '_') } : {}),
    references: [
      {
        title: `${label} — Wikidata`.slice(0, 300),
        url: `https://www.wikidata.org/wiki/${qid}`,
        publisher: 'Wikidata',
        kind: 'dataset',
        license: 'CC0 1.0',
      },
      ...(enwiki
        ? [
            {
              title: `${enwiki} — Wikipedia`.slice(0, 300),
              url: `https://en.wikipedia.org/wiki/${encodeURIComponent(enwiki.replace(/ /g, '_'))}`,
              publisher: 'Wikipedia',
              kind: 'encyclopedia' as const,
              license: 'CC BY-SA 4.0',
            },
          ]
        : []),
    ],
    importance,
    confidence: 0.85,
    ...(conflictId ? { conflictId } : {}),
    articleCount: 0,
    sourceCount: 0,
    hasTakeAction: false,
    provenance: {
      provider: 'wikidata',
      note: `Wikidata item ${qid} (CC0), snapshot ${data.generated}. Not curated by WorldLens.`,
      retrievedAt: data.generated,
    },
  };
}

export const BATTLE_EVENTS: WorldEvent[] = data.rows.map(build);

/** True for records of the Wikidata battle layer (toggled separately from curated history). */
export function isBattleLayerEvent(e: { tags?: string[] }): boolean {
  return e.tags?.includes('battle-layer') ?? false;
}

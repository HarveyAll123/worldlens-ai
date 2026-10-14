/** Step 5: keyword-based event categorisation (deterministic; AI may refine later). */
import { tokenize, type EventCategory } from '@worldlens/shared';

const RULES: Record<Exclude<EventCategory, 'other' | 'territorial' | 'society'>, string[]> = {
  disaster: [
    'earthquake',
    'quake',
    'flood',
    'flooding',
    'wildfire',
    'bushfire',
    'cyclone',
    'typhoon',
    'hurricane',
    'tsunami',
    'volcano',
    'eruption',
    'landslide',
    'storm',
    'drought',
    'heatwave',
    'magnitude',
    'tornado',
    'avalanche',
  ],
  humanitarian: [
    'refugee',
    'displaced',
    'famine',
    'humanitarian',
    'evacuation',
    'evacuated',
    'shelter',
    'relief',
    'aid',
    'hunger',
    'cholera',
    'migrant',
  ],
  conflict: [
    'war',
    'attack',
    'airstrike',
    'shelling',
    'killed',
    'militant',
    'rebel',
    'clash',
    'offensive',
    'invasion',
    'bomb',
    'bombing',
    'drone',
    'gunmen',
    'frontline',
    'insurgent',
    'hostage',
  ],
  military: [
    'military',
    'drill',
    'exercise',
    'navy',
    'naval',
    'troop',
    'warship',
    'fighter',
    'deploy',
    'patrol',
    'missile',
    'defence',
    'defense',
    'army',
    'coast',
    'guard',
    'warplane',
    'carrier',
  ],
  diplomacy: [
    'summit',
    'talk',
    'minister',
    'treaty',
    'agreement',
    'ambassador',
    'sanction',
    'diplomatic',
    'diplomat',
    'envoy',
    'negotiation',
    'ceasefire',
    'accord',
    'bilateral',
  ],
  politics: [
    'election',
    'vote',
    'parliament',
    'president',
    'premier',
    'coalition',
    'resign',
    'referendum',
    'court',
    'opposition',
    'government',
    'cabinet',
    'impeachment',
  ],
  protest: ['protest', 'protester', 'demonstration', 'demonstrator', 'rally', 'riot', 'march'],
  economy: [
    'market',
    'stock',
    'trade',
    'tariff',
    'inflation',
    'economy',
    'economic',
    'oil',
    'bank',
    'gdp',
    'shipping',
    'freight',
    'export',
    'import',
    'currency',
    'investment',
  ],
  health: [
    'outbreak',
    'virus',
    'disease',
    'vaccine',
    'epidemic',
    'pandemic',
    'hospital',
    'infection',
  ],
  science: [
    'scientist',
    'study',
    'research',
    'space',
    'satellite',
    'telescope',
    'rocket',
    'climate',
    'arctic',
    'antarctic',
  ],
};

const STEMMED: Array<[EventCategory, Set<string>]> = Object.entries(RULES).map(([cat, words]) => [
  cat as EventCategory,
  new Set(words.flatMap((w) => tokenize(w))),
]);

export function categorize(text: string): { category: EventCategory; confidence: number } {
  const tokens = tokenize(text);
  const scores = STEMMED.map(
    ([cat, set]) => [cat, tokens.filter((t) => set.has(t)).length] as const,
  )
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1]);
  if (scores.length === 0) return { category: 'other', confidence: 0.3 };
  const [top, second] = scores;
  const conf = second ? top![1] / (top![1] + second[1]) : 0.85;
  return { category: top![0], confidence: Math.round(conf * 100) / 100 };
}

const COMPATIBLE: Array<[EventCategory, EventCategory]> = [
  ['conflict', 'military'],
  ['disaster', 'humanitarian'],
  ['diplomacy', 'politics'],
  ['protest', 'politics'],
  ['economy', 'diplomacy'],
  ['health', 'humanitarian'],
  ['conflict', 'humanitarian'],
];

/** 1 = same, 0.6 = compatible, 0 = unrelated, -1 = clearly incompatible. */
export function categoryAffinity(a: EventCategory, b: EventCategory): number {
  if (a === b) return 1;
  if (a === 'other' || b === 'other') return 0.3;
  if (COMPATIBLE.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) return 0.6;
  return -1;
}

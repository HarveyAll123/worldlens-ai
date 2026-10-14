/**
 * DEMO current-events dataset.
 *
 * Everything in this file is SYNTHETIC. It exists so the product can be evaluated without
 * live provider keys. Titles start with "DEMO:", every record has `isDemo: true`, every
 * publisher is fictional, and every URL uses the reserved `.invalid` TLD so nothing can be
 * mistaken for — or link to — real reporting. Times are generated relative to "now" so the
 * scenarios appear in LIVE mode.
 */
import type { Article, WorldEvent } from '../schemas';
import { toIso } from '../temporal';

const H = 3_600_000;

interface DemoArticleDef {
  source: string;
  slug: string;
  headline: string;
  snippet: string;
  hoursAgo: number;
}

interface DemoEventDef {
  id: string;
  title: string;
  hoursAgo: number;
  place: string;
  lat: number;
  lon: number;
  loc: 'region' | 'city' | 'approximate';
  iso3?: string;
  category: WorldEvent['category'];
  importance: 1 | 2 | 3 | 4 | 5;
  summary: string;
  why: string;
  participants: WorldEvent['participants'];
  tags: string[];
  takeAction?: boolean;
  articles: DemoArticleDef[];
}

const SOURCE_SLUG: Record<string, string> = {
  'demo-src-pacific-wire': 'pacific-wire',
  'demo-src-continental-daily': 'continental-daily',
  'demo-src-harbour-herald': 'harbour-herald',
  'demo-src-island-times': 'island-times',
  'demo-src-atlantic-ledger': 'atlantic-ledger',
  'demo-src-manila-courier': 'manila-courier',
  'demo-src-relief-bulletin': 'relief-bulletin',
  'demo-src-alpine-tribune': 'alpine-tribune',
};

const DEFS: DemoEventDef[] = [
  {
    id: 'demo-news-taiwan-strait-drills',
    title: 'DEMO: Large-scale naval and air drills reported around the Taiwan Strait',
    hoursAgo: 5,
    place: 'Taiwan Strait',
    lat: 24.3,
    lon: 119.6,
    loc: 'region',
    category: 'military',
    importance: 4,
    summary:
      'Synthetic demo scenario. Several (fictional) outlets report naval and air drills around the Taiwan Strait. Reports differ on the scale of the activity and on how it is characterised.',
    why: 'Demo scenario text. Military activity around the Taiwan Strait is closely watched because of its implications for regional security and for one of the world’s busiest shipping lanes.',
    participants: [
      { name: 'Taiwan (scenario)', type: 'country' },
      { name: 'China (PRC) (scenario)', type: 'country' },
    ],
    tags: ['taiwan', 'cross-strait', 'demo'],
    articles: [
      {
        source: 'demo-src-pacific-wire',
        slug: 'ministry-tracks-aircraft-ships',
        headline: 'Defence ministry says it tracked 34 aircraft and 9 ships around Taiwan',
        snippet:
          'The ministry said in a statement that it had detected military aircraft and naval vessels operating near the island and had deployed forces to monitor them.',
        hoursAgo: 5,
      },
      {
        source: 'demo-src-continental-daily',
        slug: 'joint-readiness-patrol',
        headline:
          "Eastern Theatre Command holds joint readiness patrol, calls it a 'stern warning'",
        snippet:
          "A spokesperson described the drills as routine combat-readiness patrols and a warning against 'separatist' activity, according to state broadcaster reports.",
        hoursAgo: 4.5,
      },
      {
        source: 'demo-src-harbour-herald',
        slug: 'shipping-reroutes',
        headline: 'Shipping firms reroute some vessels as drills continue near Taiwan',
        snippet:
          'Two logistics firms said they had advised vessels to avoid designated zones; port authorities reported no closures.',
        hoursAgo: 3,
      },
      {
        source: 'demo-src-island-times',
        slug: 'tokyo-monitoring',
        headline: "Tokyo 'closely monitoring' drills; some activity reported near southern islands",
        snippet:
          "Officials said some activity took place near Japan's southwestern islands but did not enter territorial waters, according to the defence ministry.",
        hoursAgo: 2.5,
      },
      {
        source: 'demo-src-atlantic-ledger',
        slug: 'analysis-political-signal',
        headline: 'Analysis: drills appear timed to send a political signal, experts say',
        snippet:
          'Several analysts said the timing suggested a political message, although officials did not comment on the motive.',
        hoursAgo: 2,
      },
      {
        source: 'demo-src-pacific-wire',
        slug: 'drills-second-day',
        headline: 'Coast guard says it shadowed vessels near outlying islands',
        snippet:
          'The coast guard said it had shadowed vessels near outlying islands and urged restraint.',
        hoursAgo: 1,
      },
      {
        source: 'demo-src-manila-courier',
        slug: 'manila-urges-calm',
        headline: 'Manila urges calm, says it is monitoring the situation north of Luzon',
        snippet:
          'The foreign ministry said it was in contact with partners and monitoring developments.',
        hoursAgo: 1.5,
      },
    ],
  },
  {
    id: 'demo-news-scs-shoal-standoff',
    title: 'DEMO: Coast guard vessels in standoff near Scarborough Shoal',
    hoursAgo: 9,
    place: 'Scarborough Shoal, South China Sea',
    lat: 15.15,
    lon: 117.76,
    loc: 'approximate',
    category: 'military',
    importance: 3,
    summary:
      'Synthetic demo scenario. Fictional outlets describe coast guard vessels from two claimant states in a standoff near Scarborough Shoal, with conflicting accounts of who acted first.',
    why: 'Demo scenario text. Incidents at contested features test how claimants respond to the 2016 arbitration award and affect fishing and navigation in the area.',
    participants: [
      { name: 'Philippines (scenario)', type: 'country' },
      { name: 'China (PRC) (scenario)', type: 'country' },
    ],
    tags: ['south-china-sea', 'demo'],
    articles: [
      {
        source: 'demo-src-manila-courier',
        slug: 'vessel-blocked',
        headline: 'Coast guard says its vessel was blocked near the shoal',
        snippet:
          'A coast guard spokesperson said its ship was obstructed and accused the other side of dangerous manoeuvres.',
        hoursAgo: 9,
      },
      {
        source: 'demo-src-continental-daily',
        slug: 'coast-guard-expels',
        headline: "Coast guard 'expels' vessel that 'intruded' near Huangyan Dao",
        snippet:
          "A coast guard statement said it took 'necessary control measures' in accordance with the law.",
        hoursAgo: 8,
      },
      {
        source: 'demo-src-harbour-herald',
        slug: 'diplomats-de-escalation',
        headline: 'Regional diplomats call for de-escalation after shoal incident',
        snippet: 'Diplomats from several Southeast Asian states said they hoped for dialogue.',
        hoursAgo: 6,
      },
      {
        source: 'demo-src-atlantic-ledger',
        slug: 'tests-arbitration',
        headline: 'Shoal standoff tests 2016 arbitration ruling, analysts say',
        snippet:
          'Analysts noted that the Philippines regards the 2016 award as binding, while China rejects it.',
        hoursAgo: 5,
      },
    ],
  },
  {
    id: 'demo-news-sulawesi-quake-relief',
    title: 'DEMO: Earthquake relief scenario — Central Sulawesi',
    hoursAgo: 20,
    place: 'Central Sulawesi, Indonesia',
    lat: -0.9,
    lon: 119.87,
    loc: 'region',
    iso3: 'IDN',
    category: 'disaster',
    importance: 4,
    summary:
      'Synthetic relief scenario used to demonstrate the Take Action flow. No real earthquake is being reported here.',
    why: 'Demo scenario text. Shows how WorldLens connects understanding an emergency to a verified, explicitly approved action.',
    participants: [{ name: 'Relief agencies (scenario)', type: 'organization' }],
    tags: ['earthquake', 'relief', 'demo'],
    takeAction: true,
    articles: [
      {
        source: 'demo-src-relief-bulletin',
        slug: 'priority-needs',
        headline: 'Scenario update: shelter and clean water identified as priority needs',
        snippet:
          'In this demo scenario, responders list emergency shelter, clean water and medical supplies as priorities.',
        hoursAgo: 18,
      },
      {
        source: 'demo-src-harbour-herald',
        slug: 'aid-groups-prepare',
        headline: 'Scenario: aid groups prepare emergency response',
        snippet:
          'Fictional report describing logistics for delivering supplies to affected districts.',
        hoursAgo: 12,
      },
    ],
  },
  {
    id: 'demo-news-sylhet-flood-relief',
    title: 'DEMO: Monsoon flood relief scenario — Sylhet, Bangladesh',
    hoursAgo: 30,
    place: 'Sylhet Division, Bangladesh',
    lat: 24.9,
    lon: 91.87,
    loc: 'region',
    iso3: 'BGD',
    category: 'humanitarian',
    importance: 3,
    summary:
      'Synthetic relief scenario used to demonstrate the Take Action flow. No real flood event is being reported here.',
    why: 'Demo scenario text. Seasonal flooding in low-lying river basins can displace large numbers of people quickly.',
    participants: [{ name: 'Relief agencies (scenario)', type: 'organization' }],
    tags: ['flood', 'relief', 'demo'],
    takeAction: true,
    articles: [
      {
        source: 'demo-src-relief-bulletin',
        slug: 'flood-scenario',
        headline: 'Scenario: families relocate to shelters as river levels rise',
        snippet: 'Fictional bulletin describing shelter, food and water needs in a flood scenario.',
        hoursAgo: 28,
      },
    ],
  },
  {
    id: 'demo-news-attica-wildfire-recovery',
    title: 'DEMO: Wildfire recovery scenario — Attica, Greece',
    hoursAgo: 40,
    place: 'Attica, Greece',
    lat: 38.1,
    lon: 23.8,
    loc: 'region',
    iso3: 'GRC',
    category: 'disaster',
    importance: 3,
    summary:
      'Synthetic recovery scenario used to demonstrate the Take Action flow. No real wildfire is being reported here.',
    why: 'Demo scenario text. Recovery after wildfires involves temporary housing, reforestation and support for livelihoods.',
    participants: [{ name: 'Local recovery groups (scenario)', type: 'organization' }],
    tags: ['wildfire', 'recovery', 'demo'],
    takeAction: true,
    articles: [
      {
        source: 'demo-src-alpine-tribune',
        slug: 'recovery-scenario',
        headline: 'Scenario: recovery efforts focus on housing and reforestation',
        snippet: 'Fictional report on a wildfire recovery scenario.',
        hoursAgo: 36,
      },
    ],
  },
  {
    id: 'demo-news-geneva-shipping-talks',
    title: 'DEMO: Trade ministers meet in Geneva on shipping disruptions',
    hoursAgo: 14,
    place: 'Geneva',
    lat: 46.204,
    lon: 6.143,
    loc: 'city',
    iso3: 'CHE',
    category: 'economy',
    importance: 2,
    summary:
      'Synthetic demo scenario. Fictional outlets report talks among trade ministers about disruptions to shipping routes.',
    why: 'Demo scenario text. Shipping disruptions can raise freight costs and delay supply chains worldwide.',
    participants: [{ name: 'Trade ministers (scenario)', type: 'group' }],
    tags: ['trade', 'shipping', 'demo'],
    articles: [
      {
        source: 'demo-src-alpine-tribune',
        slug: 'ministers-meet',
        headline: 'Ministers meet in Geneva to discuss shipping costs',
        snippet: 'Fictional report: delegations discussed insurance costs and alternative routes.',
        hoursAgo: 13,
      },
      {
        source: 'demo-src-atlantic-ledger',
        slug: 'freight-rates',
        headline: 'Freight rates in focus as ministers meet',
        snippet: 'Fictional analysis of how route disruptions feed into freight rates.',
        hoursAgo: 10,
      },
    ],
  },
  {
    id: 'demo-news-svalbard-sea-ice-survey',
    title: 'DEMO: Research vessel completes Arctic sea-ice survey',
    hoursAgo: 50,
    place: 'Longyearbyen, Svalbard',
    lat: 78.223,
    lon: 15.646,
    loc: 'city',
    iso3: 'NOR',
    category: 'science',
    importance: 2,
    summary:
      'Synthetic demo scenario. A fictional research cruise reports completing a sea-ice survey.',
    why: 'Demo scenario text. Arctic sea-ice observations feed climate models and shipping forecasts.',
    participants: [{ name: 'Research institute (scenario)', type: 'organization' }],
    tags: ['arctic', 'climate', 'demo'],
    articles: [
      {
        source: 'demo-src-island-times',
        slug: 'sea-ice-survey',
        headline: 'Research vessel returns from Arctic survey',
        snippet: 'Fictional report on a research cruise measuring sea-ice thickness.',
        hoursAgo: 48,
      },
    ],
  },
];

export interface DemoNews {
  events: WorldEvent[];
  articles: Map<string, Article[]>;
}

/** Build the demo dataset with timestamps relative to `nowMs`. */
export function buildDemoNews(nowMs: number): DemoNews {
  const events: WorldEvent[] = [];
  const articles = new Map<string, Article[]>();
  for (const d of DEFS) {
    const list: Article[] = d.articles.map((a, i) => ({
      id: `${d.id}-a${i + 1}`,
      sourceId: a.source,
      headline: a.headline,
      url: `https://${SOURCE_SLUG[a.source] ?? 'demo'}.demo.invalid/${a.slug}`,
      publishedAt: toIso(nowMs - a.hoursAgo * H),
      language: 'English',
      sourceCountry: null,
      snippet: a.snippet,
      isDemo: true,
    }));
    articles.set(d.id, list);
    const sourceIds = new Set(list.map((a) => a.sourceId));
    events.push({
      id: d.id,
      kind: 'news',
      isDemo: true,
      title: d.title,
      summary: d.summary,
      whyItMatters: d.why,
      category: d.category,
      tags: d.tags,
      time: { start: toIso(nowMs - d.hoursAgo * H), precision: 'hour', approximate: false },
      location: {
        name: d.place,
        lat: d.lat,
        lon: d.lon,
        precision: d.loc,
        ...(d.iso3 ? { countryCode: d.iso3 } : {}),
        confidence: 1,
      },
      extraLocations: [],
      participants: d.participants,
      references: [],
      importance: d.importance,
      confidence: 1,
      articleCount: list.length,
      sourceCount: sourceIds.size,
      hasTakeAction: d.takeAction ?? false,
      provenance: { provider: 'demo', note: 'Synthetic demo scenario — not real reporting.' },
      updatedAt: toIso(nowMs - Math.min(...d.articles.map((a) => a.hoursAgo)) * H),
    });
  }
  return { events, articles };
}

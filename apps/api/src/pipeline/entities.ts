/**
 * Step 3: deterministic entity extraction from headlines using the Natural Earth gazetteer,
 * a demonym table and a small organisation list. No LLM involved.
 */
import { foldDiacritics } from '@worldlens/shared';
import {
  COUNTRIES,
  PLACES,
  REGIONS,
  countryByIso3,
  normalizeName,
  type PlaceEntry,
  type RegionEntry,
} from '@worldlens/shared/geo-data';

export interface Entities {
  /** ISO3 codes mentioned by name. */
  countries: string[];
  /** ISO3 codes implied only by an adjective ("Russian", "Chinese"). */
  demonyms: string[];
  places: PlaceEntry[];
  regions: RegionEntry[];
  organizations: string[];
}

const DEMONYMS: Record<string, string> = {
  ukrainian: 'UKR',
  russian: 'RUS',
  chinese: 'CHN',
  taiwanese: 'TWN',
  philippine: 'PHL',
  filipino: 'PHL',
  japanese: 'JPN',
  israeli: 'ISR',
  iranian: 'IRN',
  syrian: 'SYR',
  turkish: 'TUR',
  indonesian: 'IDN',
  indian: 'IND',
  pakistani: 'PAK',
  german: 'DEU',
  french: 'FRA',
  british: 'GBR',
  american: 'USA',
  vietnamese: 'VNM',
  thai: 'THA',
  sudanese: 'SDN',
  lebanese: 'LBN',
  palestinian: 'PSE',
  egyptian: 'EGY',
  mexican: 'MEX',
  brazilian: 'BRA',
  canadian: 'CAN',
  australian: 'AUS',
  nigerian: 'NGA',
  kenyan: 'KEN',
  ethiopian: 'ETH',
  afghan: 'AFG',
  iraqi: 'IRQ',
  saudi: 'SAU',
  yemeni: 'YEM',
  venezuelan: 'VEN',
  colombian: 'COL',
  haitian: 'HTI',
  polish: 'POL',
  italian: 'ITA',
  spanish: 'ESP',
  greek: 'GRC',
  bangladeshi: 'BGD',
  burmese: 'MMR',
  malaysian: 'MYS',
  singaporean: 'SGP',
  nepalese: 'NPL',
  'sri lankan': 'LKA',
  'north korean': 'PRK',
  'south korean': 'KOR',
  'south african': 'ZAF',
  argentine: 'ARG',
  chilean: 'CHL',
  peruvian: 'PER',
  cuban: 'CUB',
  libyan: 'LBY',
  somali: 'SOM',
  congolese: 'COD',
  moroccan: 'MAR',
  algerian: 'DZA',
  tunisian: 'TUN',
  jordanian: 'JOR',
  qatari: 'QAT',
  emirati: 'ARE',
  kuwaiti: 'KWT',
  armenian: 'ARM',
  azerbaijani: 'AZE',
  georgian: 'GEO',
  belarusian: 'BLR',
};

const ALIASES: Record<string, string> = {
  us: 'USA',
  usa: 'USA',
  'united states': 'USA',
  america: 'USA',
  uk: 'GBR',
  britain: 'GBR',
  'united kingdom': 'GBR',
  russia: 'RUS',
  'south korea': 'KOR',
  'north korea': 'PRK',
  prc: 'CHN',
  'czech republic': 'CZE',
  czechia: 'CZE',
  burma: 'MMR',
  'dr congo': 'COD',
  drc: 'COD',
  uae: 'ARE',
  turkiye: 'TUR',
  'ivory coast': 'CIV',
  'east timor': 'TLS',
  palestine: 'PSE',
  'gaza strip': 'PSE',
  'west bank': 'PSE',
  vietnam: 'VNM',
  laos: 'LAO',
  syria: 'SYR',
  iran: 'IRN',
  bosnia: 'BIH',
};

const ORGANIZATIONS: Record<string, string> = {
  nato: 'NATO',
  un: 'United Nations',
  'united nations': 'United Nations',
  'european union': 'European Union',
  eu: 'European Union',
  asean: 'ASEAN',
  who: 'World Health Organization',
  'world health organization': 'World Health Organization',
  imf: 'IMF',
  'world bank': 'World Bank',
  opec: 'OPEC',
  g7: 'G7',
  g20: 'G20',
  hamas: 'Hamas',
  hezbollah: 'Hezbollah',
  houthi: 'Houthis',
  houthis: 'Houthis',
  taliban: 'Taliban',
  iaea: 'IAEA',
  'international criminal court': 'International Criminal Court',
  icc: 'International Criminal Court',
  'red cross': 'Red Cross',
  unicef: 'UNICEF',
  wto: 'WTO',
  'african union': 'African Union',
  brics: 'BRICS',
  pentagon: 'Pentagon',
  kremlin: 'Kremlin',
  'white house': 'White House',
  pla: "People's Liberation Army",
  idf: 'Israel Defense Forces',
  'coast guard': 'Coast guard',
};

/** Institutions that imply a place when nothing more specific is mentioned. */
export const INSTITUTION_PLACES: Record<string, { name: string; lat: number; lon: number }> = {
  Kremlin: { name: 'Moscow', lat: 55.752, lon: 37.617 },
  'White House': { name: 'Washington, D.C.', lat: 38.897, lon: -77.036 },
  Pentagon: { name: 'Washington, D.C.', lat: 38.871, lon: -77.056 },
};

/** Lower-case words that are only entities when written as acronyms. */
const AMBIGUOUS = new Set([
  'us',
  'un',
  'who',
  'eu',
  'uk',
  'pla',
  'icc',
  'idf',
  'imf',
  'drc',
  'prc',
  'uae',
  'wto',
  'g7',
]);

/** Place names that are also common English words or produce frequent false positives. */
const PLACE_STOPLIST = new Set([
  'nice',
  'reading',
  'mobile',
  'split',
  'bath',
  'orange',
  'male',
  'sale',
  'of',
  'san',
  'la',
  'victoria',
  'florence',
  'lincoln',
  'jackson',
  'columbus',
  'kingston',
  'hamilton',
  'aden',
  'mosul city',
  'bar',
  'wells',
  'deal',
  'march',
  'may',
  'police',
  'union',
  'independence',
  'hope',
  'central',
  'south',
  'north',
]);

interface Lexicon {
  countries: Map<string, string>;
  places: Map<string, PlaceEntry>;
  regions: Map<string, RegionEntry>;
  maxN: number;
}

let lexicon: Lexicon | null = null;

function buildLexicon(): Lexicon {
  const countries = new Map<string, string>();
  for (const c of COUNTRIES) {
    for (const n of [c.name, c.nameLong]) countries.set(normalizeName(n), c.iso3);
  }
  for (const [k, v] of Object.entries(ALIASES)) countries.set(k, v);
  const places = new Map<string, PlaceEntry>();
  for (const p of PLACES) {
    // Only reasonably prominent places, to avoid matching obscure homonyms.
    if (p.rank > 7 && !p.capital) continue;
    for (const n of [p.name, p.ascii]) {
      if (!n) continue;
      const k = normalizeName(n);
      if (PLACE_STOPLIST.has(k) || countries.has(k)) continue;
      if (!places.has(k)) places.set(k, p);
    }
  }
  const regions = new Map<string, RegionEntry>();
  for (const r of REGIONS) {
    regions.set(normalizeName(r.name), r);
    for (const a of r.aliases) if (a.length > 3) regions.set(normalizeName(a), r);
  }
  return { countries, places, regions, maxN: 4 };
}

export function extractEntities(text: string): Entities {
  lexicon ??= buildLexicon();
  // Drop possessives ("Indonesia's" → "Indonesia") and keep original case for acronym checks.
  const original = foldDiacritics(text.replace(/['\u2019]s\b/g, '').replace(/['\u2019]/g, ''))
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  const words = original.map((w) => w.toLowerCase());
  const used = new Array<boolean>(words.length).fill(false);
  const out: Entities = { countries: [], demonyms: [], places: [], regions: [], organizations: [] };
  const push = <T>(arr: T[], v: T) => {
    if (!arr.includes(v)) arr.push(v);
  };
  // Longest match first so "south china sea" beats "china", "north korea" beats "korea".
  for (let n = lexicon.maxN; n >= 1; n--) {
    for (let i = 0; i + n <= words.length; i++) {
      if (used.slice(i, i + n).some(Boolean)) continue;
      const phrase = words.slice(i, i + n).join(' ');
      // Short acronyms ("US", "UN", "WHO") only count when written in capitals.
      if (n === 1 && AMBIGUOUS.has(phrase) && original[i] !== original[i]!.toUpperCase()) continue;
      let hit = true;
      const region = lexicon.regions.get(phrase);
      const country = lexicon.countries.get(phrase);
      const demonym = DEMONYMS[phrase];
      const org = ORGANIZATIONS[phrase];
      const place = lexicon.places.get(phrase);
      if (region) push(out.regions, region);
      else if (country && countryByIso3(country)) push(out.countries, country);
      else if (demonym) push(out.demonyms, demonym);
      else if (org) push(out.organizations, org);
      else if (place) push(out.places, place);
      else hit = false;
      if (hit) for (let j = i; j < i + n; j++) used[j] = true;
    }
  }
  return out;
}

/** Keys used for entity overlap in clustering. Specific keys weigh more than countries. */
export function entityKeys(e: Entities): { specific: Set<string>; broad: Set<string> } {
  const specific = new Set<string>([
    ...e.places.map((p) => `place:${normalizeName(p.name)}`),
    ...e.regions.map((r) => `region:${normalizeName(r.name)}`),
    ...e.organizations.map((o) => `org:${o}`),
  ]);
  const broad = new Set<string>([...e.countries, ...e.demonyms].map((c) => `country:${c}`));
  return { specific, broad };
}

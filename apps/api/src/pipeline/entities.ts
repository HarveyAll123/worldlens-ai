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
  /**
   * Place names the headline uses for something else — part of a person's name ("Jim Jordan",
   * "Nancy Pelosi"), a who-not-where adjective ("Iran-linked", "US-led") or a US county
   * ("Lebanon County") — so places a geocoder made of them are dropped too (locate.ts).
   */
  notPlaces: string[];
  /** ISO3 codes of the countries among those ("Jim Jordan" → JOR, "Iran-linked" → IRN). */
  notCountries: string[];
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

/**
 * Common first names: one of them, a space and a capitalised word make a person ("Jim Jordan",
 * "Nancy Pelosi"), not a place. Left out: names that are places themselves or often come before
 * one ("Georgia", "Austin", "Beverly Hills", "Hunter Valley"), and ordinary words ("Will", "Bill").
 */
const FIRST_NAMES = new Set(
  `aaron adam alan alexander alexandra alice alison amanda amber amy andrea andrew andy angela
  anna anne anthony antonio ashley barack barbara benjamin bernie beth betsy betty bobby boris
  brad brandon brenda brett brian bruce bryan carl carlos carol caroline catherine charles
  charlie cheryl chris christine christopher chuck cindy claire clarence colin craig cynthia dan
  dana daniel danny darren dave david debbie deborah dennis diana diane donald donna doug douglas
  dylan ed edward elise elizabeth ellen elon emily emma emmanuel eric erica ethan gavin george
  gerald gina giorgia greg gregory gretchen hakeem harold harry heather helen henry hillary
  howard ian ilhan ivanka jake james jamie jane janet jared jason jeff jeffrey jennifer jenny
  jeremy jerome jerry jessica jill jim jimmy joanna joe joel john johnny jon jonathan joseph josh
  joshua joyce juan judith judy julia julie justin kamala karen kari karl kate katherine
  kathleen kathy keir keith kelly ken kenneth kevin kim kimberly kirsten kristi kyle larry laura
  lauren linda lindsey lisa liz lori louis luke marco marcus maria marie marjorie martha martin
  mary matt matthew megan melania melissa michael michelle mike mitch mitt nancy natalie nathan
  neil nicholas nick nicole nigel nikki olivia omar pamela patrick paul pete peter phil philip
  rachel ralph randy raymond rebecca richard rick robert roger ron ronald ruth ryan sam samuel
  sandra sarah scott sean sergei sharon simon stephanie stephen steve steven susan tammy ted
  terry theresa thomas tim timothy todd tom tony travis tucker tulsi ursula valerie vanessa
  vladimir walter wendy william xavier zach`.split(/\s+/),
);

/** Words that end a place's name, not a person's: "George Town", "Elizabeth City". */
const PLACE_WORDS = new Set(
  `city town county village island islands bay beach falls springs valley lake river mountain
  mountains hills heights park port harbor harbour point creek coast station airport courthouse
  square bridge canal sea ocean gulf strait peninsula desert forest province state region district
  street road avenue hospital university college school stadium arena center centre hall prison
  base dam canyon cape sound`.split(/\s+/),
);

/** "Lebanon County": a US county named after a country, not the country. */
const COUNTY_WORDS = new Set(['county', 'parish', 'township', 'borough']);

/** "Iran-linked hackers", "US-led strikes": the country says who, not where it happened. */
const WHO_NOT_WHERE = new Set([
  'linked',
  'backed',
  'led',
  'made',
  'funded',
  'sponsored',
  'allied',
  'aligned',
  'owned',
  'built',
  'flagged',
  'registered',
  'controlled',
  'affiliated',
  'supported',
  'armed',
  'trained',
  'brokered',
  'operated',
  'friendly',
  'leaning',
  'inspired',
  'produced',
  'manufactured',
  'designed',
  'developed',
  'mediated',
  'bound',
  'style',
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
  // Drop possessives ("Indonesia's" → "Indonesia") and keep original case for acronym checks,
  // and what separates each word from the next ("Iran-linked", "Nancy, France").
  const folded = foldDiacritics(text.replace(/['\u2019]s\b/g, '').replace(/['\u2019]/g, ''));
  const original: string[] = [];
  const after: string[] = [];
  let end = 0;
  for (const m of folded.matchAll(/[A-Za-z0-9]+/g)) {
    if (original.length) after.push(folded.slice(end, m.index));
    original.push(m[0]);
    end = m.index + m[0].length;
  }
  after.push(folded.slice(end));
  const words = original.map((w) => w.toLowerCase());
  const used = new Array<boolean>(words.length).fill(false);
  const out: Entities = {
    countries: [],
    demonyms: [],
    places: [],
    regions: [],
    organizations: [],
    notPlaces: [],
    notCountries: [],
  };
  const push = <T>(arr: T[], v: T) => {
    if (!arr.includes(v)) arr.push(v);
  };
  // "Jim Jordan", "Nancy Pelosi": a first name, a space and a capitalised word are a person
  // (not "George Town": that word ends a place's name).
  const capital = (w: string) => /^[A-Z]/.test(w);
  const person = new Array<boolean>(words.length).fill(false);
  for (let i = 0; i + 1 < words.length; i++)
    if (
      FIRST_NAMES.has(words[i]!) &&
      capital(original[i]!) &&
      /^ +$/.test(after[i]!) &&
      capital(original[i + 1]!) &&
      !PLACE_WORDS.has(words[i + 1]!)
    )
      person[i] = person[i + 1] = true;
  // Longest match first so "south china sea" beats "china", "north korea" beats "korea".
  for (let n = lexicon.maxN; n >= 1; n--) {
    for (let i = 0; i + n <= words.length; i++) {
      if (used.slice(i, i + n).some(Boolean)) continue;
      const phrase = words.slice(i, i + n).join(' ');
      // Short acronyms ("US", "UN", "WHO") only count when written in capitals.
      if (n === 1 && AMBIGUOUS.has(phrase) && original[i] !== original[i]!.toUpperCase()) continue;
      const region = lexicon.regions.get(phrase);
      const country = lexicon.countries.get(phrase);
      const demonym = DEMONYMS[phrase];
      const org = ORGANIZATIONS[phrase];
      const place = lexicon.places.get(phrase);
      const kind = region
        ? 'region'
        : country && countryByIso3(country)
          ? 'country'
          : demonym
            ? 'demonym'
            : org
              ? 'org'
              : place
                ? 'place'
                : null;
      if (!kind) continue;
      const last = i + n - 1;
      const next = words[last + 1];
      // Only a country: a city's county is usually around it ("Los Angeles County").
      const county =
        kind === 'country' &&
        next !== undefined &&
        COUNTY_WORDS.has(next) &&
        /^\s+$/.test(after[last]!);
      const otherUse =
        kind !== 'org' &&
        // Every word of it: "San Antonio" stays a place though "Antonio Community…" looks like a name.
        (person.slice(i, last + 1).every(Boolean) ||
          county ||
          (next !== undefined &&
            /^[-\u2010\u2011]$/.test(after[last]!) &&
            WHO_NOT_WHERE.has(next)));
      if (otherUse) {
        const iso3 = kind === 'country' ? country! : kind === 'demonym' ? demonym! : null;
        if (iso3) push(out.notCountries, iso3);
        // A county leaves its name to the US town named like it ("Lebanon, Pennsylvania").
        if (!county) push(out.notPlaces, normalizeName(phrase));
        for (let j = i; j <= last + (county ? 1 : 0); j++) used[j] = true;
        continue;
      }
      if (kind === 'region') push(out.regions, region!);
      else if (kind === 'country') push(out.countries, country!);
      else if (kind === 'demonym') push(out.demonyms, demonym!);
      else if (kind === 'org') push(out.organizations, org!);
      else push(out.places, place!);
      for (let j = i; j <= last; j++) used[j] = true;
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

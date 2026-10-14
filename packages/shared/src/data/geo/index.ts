/**
 * Gazetteer built from Natural Earth (public domain) plus a short list of marine/regional
 * features. Used for search, fly-to resolution and deterministic location extraction.
 */
import countriesJson from './countries.json';
import placesJson from './places.json';

export interface CountryEntry {
  iso3: string;
  name: string;
  nameLong: string;
  formal: string | null;
  continent: string | null;
  sovereign: string | null;
  bbox: [number, number, number, number];
  label: [number, number] | null;
}

export interface PlaceEntry {
  name: string;
  ascii: string | null;
  country: string | null;
  iso3: string;
  admin1: string | null;
  lat: number;
  lon: number;
  rank: number;
  pop: number;
  capital: boolean;
}

export interface RegionEntry {
  name: string;
  aliases: string[];
  lat: number;
  lon: number;
  altitudeM: number;
  kind: 'sea' | 'strait' | 'region' | 'island-group';
}

export const COUNTRIES = countriesJson as CountryEntry[];
export const PLACES = placesJson as PlaceEntry[];

/**
 * Marine and regional features not in the populated-places data. Centres are approximate
 * camera targets (precision: region), not boundaries.
 */
export const REGIONS: RegionEntry[] = [
  {
    name: 'South China Sea',
    aliases: ['scs'],
    lat: 12.5,
    lon: 113.5,
    altitudeM: 3_200_000,
    kind: 'sea',
  },
  {
    name: 'Taiwan Strait',
    aliases: ['formosa strait'],
    lat: 24.3,
    lon: 119.6,
    altitudeM: 900_000,
    kind: 'strait',
  },
  { name: 'East China Sea', aliases: [], lat: 29.5, lon: 125.5, altitudeM: 2_000_000, kind: 'sea' },
  { name: 'Black Sea', aliases: [], lat: 43.2, lon: 34.0, altitudeM: 1_800_000, kind: 'sea' },
  { name: 'Red Sea', aliases: [], lat: 20.0, lon: 38.5, altitudeM: 2_400_000, kind: 'sea' },
  {
    name: 'Mediterranean Sea',
    aliases: ['mediterranean'],
    lat: 35.5,
    lon: 18.0,
    altitudeM: 4_000_000,
    kind: 'sea',
  },
  { name: 'Baltic Sea', aliases: [], lat: 58.0, lon: 20.0, altitudeM: 2_000_000, kind: 'sea' },
  {
    name: 'Persian Gulf',
    aliases: ['arabian gulf', 'gulf'],
    lat: 26.8,
    lon: 51.5,
    altitudeM: 1_500_000,
    kind: 'sea',
  },
  {
    name: 'Strait of Hormuz',
    aliases: ['hormuz'],
    lat: 26.6,
    lon: 56.4,
    altitudeM: 600_000,
    kind: 'strait',
  },
  {
    name: 'Korean Peninsula',
    aliases: ['korea'],
    lat: 37.8,
    lon: 127.5,
    altitudeM: 1_500_000,
    kind: 'region',
  },
  {
    name: 'Spratly Islands',
    aliases: ['spratlys'],
    lat: 10.0,
    lon: 114.3,
    altitudeM: 1_200_000,
    kind: 'island-group',
  },
  {
    name: 'Paracel Islands',
    aliases: ['paracels'],
    lat: 16.5,
    lon: 111.9,
    altitudeM: 700_000,
    kind: 'island-group',
  },
  {
    name: 'Scarborough Shoal',
    aliases: ['huangyan island', 'bajo de masinloc'],
    lat: 15.15,
    lon: 117.76,
    altitudeM: 400_000,
    kind: 'island-group',
  },
  {
    name: 'Crimea',
    aliases: ['crimean peninsula'],
    lat: 45.3,
    lon: 34.4,
    altitudeM: 700_000,
    kind: 'region',
  },
  {
    name: 'Donbas',
    aliases: ['donbass'],
    lat: 48.0,
    lon: 38.0,
    altitudeM: 900_000,
    kind: 'region',
  },
  { name: 'Kashmir', aliases: [], lat: 34.5, lon: 75.5, altitudeM: 1_200_000, kind: 'region' },
  { name: 'Sahel', aliases: [], lat: 15.0, lon: 2.0, altitudeM: 5_000_000, kind: 'region' },
  { name: 'Middle East', aliases: [], lat: 29.0, lon: 42.0, altitudeM: 5_000_000, kind: 'region' },
  { name: 'Balkans', aliases: [], lat: 43.5, lon: 20.5, altitudeM: 1_800_000, kind: 'region' },
  { name: 'Caucasus', aliases: [], lat: 42.0, lon: 45.0, altitudeM: 1_500_000, kind: 'region' },
  {
    name: 'Sulawesi',
    aliases: ['celebes'],
    lat: -1.8,
    lon: 120.5,
    altitudeM: 1_300_000,
    kind: 'island-group',
  },
  { name: 'Java', aliases: [], lat: -7.4, lon: 110.2, altitudeM: 1_300_000, kind: 'island-group' },
  {
    name: 'Sumatra',
    aliases: [],
    lat: -0.5,
    lon: 101.5,
    altitudeM: 1_800_000,
    kind: 'island-group',
  },
  { name: 'Normandy', aliases: [], lat: 49.1, lon: -0.4, altitudeM: 500_000, kind: 'region' },
  { name: 'Rhineland', aliases: [], lat: 50.5, lon: 7.0, altitudeM: 600_000, kind: 'region' },
  { name: 'Sudetenland', aliases: [], lat: 50.4, lon: 14.5, altitudeM: 800_000, kind: 'region' },
  { name: 'Siberia', aliases: [], lat: 62.0, lon: 100.0, altitudeM: 7_000_000, kind: 'region' },
];

export function normalizeName(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Common alternative names → Natural Earth country names. */
const COUNTRY_ALIASES: Record<string, string> = {
  usa: 'USA',
  us: 'USA',
  'united states': 'United States of America',
  america: 'United States of America',
  uk: 'GBR',
  britain: 'GBR',
  'great britain': 'GBR',
  england: 'GBR',
  'united kingdom': 'GBR',
  russia: 'RUS',
  'south korea': 'KOR',
  'north korea': 'PRK',
  'czech republic': 'CZE',
  czechia: 'CZE',
  'ivory coast': 'CIV',
  burma: 'MMR',
  myanmar: 'MMR',
  'dr congo': 'COD',
  'democratic republic of the congo': 'COD',
  uae: 'ARE',
  'united arab emirates': 'ARE',
  prc: 'CHN',
  'mainland china': 'CHN',
  holland: 'NLD',
  turkiye: 'TUR',
  persia: 'IRN',
  'east timor': 'TLS',
  palestine: 'PSE',
  vietnam: 'VNM',
  'viet nam': 'VNM',
  laos: 'LAO',
  syria: 'SYR',
  iran: 'IRN',
  bosnia: 'BIH',
  'bosnia and herzegovina': 'BIH',
};

const countryByIso = new Map(COUNTRIES.map((c) => [c.iso3, c]));
const countryByName = new Map<string, CountryEntry>();
for (const c of COUNTRIES) {
  for (const n of [c.name, c.nameLong, c.formal, c.sovereign]) {
    if (n) countryByName.set(normalizeName(n), c);
  }
}

export function findCountry(query: string): CountryEntry | null {
  const q = query.trim();
  if (/^[A-Z]{3}$/.test(q) && countryByIso.has(q)) return countryByIso.get(q)!;
  const n = normalizeName(q);
  const alias = COUNTRY_ALIASES[n];
  if (alias) return countryByIso.get(alias) ?? countryByName.get(normalizeName(alias)) ?? null;
  return countryByName.get(n) ?? null;
}

export function countryByIso3(iso3: string): CountryEntry | null {
  return countryByIso.get(iso3) ?? null;
}

const placesByName = new Map<string, PlaceEntry[]>();
for (const p of PLACES) {
  for (const n of [p.name, p.ascii]) {
    if (!n) continue;
    const k = normalizeName(n);
    const list = placesByName.get(k) ?? [];
    if (!list.includes(p)) list.push(p);
    placesByName.set(k, list);
  }
}

/** Best populated place for a name (largest / most prominent first). */
export function findPlace(query: string): PlaceEntry | null {
  const list = placesByName.get(normalizeName(query));
  return list?.[0] ?? null;
}

export function findRegion(query: string): RegionEntry | null {
  const n = normalizeName(query);
  return (
    REGIONS.find(
      (r) => normalizeName(r.name) === n || r.aliases.some((a) => normalizeName(a) === n),
    ) ?? null
  );
}

export interface ResolvedPlace {
  name: string;
  lat: number;
  lon: number;
  altitudeM: number;
  kind: 'country' | 'place' | 'region';
  iso3?: string;
}

/** Resolve a free-text place name: regions → countries → populated places. */
export function resolvePlace(query: string): ResolvedPlace | null {
  const region = findRegion(query);
  if (region)
    return {
      name: region.name,
      lat: region.lat,
      lon: region.lon,
      altitudeM: region.altitudeM,
      kind: 'region',
    };
  const country = findCountry(query);
  if (country) {
    const [w, s, e, n] = country.bbox;
    const span = Math.max(n - s, Math.min(e - w, 60) * 0.6);
    const [lon, lat] = country.label ?? [(w + e) / 2, (s + n) / 2];
    return {
      name: country.name,
      lat,
      lon,
      altitudeM: Math.min(9_000_000, Math.max(400_000, span * 111_000 * 2)),
      kind: 'country',
      iso3: country.iso3,
    };
  }
  const place = findPlace(query);
  if (place)
    return {
      name: place.name,
      lat: place.lat,
      lon: place.lon,
      altitudeM: 120_000,
      kind: 'place',
      iso3: place.iso3,
    };
  return null;
}

/**
 * Colours for filling countries on the globe (the Territories layer). Muted, so the imagery
 * still reads through them. The powers whose names recur through history keep one colour
 * across their versions, colonies and occupation regimes ("French State", "French West
 * Africa" → France's blue); everything else gets a stable hue from its name.
 */

/** Keys the front theatres use for their sides (packages/shared FrontTheatre.colorA/B). */
export const POWER_COLORS: Record<string, string> = {
  germany: '#7f8894',
  ussr: '#c4615c',
  russia: '#6f9f78',
  uk: '#cf8fa6',
  france: '#6c8fd6',
  italy: '#79b38a',
  japan: '#f0c64a',
  china: '#4aa3a8',
  usa: '#5c9ec7',
  allies: '#5c9ec7',
  spain: '#dba45f',
  portugal: '#56ad9c',
  netherlands: '#e59c6c',
  belgium: '#b49bd9',
  ottoman: '#c2a25a',
  austria: '#d8c59b',
  poland: '#d893b6',
  finland: '#a3c8ea',
  'north-korea': '#c4615c',
  'south-korea': '#5c9ec7',
  confederacy: '#a8a29a',
  // Told apart from the neighbours they are most often drawn beside.
  rsi: '#7f9c8c',
  hungary: '#d79a72',
  romania: '#e0cf6e',
  bulgaria: '#a56aa8',
  yugoslavia: '#5f86b5',
  greece: '#74b9e0',
  denmark: '#b85c5c',
  // Sides of wars fought inside one country, and alliances (front theatres only).
  nationalists: '#5d6f8f',
  communists: '#d0605a',
  'north-vietnam': '#c96a5b',
  'balkan-league': '#8f79c2',
};

/** First match wins. Names are OpenHistoricalMap's. */
const RULES: Array<[RegExp, keyof typeof POWER_COLORS]> = [
  [/^(soviet union|ussr|union of soviet|russian soviet federative|soviet occupation)/i, 'ussr'],
  [/^(russian empire|russian republic|russian federation|russia\b)/i, 'russia'],
  [
    /^(german reich|german empire|german confederation|north german|germany\b|west germany|nazi germany|weimar|kingdom of prussia|prussia\b|generalgouvernement|general government of|reichskommissariat|bezirk bialystok|protectorate of bohemia|military administration in belgium|territory of the military commander|german[- ]occup|german occupation|german (new guinea|east africa|south west africa|kamerun|samoa))/i,
    'germany',
  ],
  [
    /^(american occupation|us occupation|us military|united states|commonwealth of the philippines)/i,
    'usa',
  ],
  [
    /^(united kingdom|great britain|british\b|company raj|anglo-egyptian|crown colony|palestine mandate|colony of (new south wales|victoria|queensland|tasmania|western australia|south australia|the straits|natal|the gold coast|ashanti)|gold coast colony|cape colony)/i,
    'uk',
  ],
  [
    /^(france\b|french\b|kingdom of france|first french|second french|indochinese (union|federation)|colony of (cochinchina|madagascar|middle congo|guadelupe|martinique)|la réunion|ubangi-shari)/i,
    'france',
  ],
  [
    /^(japan\b|empire of japan|japanese\b|manchukuo|mengjiang|hong kong occupied|philippine executive commission|second philippine republic|state of burma|empire of vietnam)/i,
    'japan',
  ],
  [/^italian social republic/i, 'rsi'],
  [
    /^(italy\b|italian\b|kingdom of italy|kingdom of sardinia|governorate of (montenegro|dalmatia)|trust territory of somaliland)/i,
    'italy',
  ],
  [/^(china\b|qing\b|republic of china|people's republic of china)/i, 'china'],
  [/^(spain\b|spanish\b|kingdom of spain|viceroyalty of|colony of the rio de oro)/i, 'spain'],
  [/^(portugal\b|portuguese\b|kingdom of portugal|province of (mozambique|angola))/i, 'portugal'],
  [
    /^(kingdom of the netherlands|netherlands\b|dutch\b|kingdom of holland|batavian)/i,
    'netherlands',
  ],
  [/^(belgium\b|belgian\b|congo free state)/i, 'belgium'],
  [/^(ottoman|turkey\b)/i, 'ottoman'],
  [/^(austria\b|austrian empire|austria-hungary|military frontier)/i, 'austria'],
  [
    /^(poland\b|polish\b|congress poland|duchy of warsaw|regency kingdom of poland|kingdom of poland|republic of poland)/i,
    'poland',
  ],
  [/^finland\b/i, 'finland'],
  [/^north korea\b/i, 'north-korea'],
  [
    /^(north vietnam|democratic republic of vietnam|provisional revolutionary government)/i,
    'north-vietnam',
  ],
  [/^south korea\b/i, 'south-korea'],
  [/^confederate states/i, 'confederacy'],
  [/^(kingdom of hungary|hungary\b|hungarian\b)/i, 'hungary'],
  [/^(kingdom of romania|romania\b|romanian\b|united principalities)/i, 'romania'],
  [
    /^(tsardom of bulgaria|principality of bulgaria|bulgaria\b|people's republic of bulgaria)/i,
    'bulgaria',
  ],
  [
    /^(kingdom of yugoslavia|yugoslavia\b|kingdom of serbs|socialist federal republic of yugoslavia|federal people's republic of yugoslavia|democratic federal yugoslavia)/i,
    'yugoslavia',
  ],
  [/^(greece\b|kingdom of greece|hellenic)/i, 'greece'],
  [/^(denmark\b|danish\b|greenland\b|faroe)/i, 'denmark'],
];

/** Hues for countries without a colour of their own: none near the Soviet red. */
const HUES = [26, 38, 50, 64, 80, 96, 135, 152, 168, 184, 198, 214, 232, 250, 266, 282, 298, 314];

/** A stable muted colour from any text. */
function hashed(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  // Two lightness bands keep neighbours with close hues apart.
  const hue = HUES[h % HUES.length]!;
  return `hsl(${hue} ${30 + ((h >>> 9) % 12)}% ${54 + ((h >>> 16) % 2) * 9}%)`;
}

/** Words that say what kind of state it is, not which: versions of a country share a colour. */
const KIND =
  /\b(kingdom|republic|empire|state|union|federation|federal|democratic|people'?s|socialist|soviet|grand|duchy|principality|sultanate|emirate|khedivate|khanate|imamate|regency|tsardom|dominion|commonwealth|colony|protectorate|mandate|territory|province|free|first|second|third|united|of|the|and)\b/g;

/** The fill colour of a country of the time, by its name. */
export function polityColor(name: string): string {
  for (const [pattern, key] of RULES) if (pattern.test(name)) return POWER_COLORS[key]!;
  const core = name.toLowerCase().replace(KIND, ' ').replace(/\s+/g, ' ').trim();
  return hashed(core || name.toLowerCase());
}

/** A front theatre side's colour. */
export function sideColor(key: string): string {
  return POWER_COLORS[key] ?? hashed(key);
}

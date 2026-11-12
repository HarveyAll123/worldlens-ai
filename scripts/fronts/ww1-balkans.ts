import type { TheatreSource } from './types';

/**
 * Serbia, Montenegro, Albania and the Macedonian front, 28 July 1914 – 11 November 1918: the
 * Austrian invasions of 1914 thrown back, the conquest of Serbia in the autumn of 1915 (with
 * Bulgaria), of Montenegro and northern Albania in January 1916, the front held north of
 * Salonika, and the Allied breakthrough of September 1918. Side A is the Central Powers.
 */
export const WW1_BALKANS: TheatreSource = {
  id: 'ww1-balkan-front',
  name: 'Serbian and Macedonian fronts',
  war: 'First World War',
  conflictId: 'conflict-world-war-i',
  sideA: 'Austria-Hungary, Germany and Bulgaria',
  sideB: 'Serbia, Montenegro and the Allied Army of the Orient',
  start: '1914-07-28',
  end: '1918-11-11',
  horizonDays: 20,
  maxEdgeKm: 330,
  colorA: 'germany',
  colorB: 'allies',
  // Not Bulgaria: neutral until October 1915, and nothing of it was ever occupied.
  politiesA: '^austria-hungary',
  politiesB:
    '^(kingdom of serbia|serbia|kingdom of montenegro|montenegro|principality of albania|albania|kingdom of greece|greece)',
  sources: [
    'https://en.wikipedia.org/wiki/Serbian_campaign',
    'https://en.wikipedia.org/wiki/Montenegrin_campaign',
    'https://en.wikipedia.org/wiki/Macedonian_front',
    'https://en.wikipedia.org/wiki/Vardar_offensive',
  ],
  places: `
# --- Serbia
Belgrade | @44.8,20.47 | 1914-12-02..1914-12-15, 1915-10-09..1918-11-01
Šabac | @44.75,19.69 | 1914-11-10..1914-12-12, 1915-10-10..1918-11-01
Valjevo | @44.27,19.89 | 1914-11-15..1914-12-08, 1915-10-23..1918-10-30
Smederevo | @44.66,20.93 | 1915-10-11..1918-10-30
Požarevac | @44.62,21.19 | 1915-10-13..1918-10-28
Negotin | @44.23,22.53 | 1915-10-24..1918-10-19
Zaječar | @43.9,22.28 | 1915-10-27..1918-10-19
Kragujevac | @44.01,20.92 | 1915-11-01..1918-10-26
Užice | @43.86,19.84 | 1915-11-03..1918-10-25
Kraljevo | @43.72,20.69 | 1915-11-06..1918-10-22
Kruševac | @43.58,21.33 | 1915-11-07..1918-10-18
Niš | @43.32,21.9 | 1915-11-05..1918-10-12
Pirot | @43.15,22.59 | 1915-10-28..1918-10-14
Leskovac | @43.0,21.95 | 1915-11-10..1918-10-07
Vranje | @42.55,21.9 | 1915-10-17..1918-10-05
Novi Pazar | @43.14,20.52 | 1915-11-20..1918-10-14
Mitrovica | @42.89,20.87 | 1915-11-23..1918-10-13
Priština | @42.66,21.17 | 1915-11-23..1918-10-10
Prizren | @42.21,20.74 | 1915-11-29..1918-10-11
Kumanovo | @42.13,21.72 | 1915-10-20..1918-09-30
Üsküb | @42.0,21.43 | 1915-10-22..1918-09-29
Veles | @41.72,21.77 | 1915-10-20..1918-09-25
Štip | @41.74,22.2 | 1915-10-21..1918-09-25
Prilep | @41.35,21.55 | 1915-11-16..1918-09-23
Ohrid | @41.12,20.8 | 1915-12-05..1918-09-30
Monastir | @41.03,21.33 | 1915-12-04..1916-11-19
Gevgelija | @41.14,22.5 | 1915-12-11..1918-09-21
Doiran | @41.18,22.72 | 1915-12-12..1918-09-22
# --- Montenegro and Albania
Pljevlja | @43.36,19.36 | 1915-12-02..1918-10-20
Cetinje | @42.39,18.92 | 1916-01-13..1918-11-04
Nikšić | @42.77,18.94 | 1916-01-20..1918-11-02
Podgorica | @42.44,19.26 | 1916-01-23..1918-10-31
Scutari | @42.07,19.51 | 1916-01-23..1918-10-30
Tirana | @41.33,19.82 | 1916-02-09..1918-10-15
Durazzo | @41.32,19.45 | 1916-02-27..1918-10-14
Elbasan | @41.11,20.08 | 1916-02-01..1918-10-07
Berat | @40.7,19.95 | 1916-02-17..1918-10-01
Valona | @40.47,19.49 | -
Gjirokastër | @40.08,20.14 | -
Korçë | @40.62,20.78 | -
# --- Greece: the front north of Salonika, and eastern Macedonia under Bulgaria
Florina | @40.78,21.41 | 1916-08-18..1916-09-17
Seres | @41.09,23.55 | 1916-08-25..1918-10-02
Drama | @41.15,24.15 | 1916-08-25..1918-10-03
Kavala | @40.94,24.41 | 1916-09-11..1918-09-30
Salonika | @40.64,22.94 | -
Edessa | @40.8,22.05 | -
Kozani | @40.3,21.79 | -
Larissa | @39.64,22.42 | -
Thasos | @40.78,24.71 | -
Stavros | @40.66,23.7 | -
Karyes | @40.26,24.24 | -
# --- Austria-Hungary and Bulgaria
Sarajevo | @43.85,18.4 | <..>
Mostar | @43.34,17.81 | <..>
Ragusa | @42.65,18.09 | <..>
Cattaro | @42.42,18.77 | <..>
Zvornik | @44.39,19.1 | <..>
Semlin | @44.84,20.4 | <..>
Syrmian Mitrovica | @44.97,19.61 | <..>
Temesvár | @45.76,21.23 | <..>
Orsova | @44.72,22.4 | <..>
Vidin | @43.99,22.88 | 1915-10-14..>
Sofia | @42.7,23.32 | 1915-10-14..>
Kyustendil | @42.28,22.69 | 1915-10-14..>
Strumica | @41.44,22.64 | 1915-10-14..1918-09-26
Petrich | @41.4,23.21 | 1915-10-14..>
`,
};

import type { TheatreSource } from './types';

/**
 * The Caucasus front, 1 November 1914 – 30 October 1918: the Russian conquest of Erzurum,
 * Trebizond and Erzincan in 1916, and — after the revolution dissolved the Russian army — the
 * Ottoman return and the advance to Kars, Batum and Baku in 1918. Side A is the Ottoman
 * Empire.
 */
export const WW1_CAUCASUS: TheatreSource = {
  id: 'ww1-caucasus-front',
  name: 'Caucasus front',
  war: 'First World War',
  conflictId: 'conflict-world-war-i',
  sideA: 'Ottoman Empire',
  sideB: 'Russia (from 1918 Armenia, Georgia and the Baku Commune)',
  start: '1914-11-01',
  end: '1918-10-30',
  horizonDays: 30,
  maxEdgeKm: 520,
  colorA: 'ottoman',
  colorB: 'russia',
  politiesA: '^ottoman empire',
  politiesB:
    '^(russian empire|russian republic|russian soviet federative|transcaucasian|armenia|azerbaijan|georgia|democratic republic of (armenia|georgia|azerbaijan))',
  sources: [
    'https://en.wikipedia.org/wiki/Caucasus_campaign',
    'https://en.wikipedia.org/wiki/Erzurum_offensive',
    'https://en.wikipedia.org/wiki/Trebizond_campaign',
    'https://en.wikipedia.org/wiki/Battle_of_Baku',
  ],
  places: `
# --- Ottoman Armenia and the Black Sea coast
Rize | @41.02,40.52 | <..1916-03-08, 1918-03-02..>
Trebizond | @41.0,39.72 | <..1916-04-18, 1918-02-24..>
Bayburt | @40.26,40.23 | <..1916-07-16, 1918-02-21..>
Erzurum | @39.9,41.27 | <..1916-02-16, 1918-03-12..>
Erzincan | @39.75,39.49 | <..1916-07-25, 1918-02-13..>
Muş | @38.73,41.49 | <..1916-02-18, 1917-05-01..>
Bitlis | @38.4,42.11 | <..1916-03-02, 1916-08-06..>
Van | @38.5,43.38 | <..1915-05-20, 1918-04-06..>
Samsun | @41.29,36.33 | <..>
Sivas | @39.75,37.02 | <..>
Harput | @38.67,39.22 | <..>
Diyarbekir | @37.91,40.24 | <..>
Siirt | @37.93,41.94 | <..>
Cizre | @37.33,42.19 | <..>
Hakkari | @37.57,43.74 | <..>
# --- Russian Transcaucasia
Ardahan | @41.11,42.7 | 1918-04-03..>
Sarikamish | @40.33,42.59 | 1918-04-05..>
Batum | @41.65,41.64 | 1918-04-14..>
Kars | @40.6,43.1 | 1918-04-25..>
Alexandropol | @40.79,43.85 | 1918-05-15..>
Elisabethpol | @40.68,46.36 | 1918-06-10..>
Nakhichevan | @39.21,45.41 | 1918-07-20..>
Baku | @40.4,49.87 | 1918-09-15..>
Derbent | @42.06,48.29 | 1918-10-06..>
Erivan | @40.18,44.51 | -
Tiflis | @41.72,44.79 | -
Kutais | @42.27,42.7 | -
Poti | @42.15,41.67 | -
Vladikavkaz | @43.02,44.68 | -
`,
};

/**
 * Mesopotamia, Sinai, Palestine, Syria and the Hejaz, 6 November 1914 – 30 October 1918: the
 * British advance up the Tigris (with the surrender at Kut), the crossing of Sinai, Gaza and
 * Jerusalem in 1917, Megiddo and the ride to Aleppo in 1918, and the Arab Revolt down the
 * Hejaz railway. Side A is the Ottoman Empire.
 */
export const WW1_MIDDLE_EAST: TheatreSource = {
  id: 'ww1-middle-east',
  name: 'Mesopotamian and Palestine fronts',
  war: 'First World War',
  conflictId: 'conflict-world-war-i',
  sideA: 'Ottoman Empire',
  sideB: 'British Empire and the Arab Revolt',
  start: '1914-11-06',
  end: '1918-10-30',
  horizonDays: 30,
  maxEdgeKm: 700,
  colorA: 'ottoman',
  colorB: 'uk',
  politiesA: '^ottoman empire',
  politiesB: '^(sultanate of egypt|khedivate of egypt|egypt)',
  sources: [
    'https://en.wikipedia.org/wiki/Mesopotamian_campaign',
    'https://en.wikipedia.org/wiki/Sinai_and_Palestine_campaign',
    'https://en.wikipedia.org/wiki/Arab_Revolt',
    'https://en.wikipedia.org/wiki/Battle_of_Megiddo_(1918)',
  ],
  places: `
# --- Mesopotamia
Fao | @29.98,48.47 | <..1914-11-08
Basra | @30.51,47.81 | <..1914-11-22
Qurna | @31.02,47.43 | <..1914-12-09
Amara | @31.84,47.15 | <..1915-06-03
Nasiriyah | @31.04,46.26 | <..1915-07-25
Kut | @32.51,45.82 | <..1915-09-28, 1916-04-29..1917-02-24
Baghdad | @33.31,44.37 | <..1917-03-11
Samarra | @34.2,43.87 | <..1917-04-24
Ramadi | @33.43,43.3 | <..1917-09-29
Tikrit | @34.6,43.68 | <..1917-11-05
Khanaqin | @34.35,45.39 | <..1917-12-09
Hit | @33.64,42.83 | <..1918-03-09
Kirkuk | @35.47,44.39 | <..1918-05-07, 1918-05-24..1918-10-25
Mosul | @36.34,43.13 | <..>
Deir ez-Zor | @35.34,40.14 | <..>
# --- Sinai and Palestine
Nekhl | @29.9,33.75 | 1914-11-20..1917-02-18
Bir el Abd | @31.02,33.01 | 1915-01-20..1916-08-12
El Arish | @31.13,33.8 | <..1916-12-21
Rafah | @31.29,34.24 | <..1917-01-09
Beersheba | @31.25,34.79 | <..1917-10-31
Gaza | @31.5,34.47 | <..1917-11-07
Jaffa | @32.05,34.75 | <..1917-11-16
Jerusalem | @31.78,35.22 | <..1917-12-09
Jericho | @31.86,35.46 | <..1918-02-21
Nazareth | @32.7,35.3 | <..1918-09-20
Nablus | @32.22,35.26 | <..1918-09-21
Haifa | @32.82,34.99 | <..1918-09-23
Amman | @31.95,35.93 | <..1918-09-25
Deraa | @32.62,36.1 | <..1918-09-27
Damascus | @33.51,36.29 | <..1918-10-01
Beirut | @33.89,35.5 | <..1918-10-08
Tripoli | @34.44,35.84 | <..1918-10-13
Homs | @34.73,36.72 | <..1918-10-16
Hama | @35.13,36.75 | <..1918-10-20
Aleppo | @36.2,37.16 | <..1918-10-25
Aintab | @37.06,37.38 | <..>
Urfa | @37.16,38.79 | <..>
Adana | @37.0,35.32 | <..>
# --- The Hejaz
Jeddah | @21.49,39.19 | <..1916-06-16
Mecca | @21.42,39.83 | <..1916-07-09
Yanbu | @24.09,38.06 | <..1916-07-27
Taif | @21.27,40.42 | <..1916-09-22
Wejh | @26.24,36.46 | <..1917-01-24
Aqaba | @29.53,35.0 | <..1917-07-06
Ma'an | @30.19,35.73 | <..1918-09-23
Medina | @24.47,39.61 | <..>
# --- Egypt
Port Said | @31.27,32.3 | -
Ismailia | @30.6,32.27 | -
Suez | @29.97,32.55 | -
Cairo | @30.04,31.24 | -
Alexandria | @31.2,29.92 | -
El Tor | @28.24,33.62 | -
Hurghada | @27.26,33.81 | -
Quseir | @26.1,34.28 | -
Berenice | @23.91,35.47 | -
Asyut | @27.18,31.18 | -
Luxor | @25.69,32.64 | -
Aswan | @24.09,32.9 | -
`,
};

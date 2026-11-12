import type { TheatreSource } from './types';

/**
 * The Eastern Front of the First World War, 1 August 1914 – 11 November 1918: the Russian
 * invasions of East Prussia and Galicia, the Central Powers' advance of 1915, the Brusilov
 * offensive, and the German march to the Don after Brest-Litovsk (Romania, neutral until
 * August 1916, is its own theatre below). Side A is the Central Powers. Towns that changed hands more than
 * twice in the first winter are given their lasting changes only.
 */
export const WW1_EASTERN_FRONT: TheatreSource = {
  id: 'ww1-eastern-front',
  name: 'Eastern Front (1914–1918)',
  war: 'First World War',
  conflictId: 'conflict-world-war-i',
  sideA: 'Germany and Austria-Hungary',
  sideB: 'Russia',
  start: '1914-08-01',
  end: '1918-11-11',
  horizonDays: 30,
  maxEdgeKm: 520,
  colorA: 'germany',
  colorB: 'russia',
  politiesA:
    '^(german reich|german empire|austria-hungary|general government of|regency kingdom of poland)',
  politiesB:
    '^(russian empire|russian republic|russian soviet federative|ukraine|ukrainian|belarusian|estonia|latvia|lithuania)',
  sources: [
    'https://en.wikipedia.org/wiki/Eastern_Front_(World_War_I)',
    'https://en.wikipedia.org/wiki/Great_Retreat_(Russia)',
    'https://en.wikipedia.org/wiki/Brusilov_offensive',
    'https://en.wikipedia.org/wiki/Operation_Faustschlag',
  ],
  places: `
# --- Germany and Austria-Hungary (with the Russian occupations)
Königsberg | @54.71,20.51 | <..>
Danzig | @54.35,18.65 | <..>
Thorn | @53.01,18.6 | <..>
Posen | @52.41,16.93 | <..>
Breslau | @51.11,17.03 | <..>
Memel | @55.71,21.13 | <..>
Tilsit | @55.08,21.88 | <..1914-08-25, 1914-09-12..>
Insterburg | @54.63,21.8 | <..1914-08-24, 1914-09-11..>
Gumbinnen | @54.59,22.2 | <..1914-08-20, 1914-09-12..1914-11-10, 1915-02-12..>
Lyck | @53.83,22.36 | <..1914-08-20, 1914-09-11..1914-11-07, 1915-02-14..>
Cracow | @50.06,19.94 | <..>
Tarnów | @50.01,20.99 | <..1914-11-10, 1915-05-06..>
Rzeszów | @50.04,22.0 | <..1914-09-21, 1915-05-13..>
Jaroslau | @50.02,22.68 | <..1914-09-21, 1915-05-15..>
Sanok | @49.56,22.2 | <..1914-09-26, 1915-05-10..>
Przemyśl | @49.78,22.77 | <..1915-03-22, 1915-06-03..>
Lemberg | @49.84,24.03 | <..1914-09-03, 1915-06-22..>
Brody | @50.08,25.15 | <..1914-08-22, 1915-09-01..1916-07-28, 1917-07-27..>
Tarnopol | @49.55,25.59 | <..1914-08-23, 1917-07-25..>
Stanislau | @48.92,24.71 | <..1914-09-03, 1915-06-08..1916-08-10, 1917-07-24..>
Kolomea | @48.53,25.04 | <..1914-09-15, 1915-02-16..1916-06-29, 1917-07-27..>
Czernowitz | @48.29,25.94 | <..1914-09-02, 1915-02-17..1916-06-18, 1917-08-03..>
Kaschau | @48.72,21.26 | <..>
Munkács | @48.44,22.72 | <..>
Budapest | @47.5,19.04 | <..>
Debrecen | @47.53,21.63 | <..>
Szatmár | @47.79,22.89 | <..>
Dorna Watra | @47.35,25.36 | <..>
Kimpolung | @47.53,25.55 | <..1916-06-24, 1917-08-03..>
# --- Russian Poland and Lithuania
Kalisz | @51.76,18.09 | 1914-08-03..>
Częstochowa | @50.81,19.12 | 1914-08-03..>
Włocławek | @52.65,19.07 | 1914-11-12..>
Łódź | @51.76,19.46 | 1914-12-06..>
Płock | @52.55,19.7 | 1915-02-15..>
Suwałki | @54.1,22.93 | 1915-02-15..>
Libau | @56.51,21.01 | 1915-05-07..>
Kielce | @50.87,20.63 | 1915-05-12..>
Przasnysz | @53.02,20.88 | 1915-07-14..>
Radom | @51.4,21.15 | 1915-07-19..>
Schaulen | @55.93,23.31 | 1915-07-21..>
Lublin | @51.25,22.57 | 1915-07-30..>
Cholm | @51.14,23.47 | 1915-08-01..>
Mitau | @56.65,23.72 | 1915-08-01..>
Iwangorod | @51.56,21.85 | 1915-08-04..>
Ostrołęka | @53.08,21.57 | 1915-08-04..>
Warsaw | @52.23,21.01 | 1915-08-05..>
Łomża | @53.18,22.07 | 1915-08-10..>
Siedlce | @52.17,22.29 | 1915-08-12..>
Kovno | @54.9,23.9 | 1915-08-18..>
Nowogeorgiewsk | @52.44,20.68 | 1915-08-20..>
Wladimir-Wolynsk | @50.85,24.32 | 1915-08-20..>
Kowel | @51.21,24.71 | 1915-08-24..>
Brest-Litovsk | @52.1,23.7 | 1915-08-26..>
Białystok | @53.13,23.16 | 1915-08-26..>
Grodno | @53.68,23.83 | 1915-09-03..>
Pinsk | @52.12,26.1 | 1915-09-16..>
Wilna | @54.69,25.28 | 1915-09-18..>
Baranowicze | @53.13,26.02 | 1915-09-19..>
Nowogrodek | @53.6,25.83 | 1915-09-22..>
Lida | @53.89,25.3 | 1915-09-25..>
Luzk | @50.75,25.34 | 1915-09-28..1916-06-07, 1918-02-20..>
Dubno | @50.39,25.74 | 1915-09-08..1916-06-10, 1918-02-22..>
# --- Baltic, 1917–18
Riga | @56.95,24.1 | 1917-09-03..>
Jakobstadt | @56.5,25.86 | 1917-09-21..>
Arensburg | @58.25,22.5 | 1917-10-16..>
Dünaburg | @55.87,26.53 | 1918-02-18..>
Dorpat | @58.38,26.72 | 1918-02-24..>
Reval | @59.44,24.75 | 1918-02-25..>
Pskow | @57.82,28.33 | 1918-02-25..>
Narwa | @59.38,28.19 | 1918-03-04..>
# --- White Russia and Ukraine, 1918
Rowno | @50.62,26.25 | 1918-02-21..>
Minsk | @53.9,27.57 | 1918-02-21..>
Schitomir | @50.25,28.66 | 1918-02-24..>
Polozk | @55.49,28.79 | 1918-02-25..>
Orscha | @54.51,30.42 | 1918-02-28..>
Kiew | @50.45,30.52 | 1918-03-01..>
Gomel | @52.43,31.0 | 1918-03-01..>
Mogilew | @53.9,30.34 | 1918-03-01..>
Winniza | @49.23,28.47 | 1918-03-03..>
Tschernigow | @51.49,31.29 | 1918-03-12..>
Odessa | @46.48,30.72 | 1918-03-13..>
Nikolajew | @46.97,32.0 | 1918-03-17..>
Poltawa | @49.59,34.55 | 1918-03-29..>
Jekaterinoslaw | @48.46,35.05 | 1918-04-03..>
Cherson | @46.64,32.61 | 1918-04-05..>
Charkow | @49.99,36.23 | 1918-04-08..>
Belgorod | @50.6,36.59 | 1918-04-10..>
Simferopol | @44.95,34.1 | 1918-04-22..>
Lugansk | @48.57,39.3 | 1918-04-28..>
Sewastopol | @44.6,33.53 | 1918-05-01..>
Taganrog | @47.21,38.93 | 1918-05-01..>
Rostow | @47.23,39.72 | 1918-05-08..>
# --- Never reached
Petrograd | @59.94,30.31 | -
Nowgorod | @58.52,31.27 | -
Welikije Luki | @56.34,30.52 | -
Witebsk | @55.19,30.2 | -
Smolensk | @54.78,32.05 | -
Moscow | @55.75,37.62 | -
Brjansk | @53.24,34.37 | -
Kursk | @51.73,36.19 | -
Woronesch | @51.67,39.2 | -
Zarizyn | @48.71,44.51 | -
Nowotscherkassk | @47.42,40.09 | -
Jeisk | @46.71,38.27 | -
Tichorezk | @45.85,40.13 | -
Jekaterinodar | @45.04,38.98 | -
Noworossijsk | @44.72,37.77 | -
Stawropol | @45.04,41.97 | -
`,
};

/**
 * The Romanian campaign, 27 August 1916 – 11 November 1918: Romania's advance into
 * Transylvania, the Central Powers' counter-stroke over the Carpathians and the Danube, the
 * fall of Bucharest, and the front held on the Siret until the armistice. Side A is the
 * Central Powers.
 */
export const WW1_ROMANIA: TheatreSource = {
  id: 'ww1-romanian-front',
  name: 'Romanian front',
  war: 'First World War',
  conflictId: 'conflict-world-war-i',
  sideA: 'Germany, Austria-Hungary and Bulgaria',
  sideB: 'Romania and Russia',
  start: '1916-08-27',
  end: '1918-11-11',
  horizonDays: 20,
  maxEdgeKm: 380,
  colorA: 'germany',
  colorB: 'romania',
  politiesA: '^austria-hungary',
  politiesB: '^kingdom of romania',
  sources: [
    'https://en.wikipedia.org/wiki/Romania_in_World_War_I',
    'https://en.wikipedia.org/wiki/Battle_of_Transylvania',
    'https://en.wikipedia.org/wiki/Battle_of_Bucharest',
  ],
  places: `
# --- Austria-Hungary
Bistritz | @47.13,24.5 | <..>
Klausenburg | @46.77,23.6 | <..>
Maros-Vásárhely | @46.54,24.56 | <..>
Schäßburg | @46.22,24.79 | <..>
Csíkszereda | @46.36,25.8 | <..1916-09-07, 1916-10-10..>
Hermannstadt | @45.8,24.15 | <..>
Fogaras | @45.84,24.97 | <..1916-09-16, 1916-10-05..>
Kronstadt | @45.65,25.6 | <..1916-08-29, 1916-10-08..>
Petroșani | @45.42,23.37 | <..1916-08-29, 1916-09-20..>
Karánsebes | @45.41,22.22 | <..>
Lugos | @45.69,21.9 | <..>
Temesvár | @45.76,21.23 | <..>
Orsova | @44.72,22.4 | <..>
# --- Bulgaria
Sofia | @42.7,23.32 | <..>
Vidin | @43.99,22.88 | <..>
Lom | @43.83,23.24 | <..>
Plevna | @43.42,24.62 | <..>
Nikopol | @43.7,24.9 | <..>
Svishtov | @43.62,25.35 | <..>
Tarnovo | @43.08,25.63 | <..>
Rustschuk | @43.85,25.95 | <..>
Shumen | @43.27,26.92 | <..>
Varna | @43.21,27.91 | <..>
# --- Romania
Dobrich | @43.57,27.83 | 1916-09-04..>
Turtucaia | @44.05,26.61 | 1916-09-06..>
Silistra | @44.12,27.26 | 1916-09-09..>
Constanza | @44.18,28.63 | 1916-10-22..>
Cernavodă | @44.34,28.03 | 1916-10-25..>
Târgu Jiu | @45.03,23.27 | 1916-11-15..>
Craiova | @44.32,23.8 | 1916-11-21..>
Turnu Severin | @44.63,22.66 | 1916-11-23..>
Râmnicu Vâlcea | @45.1,24.37 | 1916-11-25..>
Slatina | @44.43,24.36 | 1916-11-27..>
Giurgiu | @43.89,25.97 | 1916-11-27..>
Pitești | @44.86,24.87 | 1916-11-29..>
Câmpulung | @45.27,25.05 | 1916-11-29..>
Târgoviște | @44.93,25.46 | 1916-12-03..>
Bukarest | @44.43,26.1 | 1916-12-06..>
Ploiești | @44.94,26.02 | 1916-12-06..>
Călărași | @44.2,27.33 | 1916-12-10..>
Buzău | @45.15,26.82 | 1916-12-15..>
Râmnicu Sărat | @45.38,27.05 | 1916-12-27..>
Brăila | @45.27,27.96 | 1917-01-05..>
Tulcea | @45.18,28.8 | 1917-01-06..>
Focșani | @45.7,27.18 | 1917-01-08..>
Galatz | @45.44,28.05 | -
Tecuci | @45.85,27.43 | -
Mărășești | @45.88,27.23 | -
Bârlad | @46.23,27.67 | -
Bacău | @46.57,26.91 | -
Piatra Neamț | @46.93,26.37 | -
Jassy | @47.16,27.59 | -
Botoșani | @47.75,26.67 | -
`,
};

import type { TheatreSource } from './types';

/**
 * Napoleon's invasion of Russia, 24 June – 14 December 1812: the Grande Armée's advance from
 * the Niemen to Moscow and its retreat. Side A is the Grande Armée (France and its allies).
 * Small towns on the road are dated by the main army's passage.
 */
export const NAPOLEON_1812: TheatreSource = {
  id: 'french-invasion-of-russia',
  name: 'French invasion of Russia',
  war: 'Napoleonic Wars',
  conflictId: 'conflict-napoleonic-wars',
  sideA: 'France and its allies (the Grande Armée)',
  sideB: 'Russia',
  start: '1812-06-24',
  end: '1812-12-14',
  horizonDays: 12,
  maxEdgeKm: 520,
  colorA: 'france',
  colorB: 'russia',
  politiesA: '^(duchy of warsaw|kingdom of prussia)',
  politiesB: '^russian empire',
  sources: [
    'https://en.wikipedia.org/wiki/French_invasion_of_Russia',
    'https://en.wikipedia.org/wiki/Battle_of_Smolensk_(1812)',
    'https://en.wikipedia.org/wiki/French_occupation_of_Moscow',
    'https://en.wikipedia.org/wiki/Battle_of_Berezina',
  ],
  places: `
# --- The road to Moscow and back
Kovno | @54.9,23.9 | 1812-06-24..1812-12-13
Vilna | @54.69,25.28 | 1812-06-28..1812-12-10
Grodno | @53.68,23.83 | 1812-06-30..>
Białystok | @53.13,23.16 | 1812-07-01..>
Minsk | @53.9,27.57 | 1812-07-08..1812-11-16
Borisov | @54.23,28.5 | 1812-07-12..1812-11-21
Mogilev | @53.9,30.34 | 1812-07-20..1812-11-21
Orsha | @54.51,30.42 | 1812-07-20..1812-11-20
Mitau | @56.65,23.72 | 1812-07-20..1812-12-08
Polotsk | @55.49,28.79 | 1812-07-26..1812-10-20
Vitebsk | @55.19,30.2 | 1812-07-28..1812-11-07
Krasny | @54.57,31.43 | 1812-08-14..1812-11-18
Smolensk | @54.78,32.05 | 1812-08-18..1812-11-17
Dorogobuzh | @54.92,33.3 | 1812-08-25..1812-11-07
Vyazma | @55.21,34.3 | 1812-08-29..1812-11-03
Gzhatsk | @55.55,35.0 | 1812-09-01..1812-11-01
Mozhaisk | @55.5,36.03 | 1812-09-09..1812-10-28
Moscow | @55.75,37.62 | 1812-09-14..1812-10-23
Maloyaroslavets | @55.01,36.46 | 1812-10-24..1812-10-26
# --- Never taken
Riga | @56.95,24.1 | -
Bobruisk | @53.14,29.22 | -
Pskov | @57.82,28.33 | -
Novgorod | @58.52,31.27 | -
Saint Petersburg | @59.94,30.31 | -
Tver | @56.86,35.9 | -
Kaluga | @54.51,36.26 | -
Tula | @54.19,37.62 | -
Bryansk | @53.24,34.37 | -
Chernigov | @51.49,31.29 | -
Kiev | @50.45,30.52 | -
Zhitomir | @50.25,28.66 | -
Lutsk | @50.75,25.34 | -
Kamenets | @48.68,26.58 | -
Pinsk | @52.12,26.1 | -
Mozyr | @52.05,29.24 | -
Kolomna | @55.1,38.75 | -
Ryazan | @54.63,39.74 | -
Vladimir | @56.13,40.4 | -
Yaroslavl | @57.63,39.87 | -
# --- The Duchy of Warsaw and Prussia
Tilsit | @55.08,21.88 | <..>
Königsberg | @54.71,20.51 | <..>
Suwałki | @54.1,22.93 | <..>
Warsaw | @52.23,21.01 | <..>
Lublin | @51.25,22.57 | <..>
`,
};

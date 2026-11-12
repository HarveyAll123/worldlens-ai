import type { TheatreSource } from './types';

/**
 * The Soviet invasion of eastern Poland, 17 September – 6 October 1939 (the Red Army crossed
 * the frontier sixteen days after Germany; the two met on the line of the Narew, Bug and San).
 * Side A is the Soviet Union. Towns the Germans had reached first and handed over (Brest,
 * Białystok, Lwów's surroundings) count from the day the Red Army took them over.
 */
export const WW2_POLAND_SOVIET: TheatreSource = {
  id: 'ww2-soviet-invasion-of-poland',
  name: 'Soviet invasion of Poland',
  war: 'Second World War',
  conflictId: 'conflict-world-war-ii',
  sideA: 'Soviet Union',
  sideB: 'Poland',
  start: '1939-09-17',
  end: '1939-10-06',
  horizonDays: 6,
  maxEdgeKm: 380,
  colorA: 'ussr',
  colorB: 'poland',
  politiesA: '^(soviet union|ussr)',
  politiesB: '^poland$',
  sources: [
    'https://en.wikipedia.org/wiki/Soviet_invasion_of_Poland',
    'https://en.wikipedia.org/wiki/German%E2%80%93Soviet_Boundary_and_Friendship_Treaty',
  ],
  places: `
# --- Taken by the Red Army
Wilno | @54.69,25.28 | 1939-09-19..>
Lida | @53.89,25.3 | 1939-09-19..>
Grodno | @53.68,23.83 | 1939-09-22..>
Nowogródek | @53.6,25.83 | 1939-09-18..>
Baranowicze | @53.13,26.02 | 1939-09-18..>
Wołkowysk | @53.16,24.45 | 1939-09-19..>
Białystok | @53.13,23.16 | 1939-09-22..>
Brześć | @52.1,23.7 | 1939-09-22..>
Kobryń | @52.21,24.36 | 1939-09-23..>
Pińsk | @52.12,26.1 | 1939-09-20..>
Sarny | @51.34,26.6 | 1939-09-21..>
Kowel | @51.21,24.71 | 1939-09-20..>
Włodzimierz | @50.85,24.32 | 1939-09-20..>
Łuck | @50.75,25.34 | 1939-09-19..>
Równe | @50.62,26.25 | 1939-09-18..>
Dubno | @50.39,25.74 | 1939-09-18..>
Tarnopol | @49.55,25.59 | 1939-09-17..>
Lwów | @49.84,24.03 | 1939-09-22..>
Stanisławów | @48.92,24.71 | 1939-09-19..>
Kołomyja | @48.53,25.04 | 1939-09-19..>
Stryj | @49.26,23.85 | 1939-09-22..>
Drohobycz | @49.35,23.51 | 1939-09-24..>
Sambor | @49.52,23.2 | 1939-09-26..>
Przemyśl | @49.78,22.77 | 1939-09-28..>
# --- West of the line: never Soviet
Suwałki | @54.1,22.93 | -
Łomża | @53.18,22.07 | -
Ostrołęka | @53.08,21.57 | -
Warsaw | @52.23,21.01 | -
Siedlce | @52.17,22.29 | -
Biała Podlaska | @52.03,23.12 | -
Lublin | @51.25,22.57 | -
Hrubieszów | @50.8,23.89 | -
Jarosław | @50.02,22.68 | -
Rzeszów | @50.04,22.0 | -
# --- Soviet ground
Polotsk | @55.49,28.79 | <..>
Minsk | @53.9,27.57 | <..>
Slutsk | @53.02,27.55 | <..>
Mozyr | @52.05,29.24 | <..>
Novograd-Volynsky | @50.59,27.62 | <..>
Zhitomir | @50.25,28.66 | <..>
Proskurov | @49.42,26.98 | <..>
Kamenets-Podolsk | @48.68,26.58 | <..>
`,
};

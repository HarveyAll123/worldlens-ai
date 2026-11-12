import type { TheatreSource } from './types';

/**
 * The Winter War, 30 November 1939 – 13 March 1940: the Soviet attack on Finland. The Red
 * Army took the Karelian Isthmus as far as the Mannerheim Line in December, was thrown back
 * at Tolvajärvi and Suomussalmi, broke the line at Summa in February and stood at Viipuri
 * when the peace was signed. Side A is the Soviet Union.
 */
export const WINTER_WAR: TheatreSource = {
  id: 'winter-war',
  name: 'Winter War front',
  war: 'Winter War',
  conflictId: 'conflict-world-war-ii',
  sideA: 'Soviet Union',
  sideB: 'Finland',
  start: '1939-11-30',
  end: '1940-03-13',
  horizonDays: 10,
  maxEdgeKm: 420,
  colorA: 'ussr',
  colorB: 'finland',
  politiesA: '^(soviet union|ussr)',
  politiesB: '^finland',
  sources: [
    'https://en.wikipedia.org/wiki/Winter_War',
    'https://en.wikipedia.org/wiki/Battle_of_Summa',
    'https://en.wikipedia.org/wiki/Battle_of_Suomussalmi',
    'https://en.wikipedia.org/wiki/Battle_of_Petsamo_(1939)',
  ],
  places: `
# --- Karelian Isthmus
Terijoki | @60.2,29.7 | 1939-12-01..>
Raivola | @60.25,29.52 | 1939-12-02..>
Rautu | @60.52,30.22 | 1939-12-04..>
Summa | @60.5,29.07 | 1940-02-15..>
Koivisto | @60.37,28.61 | 1940-02-23..>
Viipuri | @60.71,28.75 | -
Kiviniemi | @60.68,30.0 | -
Käkisalmi | @61.04,30.11 | -
Lappeenranta | @61.06,28.19 | -
Kotka | @60.47,26.95 | -
Helsinki | @60.17,24.94 | -
# --- Ladoga Karelia and the long frontier
Salmi | @61.37,31.87 | 1939-12-04..>
Pitkäranta | @61.57,31.48 | 1939-12-10..>
Suojärvi | @62.08,32.35 | 1939-12-02..>
Sortavala | @61.7,30.69 | -
Tolvajärvi | @62.28,31.5 | -
Ilomantsi | @62.67,30.93 | -
Joensuu | @62.6,29.76 | -
Lieksa | @63.32,30.02 | -
Kuhmo | @64.13,29.52 | -
Suomussalmi | @64.89,28.91 | 1939-12-07..1939-12-28
Kuusamo | @65.97,29.18 | -
Salla | @66.75,29.0 | 1939-12-09..>
Kemijärvi | @66.71,27.43 | -
Rovaniemi | @66.5,25.73 | -
Oulu | @65.01,25.47 | -
# --- The Arctic
Petsamo | @69.55,31.23 | 1939-12-02..>
Nautsi | @68.95,28.7 | 1939-12-18..>
Ivalo | @68.66,27.55 | -
Inari | @68.91,27.03 | -
Utsjoki | @69.91,27.03 | -
Sodankylä | @67.42,26.59 | -
Enontekiö | @68.38,23.63 | -
Tornio | @65.85,24.15 | -
# --- Soviet ground
Leningrad | @59.94,30.31 | <..>
Sestroretsk | @60.1,29.96 | <..>
Olonets | @60.98,32.97 | <..>
Petrozavodsk | @61.79,34.35 | <..>
Reboly | @63.83,30.82 | <..>
Ukhta | @65.2,31.17 | <..>
Kem | @64.95,34.6 | <..>
Kandalaksha | @67.16,32.41 | <..>
Murmansk | @68.97,33.07 | <..>
`,
};

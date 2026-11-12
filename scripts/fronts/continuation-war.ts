import type { TheatreSource } from './types';

/**
 * Finland (with German forces in Lapland) against the Soviet Union, 25 June 1941 – 19 September
 * 1944 (the Moscow Armistice). Side A is Finland and Germany. The war ended by armistice, so
 * the line simply ends: Finland's own cities are held throughout.
 */
export const CONTINUATION_WAR: TheatreSource = {
  id: 'ww2-finnish-front',
  name: 'Finnish front',
  war: 'World War II (Continuation War)',
  conflictId: 'conflict-world-war-ii',
  sideA: 'Finland and Germany',
  sideB: 'Soviet Union',
  start: '1941-06-25',
  end: '1944-09-19',
  maxEdgeKm: 520,
  colorA: 'finland',
  colorB: 'ussr',
  politiesA: '^finland',
  politiesB: '^(soviet union|ussr)',
  sources: [
    'https://en.wikipedia.org/wiki/Continuation_War',
    'https://en.wikipedia.org/wiki/Finnish_invasion_of_East_Karelia_(1941)',
    'https://en.wikipedia.org/wiki/Vyborg%E2%80%93Petrozavodsk_offensive',
  ],
  places: `
# --- Finland
Helsinki | | <..>
Turku | @60.45,22.27 | <..>
Mariehamn | @60.1,19.94 | <..>
Pori | @61.49,21.8 | <..>
Tampere | @61.5,23.76 | <..>
Jyväskylä | @62.24,25.75 | <..>
Vaasa | @63.1,21.62 | <..>
Oulu | @65.01,25.47 | <..>
Kemi | @65.74,24.56 | <..>
Paldiski | @59.35,24.05 | -
Tallinn | @59.44,24.75 | -
Kunda | @59.5,26.53 | -
Narva | @59.38,28.19 | -
Kärdla | @59.0,22.75 | -
Kronstadt | @59.99,29.77 | -
Volkhov | @59.92,32.35 | -
Tikhvin | @59.64,33.51 | -
Oshta | @60.87,35.5 | -
Vytegra | @61.0,36.45 | -
Belozersk | @60.03,37.79 | -
Kotka | | <..>
Lappeenranta | | <..>
Imatra | | <..>
Joensuu | | <..>
Ilomantsi | | <..>
Kajaani | | <..>
Kuusamo | | <..>
Rovaniemi | | <..>
Kemijärvi | | <..>
Ivalo | | <..>
Petsamo | Pechenga (urban-type settlement), Murmansk Oblast | <..>
Hanko | @59.83,22.97 | 1941-12-02..>
# --- The Karelian Isthmus and Ladoga Karelia
Vyborg | | 1941-08-29..1944-06-20
Koivisto | Primorsk, Leningrad Oblast | 1941-09-02..1944-06-18
Terijoki | Zelenogorsk, Saint Petersburg | 1941-08-31..1944-06-11
Rautu | @60.55,30.25 | 1941-08-11..1944-06-18
Kexholm | Priozersk | 1941-08-21..>
Sortavala | | 1941-08-15..>
Leningrad | Saint Petersburg | -
Sestroretsk | | -
Toksovo | | -
# --- East Karelia and the Svir
Pitkyaranta | | 1941-07-25..1944-07-10
Suoyarvi | | 1941-07-20..1944-07-11
Olonets | | 1941-09-05..1944-06-25
Podporozhye | @60.91,34.17 | 1941-09-08..1944-06-22
Petrozavodsk | | 1941-10-01..1944-06-28
Kondopoga | | 1941-11-03..1944-06-28
Medvezhyegorsk | | 1941-12-06..1944-06-23
Lodeynoye Pole | | -
Pudozh | | -
Segezha | | -
Belomorsk | | -
# --- The far north
Reboly | | 1941-07-08..>
Kestenga | | 1941-08-07..>
Alakurtti | @66.97,30.35 | 1941-09-01..1944-09-14
Salla | @66.78,29.02 | 1941-07-08..>
Kem | Kem, Russia | -
Loukhi | | -
Kandalaksha | | -
Murmansk | | -
# --- The limit of the advance, from the Arctic to Lake Ladoga and across the Karelian Isthmus
@line litsa = 69.63,32.05; 69.4,32.0; 69.1,31.7; 68.7,31.4; 68.2,31.3; 67.7,31.3; 67.3,31.3; 66.9,31.3; 66.6,31.3 | - | 1941-07-10..> | 25 | 9
@line kestenga = 66.6,31.3; 66.2,31.8; 65.9,32.0; 65.5,31.6; 65.2,30.95; 64.9,31.0; 64.6,31.3; 64.3,32.2; 64.08,32.9 | - | 1941-08-10..> | 22 | 8
@line maaselka = 64.08,32.9; 63.6,33.6; 63.2,34.3; 62.95,34.75; 62.85,34.95 | - | 1941-12-06..1944-06-23 | 18 | 7
@line svir = 61.0,35.6; 60.85,35.2; 60.7,34.6; 60.65,34.0; 60.72,33.6; 60.6,33.1; 60.52,32.9 | - | 1941-09-12..1944-06-22 | 16 | 6
@line isthmus = 60.15,29.95; 60.25,30.15; 60.35,30.4; 60.45,30.7; 60.52,30.95 | 1941-09-02..1944-06-10 | - | 10 | 4
`,
};

import type { TheatreSource } from './types';

/**
 * Austria-Hungary (with Germany at Caporetto) against Italy, 23 May 1915 – 4 November 1918.
 * Side A is Austria-Hungary.
 */
export const WW1_ITALIAN_FRONT: TheatreSource = {
  id: 'ww1-italian-front',
  name: 'Italian Front',
  war: 'World War I',
  conflictId: 'conflict-world-war-i',
  sideA: 'Austria-Hungary and Germany',
  sideB: 'Italy and its allies',
  start: '1915-05-23',
  end: '1918-11-04',
  horizonDays: 14,
  maxEdgeKm: 260,
  colorA: 'austria',
  colorB: 'italy',
  politiesA: '^(austria-hungary|austria)',
  politiesB: '^(italy|kingdom of italy)$',
  sources: [
    'https://en.wikipedia.org/wiki/Italian_front_(World_War_I)',
    'https://en.wikipedia.org/wiki/Battle_of_Caporetto',
    'https://en.wikipedia.org/wiki/Battle_of_Vittorio_Veneto',
  ],
  places: `
# --- Austria-Hungary
Innsbruck | | <..>
Bolzano | | <..>
Trento | | <..1918-11-03
Rovereto | | <..1918-11-02
Riva | Riva del Garda | <..>
Villach | | <..>
Tarvisio | | <..>
Ljubljana | | <..>
Tolmin | | <..>
Trieste | | <..1918-11-03
Gorizia | | <..1916-08-09, 1917-10-28..>
Caporetto | Kobarid | <..1915-05-24, 1917-10-24..>
Monfalcone | | <..1915-06-09, 1917-10-27..>
Cortina d'Ampezzo | | <..1915-05-29, 1917-11-05..>
# --- Italy
Asiago | @45.876,11.510 | 1916-05-28..1916-06-25, 1917-11-10..>
Cividale | Cividale del Friuli | 1917-10-27..>
Udine | | 1917-10-28..1918-11-03
Tolmezzo | | 1917-10-30..>
Pordenone | | 1917-11-06..1918-11-01
Portogruaro | | 1917-11-07..>
Oderzo | | 1917-11-08..1918-10-30
Conegliano | | 1917-11-08..1918-10-29
Vittorio | Vittorio Veneto | 1917-11-09..1918-10-30
San Donà di Piave | | 1917-11-09..1918-10-31
Belluno | | 1917-11-10..1918-11-01
Feltre | | 1917-11-12..1918-10-31
Venice | | -
Treviso | | -
Padua | | -
Vicenza | | -
Bassano | Bassano del Grappa | -
Schio | | -
Verona | | -
Brescia | | -
`,
};

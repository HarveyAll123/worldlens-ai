import type { TheatreSource } from './types';

/**
 * The Polish–Soviet War, 14 February 1919 – 18 October 1920: the Polish advance to Minsk and
 * the Berezina in 1919, Kiev in May 1920, the Red Army's march on Warsaw in July and August,
 * and the Polish counter-stroke to the armistice line. Side A is Soviet Russia (with Soviet
 * Ukraine). Kiev's months under the Whites in 1919 are not this war's and are left out; small
 * towns in the summer of 1920 are dated to within a few days.
 */
export const POLISH_SOVIET_WAR: TheatreSource = {
  id: 'polish-soviet-war',
  name: 'Polish–Soviet War front',
  war: 'Polish–Soviet War',
  conflictId: 'conflict-polish-soviet-war',
  sideA: 'Soviet Russia and Soviet Ukraine',
  sideB: 'Poland (with the Ukrainian People’s Republic in 1920)',
  start: '1919-02-14',
  end: '1920-10-18',
  horizonDays: 20,
  maxEdgeKm: 460,
  colorA: 'ussr',
  colorB: 'poland',
  politiesA:
    '^(russian soviet federative|ukrainian ssr|ukraine|belarusian|byelorussian|lithuanian)',
  politiesB: '^(poland|regency kingdom of poland)',
  sources: [
    'https://en.wikipedia.org/wiki/Polish%E2%80%93Soviet_War',
    'https://en.wikipedia.org/wiki/Kiev_offensive_(1920)',
    'https://en.wikipedia.org/wiki/Battle_of_Warsaw_(1920)',
    'https://en.wikipedia.org/wiki/Battle_of_the_Niemen_River',
  ],
  places: `
# --- Lithuania and White Russia
Dyneburg | @55.87,26.53 | <..1920-01-03
Wilno | @54.69,25.28 | <..1919-04-19, 1920-07-14..1920-08-26
Lida | @53.89,25.3 | <..1919-04-17, 1920-07-17..1920-09-28
Nowogródek | @53.6,25.83 | <..1919-04-18, 1920-07-18..1920-10-01
Baranowicze | @53.13,26.02 | <..1919-04-19, 1920-07-19..1920-09-30
Mołodeczno | @54.31,26.85 | <..1919-07-04, 1920-07-10..1920-10-12
Minsk | @53.9,27.57 | <..1919-08-08, 1920-07-11..>
Borysów | @54.23,28.5 | <..1919-08-18, 1920-07-07..>
Bobrujsk | @53.14,29.22 | <..1919-08-28, 1920-07-10..>
Pińsk | @52.12,26.1 | <..1919-03-05, 1920-07-26..1920-09-26
Mozyrz | @52.05,29.24 | <..1920-03-05, 1920-06-29..>
Grodno | @53.68,23.83 | 1920-07-19..1920-09-25
Połock | @55.49,28.79 | <..>
Witebsk | @55.19,30.2 | <..>
Mohylew | @53.9,30.34 | <..>
Homel | @52.43,31.0 | <..>
Smoleńsk | @54.78,32.05 | <..>
# --- The march on Warsaw, summer 1920
Białystok | @53.13,23.16 | 1920-07-28..1920-08-22
Brześć | @52.1,23.7 | 1920-08-01..1920-08-19
Łomża | @53.18,22.07 | 1920-08-02..1920-08-22
Biała Podlaska | @52.03,23.12 | 1920-08-02..1920-08-18
Ostrów Mazowiecka | @52.8,21.9 | 1920-08-04..1920-08-20
Ostrołęka | @53.08,21.57 | 1920-08-06..1920-08-23
Włodawa | @51.55,23.55 | 1920-08-07..1920-08-17
Ciechanów | @52.88,20.62 | 1920-08-08..1920-08-16
Mława | @53.11,20.38 | 1920-08-10..1920-08-20
Siedlce | @52.17,22.29 | 1920-08-11..1920-08-17
Wyszków | @52.59,21.46 | 1920-08-11..1920-08-18
Mińsk Mazowiecki | @52.18,21.57 | 1920-08-12..1920-08-17
Działdowo | @53.24,20.18 | 1920-08-13..1920-08-22
Radzymin | @52.42,21.18 | 1920-08-13..1920-08-15
Warsaw | @52.23,21.01 | -
Modlin | @52.44,20.68 | -
Płock | @52.55,19.7 | -
Włocławek | @52.65,19.07 | -
Toruń | @53.01,18.6 | -
Łódź | @51.76,19.46 | -
Dęblin | @51.56,21.85 | -
Lublin | @51.25,22.57 | -
Chełm | @51.14,23.47 | -
Zamość | @50.72,23.25 | -
# --- Volhynia, Galicia and Ukraine
Kowel | @51.21,24.71 | 1920-08-04..1920-09-12
Łuck | @50.75,25.34 | <..1919-05-16, 1920-07-12..1920-09-16
Równe | @50.62,26.25 | <..1919-08-13, 1920-07-04..1920-09-18
Dubno | @50.39,25.74 | <..1919-08-09, 1920-07-10..1920-09-17
Brody | @50.08,25.15 | 1920-07-26..1920-09-15
Tarnopol | @49.55,25.59 | 1920-07-26..1920-09-18
Lwów | @49.84,24.03 | -
Stryj | @49.26,23.85 | -
Stanisławów | @48.92,24.71 | -
Kołomyja | @48.53,25.04 | -
Czortków | @49.02,25.8 | 1920-07-30..1920-09-20
Płoskirów | @49.42,26.98 | <..1919-12-01, 1920-07-05..1920-09-23
Kamieniec Podolski | @48.68,26.58 | 1920-07-12..1920-09-20
Korosteń | @50.95,28.64 | <..1920-04-27, 1920-06-20..>
Żytomierz | @50.25,28.66 | <..1920-04-26, 1920-06-12..>
Berdyczów | @49.9,28.58 | <..1920-04-27, 1920-06-10..>
Winnica | @49.23,28.47 | <..1920-04-28, 1920-06-18..>
Biała Cerkiew | @49.8,30.11 | <..1920-05-08, 1920-06-10..>
Kijów | @50.45,30.52 | <..1920-05-07, 1920-06-12..>
Czernihów | @51.49,31.29 | <..>
Czerkasy | @49.44,32.06 | <..>
Odessa | @46.48,30.72 | <..>
`,
};

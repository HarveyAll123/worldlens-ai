import type { TheatreSource } from './types';

/**
 * Germany's invasion of Poland, 1 September – 6 October 1939. Side A is Germany. The Soviet
 * Union invaded from the east on 17 September; the places it took (and those Germany handed
 * over to it) are not German, so from late September the line is the German–Soviet
 * demarcation.
 */
export const WW2_POLAND_1939: TheatreSource = {
  id: 'ww2-invasion-of-poland',
  name: 'German invasion of Poland',
  war: 'World War II',
  conflictId: 'conflict-world-war-ii',
  sideA: 'Germany',
  sideB: 'Poland (from 17 September, also the Soviet zone)',
  start: '1939-09-01',
  end: '1939-10-06',
  horizonDays: 8,
  maxEdgeKm: 420,
  colorA: 'germany',
  colorB: 'poland',
  politiesA: '^(german reich|protectorate of bohemia|slovak)',
  politiesB: '^poland$',
  sources: [
    'https://en.wikipedia.org/wiki/Invasion_of_Poland',
    'https://en.wikipedia.org/wiki/Soviet_invasion_of_Poland',
  ],
  places: `
# --- Germany and Slovakia
Stettin | Szczecin | <..>
Schneidemühl | Piła | <..>
Frankfurt (Oder) | | <..>
Breslau | Wrocław | <..>
Oppeln | Opole | <..>
Gleiwitz | Gliwice | <..>
Ostrava | | <..>
Žilina | | <..>
Prešov | | <..>
Königsberg | Kaliningrad | <..>
Allenstein | Olsztyn | <..>
Elbing | Elbląg | <..>
Danzig | Gdańsk | <..>
# --- Poland
Częstochowa | | 1939-09-03..>
Grudziądz | | 1939-09-04..>
Katowice | | 1939-09-04..>
Mława | | 1939-09-04..>
Bydgoszcz | | 1939-09-05..>
Kielce | | 1939-09-05..>
Kraków | | 1939-09-06..>
Toruń | | 1939-09-07..>
Tarnów | | 1939-09-07..>
Łódź | | 1939-09-08..>
Radom | | 1939-09-08..>
Płock | | 1939-09-08..>
Rzeszów | | 1939-09-09..>
Poznań | | 1939-09-10..>
Ostrołęka | | 1939-09-10..>
Sandomierz | | 1939-09-10..>
Jarosław | | 1939-09-11..>
Łomża | | 1939-09-11..1939-09-29
Siedlce | | 1939-09-12..>
Zamość | | 1939-09-13..>
Lauenburg | @54.54,17.75 | <..>
Memel | @55.71,21.13 | <..>
Tilsit | @55.08,21.88 | <..>
Insterburg | @54.63,21.8 | <..>
Gumbinnen | @54.59,22.2 | <..>
Lyck | @53.83,22.36 | <..>
Stolp | @54.46,17.03 | <..>
Bütow | @54.17,17.49 | <..>
Gdynia | | 1939-09-14..>
Przemyśl | | 1939-09-15..>
Brest | Brest, Belarus | 1939-09-14..1939-09-22
Białystok | | 1939-09-15..1939-09-22
Kutno | | 1939-09-16..>
Lublin | | 1939-09-18..>
Warsaw | | 1939-09-28..>
Modlin | Modlin Fortress | 1939-09-29..>
Chełm | | 1939-09-25..>
Kock | | 1939-10-06..>
# --- Taken by the Soviet Union
Wilno | Vilnius | -
Grodno | | -
Pińsk | Pinsk | -
Kowel | Kovel | -
Łuck | Lutsk | -
Lwów | Lviv | -
Tarnopol | Ternopil | -
Stanisławów | Ivano-Frankivsk | -
`,
};

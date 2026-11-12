import type { TheatreSource } from './types';

/**
 * The Spanish Civil War, 18 July 1936 – 1 April 1939. Side A is the Nationalists: a period is
 * the time a town was in their hands (from the rising where it succeeded at once). Both sides
 * fought inside one country, so the map paints Nationalist ground over Spain's own colour.
 */
export const SPANISH_CIVIL_WAR: TheatreSource = {
  id: 'spanish-civil-war',
  name: 'Spanish Civil War front',
  war: 'Spanish Civil War',
  conflictId: 'conflict-spanish-civil-war',
  sideA: 'Nationalists',
  sideB: 'Spanish Republic',
  start: '1936-07-18',
  end: '1939-04-01',
  horizonDays: 30,
  maxEdgeKm: 420,
  colorA: 'nationalists',
  colorB: 'spain',
  politiesA: '^$',
  politiesB: '^(spain|revolutionary catalonia)$',
  sources: [
    'https://en.wikipedia.org/wiki/Spanish_Civil_War',
    'https://en.wikipedia.org/wiki/War_in_the_North',
    'https://en.wikipedia.org/wiki/Aragon_Offensive',
    'https://en.wikipedia.org/wiki/Catalonia_Offensive',
    'https://en.wikipedia.org/wiki/Final_offensive_of_the_Spanish_Civil_War',
  ],
  places: `
# --- Nationalist from the rising
Seville | @37.39,-5.99 | 1936-07-19..>
Cádiz | @36.53,-6.29 | 1936-07-19..>
Jerez | @36.69,-6.14 | 1936-07-19..>
Algeciras | @36.13,-5.45 | 1936-07-19..>
Córdoba | @37.88,-4.78 | 1936-07-19..>
Granada | @37.18,-3.6 | 1936-07-20..>
Cáceres | @39.48,-6.37 | 1936-07-19..>
Salamanca | @40.97,-5.66 | 1936-07-19..>
Zamora | @41.5,-5.75 | 1936-07-19..>
Ávila | @40.66,-4.7 | 1936-07-19..>
Segovia | @40.95,-4.12 | 1936-07-19..>
Valladolid | @41.65,-4.72 | 1936-07-19..>
Palencia | @42.01,-4.53 | 1936-07-19..>
Burgos | @42.34,-3.7 | 1936-07-19..>
Soria | @41.76,-2.47 | 1936-07-21..>
Logroño | @42.47,-2.45 | 1936-07-19..>
Vitoria | @42.85,-2.67 | 1936-07-19..>
Pamplona | @42.82,-1.64 | 1936-07-19..>
Jaca | @42.57,-0.55 | 1936-07-20..>
Huesca | @42.14,-0.41 | 1936-07-19..>
Zaragoza | @41.65,-0.89 | 1936-07-19..>
Teruel | @40.34,-1.11 | 1936-07-20..1938-01-08, 1938-02-22..>
Belchite | @41.3,-0.75 | 1936-07-20..1937-09-06, 1938-03-10..>
León | @42.6,-5.57 | 1936-07-20..>
Oviedo | @43.36,-5.85 | 1936-07-20..>
Lugo | @43.01,-7.56 | 1936-07-20..>
A Coruña | @43.37,-8.4 | 1936-07-20..>
Vigo | @42.24,-8.72 | 1936-07-20..>
Ourense | @42.34,-7.86 | 1936-07-20..>
Palma | @39.57,2.65 | 1936-07-19..>
Ibiza | @38.91,1.43 | 1936-07-19..1936-08-08, 1936-09-20..>
Las Palmas | @28.12,-15.43 | 1936-07-19..>
Santa Cruz de Tenerife | @28.47,-16.25 | 1936-07-19..>
Ceuta | @35.89,-5.32 | 1936-07-19..>
Melilla | @35.29,-2.94 | 1936-07-19..>
# --- 1936
Huelva | @37.26,-6.95 | 1936-07-29..>
Mérida | @38.92,-6.34 | 1936-08-11..>
Badajoz | @38.88,-6.97 | 1936-08-14..>
Talavera | @39.96,-4.83 | 1936-09-03..>
Irún | @43.34,-1.79 | 1936-09-05..>
San Sebastián | @43.32,-1.98 | 1936-09-13..>
Toledo | @39.86,-4.02 | 1936-09-27..>
Sigüenza | @41.07,-2.64 | 1936-10-15..>
# --- 1937: Málaga and the north
Málaga | @36.72,-4.42 | 1937-02-08..>
Motril | @36.75,-3.52 | 1937-02-10..>
Durango | @43.17,-2.63 | 1937-04-28..>
Guernica | @43.32,-2.68 | 1937-04-29..>
Bilbao | @43.26,-2.93 | 1937-06-19..>
Santander | @43.46,-3.8 | 1937-08-26..>
Gijón | @43.53,-5.66 | 1937-10-21..>
Avilés | @43.56,-5.92 | 1937-10-21..>
# --- 1938: Aragon, the sea, Extremadura
Alcañiz | @41.05,-0.13 | 1938-03-14..>
Caspe | @41.24,-0.04 | 1938-03-17..>
Fraga | @41.52,0.35 | 1938-03-27..>
Gandesa | @41.05,0.44 | 1938-04-02..>
Lleida | @41.62,0.62 | 1938-04-03..>
Morella | @40.62,-0.1 | 1938-04-04..>
Balaguer | @41.79,0.81 | 1938-04-06..>
Tremp | @42.17,0.89 | 1938-04-07..>
Vinaròs | @40.47,0.47 | 1938-04-15..>
Tortosa | @40.81,0.52 | 1938-04-18..>
Castellón | @39.99,-0.04 | 1938-06-14..>
Castuera | @38.72,-5.54 | 1938-07-23..>
Don Benito | @38.96,-5.86 | 1938-07-24..>
# --- 1939: Catalonia, then the end
Tarragona | @41.12,1.25 | 1939-01-15..>
Manresa | @41.73,1.83 | 1939-01-24..>
Barcelona | @41.39,2.17 | 1939-01-26..>
Vic | @41.93,2.25 | 1939-02-01..>
Girona | @41.98,2.82 | 1939-02-04..>
Figueres | @42.27,2.96 | 1939-02-08..>
Mahón | @39.89,4.27 | 1939-02-09..>
Puigcerdà | @42.43,1.93 | 1939-02-10..>
Pozoblanco | @38.38,-4.85 | 1939-03-26..>
Madrid | @40.42,-3.7 | 1939-03-28..>
Guadalajara | @40.63,-3.17 | 1939-03-28..>
Aranjuez | @40.03,-3.6 | 1939-03-28..>
Andújar | @38.04,-4.05 | 1939-03-28..>
Cuenca | @40.07,-2.14 | 1939-03-29..>
Ciudad Real | @38.99,-3.93 | 1939-03-29..>
Albacete | @39.0,-1.86 | 1939-03-29..>
Jaén | @37.77,-3.79 | 1939-03-29..>
Sagunto | @39.68,-0.28 | 1939-03-29..>
Valencia | @39.47,-0.38 | 1939-03-30..>
Alicante | @38.35,-0.48 | 1939-03-30..>
Murcia | @37.99,-1.13 | 1939-03-31..>
Cartagena | @37.6,-0.98 | 1939-03-31..>
Almería | @36.84,-2.46 | 1939-03-31..>
`,
};

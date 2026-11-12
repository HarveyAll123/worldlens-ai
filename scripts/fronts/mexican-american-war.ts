import type { TheatreSource } from './types';

/**
 * The Mexican–American War, 25 April 1846 – 2 February 1848: Taylor in the north-east, the
 * occupation of New Mexico and California, Scott's march from Veracruz to Mexico City. Side A
 * is the United States.
 */
export const MEXICAN_AMERICAN_WAR: TheatreSource = {
  id: 'mexican-american-war',
  name: 'Mexican–American War: the American advance',
  war: 'Mexican–American War',
  conflictId: 'conflict-mexican-american-war',
  sideA: 'United States',
  sideB: 'Mexico',
  start: '1846-04-25',
  end: '1848-02-02',
  horizonDays: 30,
  maxEdgeKm: 1100,
  colorA: 'usa',
  colorB: 'mexico',
  politiesA: '^united states',
  politiesB: '^mexico',
  sources: [
    'https://en.wikipedia.org/wiki/Mexican%E2%80%93American_War',
    'https://en.wikipedia.org/wiki/Conquest_of_California',
    'https://en.wikipedia.org/wiki/Battle_for_Mexico_City',
  ],
  places: `
# --- The United States
New Orleans | @29.95,-90.07 | <..>
San Antonio | @29.42,-98.49 | <..>
Corpus Christi | @27.8,-97.4 | <..>
Point Isabel | @26.07,-97.21 | <..>
Fort Leavenworth | @39.35,-94.92 | <..>
# --- The north-east
Matamoros | @25.87,-97.5 | 1846-05-18..>
Camargo | @26.31,-98.83 | 1846-07-14..>
Monterrey | @25.67,-100.31 | 1846-09-24..>
Tampico | @22.26,-97.84 | 1846-11-14..>
Saltillo | @25.42,-101.0 | 1846-11-16..>
Victoria | @23.74,-99.14 | 1846-12-29..>
# --- New Mexico and Chihuahua
Santa Fe | @35.69,-105.94 | 1846-08-18..>
Taos | @36.41,-105.57 | 1846-08-20..>
Albuquerque | @35.08,-106.65 | 1846-08-25..>
El Paso del Norte | @31.74,-106.49 | 1846-12-27..>
Chihuahua | @28.63,-106.08 | 1847-03-01..1847-04-28
# --- California and the Pacific
Monterey | @36.6,-121.89 | 1846-07-07..>
San Francisco | @37.78,-122.42 | 1846-07-09..>
Sonoma | @38.29,-122.46 | 1846-07-09..>
Sutter's Fort | @38.57,-121.47 | 1846-07-11..>
San Diego | @32.72,-117.16 | 1846-07-29..>
Los Angeles | @34.05,-118.24 | 1846-08-13..1846-09-29, 1847-01-10..>
Santa Barbara | @34.42,-119.7 | 1846-12-27..>
San José del Cabo | @23.06,-109.7 | 1847-03-30..>
La Paz | @24.14,-110.31 | 1847-04-13..>
Guaymas | @27.92,-110.9 | 1847-10-20..>
Mazatlán | @23.24,-106.42 | 1847-11-11..>
# --- From Veracruz to the capital
Ciudad del Carmen | @18.64,-91.83 | 1846-12-21..>
Veracruz | @19.18,-96.14 | 1847-03-29..>
Tuxpan | @20.96,-97.4 | 1847-04-18..>
Jalapa | @19.54,-96.92 | 1847-04-19..>
Perote | @19.56,-97.24 | 1847-04-22..>
Puebla | @19.04,-98.2 | 1847-05-15..>
Villahermosa | @17.99,-92.93 | 1847-06-16..1847-07-22
Mexico City | @19.43,-99.13 | 1847-09-14..>
Toluca | @19.29,-99.66 | 1848-01-08..>
# --- Never taken
Hermosillo | @29.07,-110.96 | -
Durango | @24.02,-104.66 | -
Zacatecas | @22.77,-102.57 | -
San Luis Potosí | @22.15,-100.98 | -
Guadalajara | @20.67,-103.35 | -
Querétaro | @20.59,-100.39 | -
Cuernavaca | @18.92,-99.23 | -
Acapulco | @16.85,-99.88 | -
Oaxaca | @17.06,-96.72 | -
`,
};

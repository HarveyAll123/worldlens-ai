import type { TheatreSource } from './types';

/**
 * The Soviet–Japanese War, 9 August – 2 September 1945: the Red Army (with Mongolia) overran
 * Manchuria, Inner Mongolia, northern Korea, southern Sakhalin and the Kuril Islands. Side A
 * is the Soviet Union. Several towns were entered only after the Japanese surrender of 15
 * August, by airborne detachments ahead of the columns; their dates are those entries.
 */
export const WW2_MANCHURIA_1945: TheatreSource = {
  id: 'ww2-soviet-japanese-war',
  name: 'Soviet invasion of Manchuria',
  war: 'Second World War',
  conflictId: 'conflict-world-war-ii',
  sideA: 'Soviet Union and Mongolia',
  sideB: 'Japan and Manchukuo',
  start: '1945-08-09',
  end: '1945-09-02',
  horizonDays: 5,
  maxEdgeKm: 700,
  colorA: 'ussr',
  colorB: 'japan',
  politiesA: '^(soviet union|ussr|mongolia|mongolian people)',
  // China too: the map gives Manchuria back to China the day Manchukuo ends, with the Red Army in it.
  politiesB: '^(manchukuo|mengjiang|empire of japan|china$|republic of china)',
  sources: [
    'https://en.wikipedia.org/wiki/Soviet_invasion_of_Manchuria',
    'https://en.wikipedia.org/wiki/Soviet_invasion_of_South_Sakhalin',
    'https://en.wikipedia.org/wiki/Invasion_of_the_Kuril_Islands',
    'https://en.wikipedia.org/wiki/Seishin_Operation',
  ],
  places: `
# --- Manchuria and Inner Mongolia
Manzhouli | @49.6,117.43 | 1945-08-09..>
Hailar | @49.21,119.77 | 1945-08-12..>
Heihe | @50.2,127.48 | 1945-08-11..>
Suifenhe | @44.4,131.15 | 1945-08-10..>
Solun | @46.6,121.2 | 1945-08-13..>
Dolonnor | @42.18,116.47 | 1945-08-14..>
Erenhot | @43.65,111.98 | 1945-08-10..>
Zhangbei | @41.15,114.7 | 1945-08-20..>
Wangyemiao | @46.08,122.07 | 1945-08-15..>
Jiamusi | @46.8,130.32 | 1945-08-16..>
Mudanjiang | @44.55,129.63 | 1945-08-16..>
Bei'an | @48.24,126.6 | 1945-08-17..>
Chifeng | @42.26,118.89 | 1945-08-17..>
Qiqihar | @47.35,123.92 | 1945-08-19..>
Tongliao | @43.62,122.26 | 1945-08-19..>
Jilin | @43.84,126.55 | 1945-08-19..>
Chengde | @40.95,117.96 | 1945-08-19..>
Harbin | @45.75,126.65 | 1945-08-20..>
Changchun | @43.82,125.32 | 1945-08-20..>
Mukden | @41.8,123.43 | 1945-08-20..>
Kalgan | @40.77,114.88 | 1945-08-21..>
Dairen | @38.91,121.6 | 1945-08-22..>
Port Arthur | @38.81,121.26 | 1945-08-22..>
Tonghua | @41.73,125.94 | 1945-08-24..>
Andong | @40.13,124.39 | 1945-08-25..>
Yingkou | @40.67,122.23 | 1945-08-25..>
Jinzhou | @41.1,121.13 | 1945-08-26..>
Hutou | @45.98,133.67 | 1945-08-26..>
# --- Korea
Rashin | @42.25,130.3 | 1945-08-12..>
Seishin | @41.8,129.78 | 1945-08-16..>
Wonsan | @39.15,127.44 | 1945-08-21..>
Hamhung | @39.92,127.54 | 1945-08-24..>
Pyongyang | @39.03,125.75 | 1945-08-24..>
Kaesong | @37.97,126.55 | -
Seoul | @37.57,126.98 | -
# --- Sakhalin and the Kurils
Koton | @50.07,142.7 | 1945-08-16..>
Shikuka | @49.22,143.1 | 1945-08-20..>
Maoka | @47.05,142.04 | 1945-08-20..>
Toyohara | @46.96,142.73 | 1945-08-25..>
Otomari | @46.63,142.78 | 1945-08-25..>
Shumshu | @50.73,156.3 | 1945-08-23..>
Paramushir | @50.4,155.8 | 1945-08-24..>
Etorofu | @45.0,147.9 | 1945-08-29..>
Kunashiri | @44.0,145.8 | 1945-09-01..>
# --- Never reached
Peking | @39.9,116.4 | -
Tianjin | @39.13,117.2 | -
Shanhaiguan | @40.0,119.75 | -
Tangshan | @39.63,118.18 | -
Zunhua | @40.19,117.96 | -
Gubeikou | @40.69,117.16 | -
Datong | @40.08,113.3 | -
Guisui | @40.84,111.75 | -
Baotou | @40.66,109.84 | -
Bailingmiao | @41.7,110.43 | -
Wakkanai | @45.42,141.67 | -
Sapporo | @43.06,141.35 | -
Nemuro | @43.33,145.58 | -
# --- Soviet and Mongolian ground
Chita | @52.03,113.5 | <..>
Borzya | @50.39,116.52 | <..>
Blagoveshchensk | @50.27,127.54 | <..>
Khabarovsk | @48.48,135.08 | <..>
Bikin | @46.82,134.26 | <..>
Iman | @45.93,133.95 | <..>
Lesozavodsk | @45.47,133.42 | <..>
Sovetskaya Gavan | @48.97,140.28 | <..>
Nakhodka | @42.82,132.87 | <..>
Posyet | @42.65,130.8 | <..>
Birobidzhan | @48.79,132.92 | <..>
Svobodny | @51.38,128.13 | <..>
Mogocha | @53.74,119.76 | <..>
Komsomolsk | @50.55,137.0 | <..>
Voroshilov | @43.8,131.95 | <..>
Vladivostok | @43.12,131.89 | <..>
Aleksandrovsk-Sakhalinsky | @50.9,142.16 | <..>
Petropavlovsk | @53.02,158.65 | <..>
Ulaanbaatar | @47.92,106.92 | <..>
Choibalsan | @48.07,114.53 | <..>
Sainshand | @44.9,110.12 | <..>
`,
};

import type { TheatreSource } from './types';

/**
 * The Russo-Japanese War, 8 February 1904 – 5 September 1905: the Japanese landings in Korea,
 * the crossing of the Yalu, the siege of Port Arthur, Liaoyang and Mukden, and the taking of
 * Sakhalin. Side A is Japan. The war was fought on Chinese and Korean ground: China west of
 * the Liao was neutral and is left out.
 */
export const RUSSO_JAPANESE_WAR: TheatreSource = {
  id: 'russo-japanese-war',
  name: 'Russo-Japanese War front',
  war: 'Russo-Japanese War',
  conflictId: 'conflict-russo-japanese-war',
  sideA: 'Japan',
  sideB: 'Russia',
  start: '1904-02-08',
  end: '1905-09-05',
  horizonDays: 21,
  maxEdgeKm: 620,
  colorA: 'japan',
  colorB: 'russia',
  politiesA: '^empire of japan',
  politiesB: '^(russian empire|qing|korean empire)',
  sources: [
    'https://en.wikipedia.org/wiki/Russo-Japanese_War',
    'https://en.wikipedia.org/wiki/Siege_of_Port_Arthur',
    'https://en.wikipedia.org/wiki/Battle_of_Mukden',
    'https://en.wikipedia.org/wiki/Japanese_invasion_of_Sakhalin',
  ],
  places: `
# --- Japan
Shimonoseki | @33.95,130.94 | <..>
Sasebo | @33.18,129.72 | <..>
Tsushima | @34.2,129.29 | <..>
Hakodate | @41.77,140.73 | <..>
Wakkanai | @45.42,141.67 | <..>
Sapporo | @43.06,141.35 | <..>
Abashiri | @44.02,144.27 | <..>
Kushiro | @42.98,144.38 | <..>
Nemuro | @43.33,145.58 | <..>
# --- Korea
Pusan | @35.1,129.04 | 1904-02-09..>
Chemulpo | @37.46,126.63 | 1904-02-09..>
Seoul | @37.57,126.98 | 1904-02-09..>
Pyongyang | @39.03,125.75 | 1904-02-28..>
Wonsan | @39.15,127.44 | 1904-03-01..>
Chongju | @39.69,125.21 | 1904-03-28..>
Wiju | @40.2,124.53 | 1904-04-21..>
Songjin | @40.67,129.2 | 1904-07-01..>
Kyongsong | @41.59,129.61 | 1905-07-20..>
# --- Manchuria
Antung | @40.13,124.39 | 1904-05-01..>
Pitzuwo | @39.4,122.35 | 1904-05-05..>
Fenghuangcheng | @40.45,124.07 | 1904-05-06..>
Nanshan | @39.1,121.72 | 1904-05-26..>
Dalny | @38.91,121.6 | 1904-05-30..>
Telissu | @39.63,122.0 | 1904-06-15..>
Kaiping | @40.4,122.35 | 1904-07-09..>
Tashihchiao | @40.63,122.5 | 1904-07-25..>
Yingkou | @40.67,122.23 | 1904-07-25..>
Haicheng | @40.85,122.75 | 1904-08-03..>
Liaoyang | @41.27,123.18 | 1904-09-04..>
Port Arthur | @38.81,121.26 | 1905-01-02..>
Mukden | @41.8,123.43 | 1905-03-10..>
Fushun | @41.88,123.95 | 1905-03-11..>
Hsinmintun | @42.0,122.83 | 1905-03-12..>
Tieling | @42.29,123.84 | 1905-03-16..>
Kaiyuan | @42.54,124.04 | 1905-03-19..>
Changtu | @42.78,124.11 | 1905-03-21..>
Sipingkai | @43.17,124.37 | -
Changchun | @43.82,125.32 | -
Kirin | @43.84,126.55 | -
Harbin | @45.75,126.65 | -
Vladivostok | @43.12,131.89 | -
# --- Sakhalin
Korsakov | @46.63,142.78 | 1905-07-07..>
Vladimirovka | @46.96,142.73 | 1905-07-10..>
Alexandrovsk | @50.9,142.16 | 1905-07-24..>
Nikolaevsk | @53.14,140.73 | -
# --- Neutral China
Chinchow | @41.1,121.13 | n
Shanhaiguan | @40.0,119.75 | n
Peking | @39.9,116.4 | n
`,
};

import type { TheatreSource } from './types';

/**
 * The Chinese Civil War, 26 June 1946 – 1 May 1950: the Communists' base areas in the north,
 * the Nationalist offensives of 1946–47 (Zhangjiakou, Yan'an), the three great campaigns of
 * the winter of 1948–49, the crossing of the Yangtze and the conquest of the south and west,
 * ending with Hainan. Side A is the Communists. The countryside between the cities changed
 * hands less clearly than these dates suggest.
 */
export const CHINESE_CIVIL_WAR: TheatreSource = {
  id: 'chinese-civil-war',
  name: 'Chinese Civil War: Communist-held territory',
  war: 'Chinese Civil War',
  conflictId: 'conflict-chinese-civil-war',
  sideA: 'Chinese Communists (People’s Liberation Army)',
  sideB: 'Republic of China (Nationalists)',
  start: '1946-06-26',
  end: '1950-05-01',
  horizonDays: 45,
  maxEdgeKm: 1100,
  colorA: 'communists',
  colorB: 'china',
  politiesA: "^people's republic of china",
  politiesB: '^(china|republic of china)$',
  sources: [
    'https://en.wikipedia.org/wiki/Chinese_Civil_War',
    'https://en.wikipedia.org/wiki/Liaoshen_campaign',
    'https://en.wikipedia.org/wiki/Huaihai_campaign',
    'https://en.wikipedia.org/wiki/Pingjin_campaign',
    'https://en.wikipedia.org/wiki/Yangtze_River_Crossing_campaign',
  ],
  places: `
# --- Manchuria
Harbin | @45.75,126.65 | <..>
Qiqihar | @47.35,123.92 | <..>
Jiamusi | @46.8,130.32 | <..>
Mudanjiang | @44.55,129.63 | <..>
Andong | @40.13,124.39 | <..1946-10-25, 1947-06-10..>
Jilin | @43.84,126.55 | 1948-03-09..>
Siping | @43.17,124.37 | 1948-03-13..>
Jinzhou | @41.1,121.13 | 1948-10-15..>
Changchun | @43.82,125.32 | 1948-10-19..>
Shenyang | @41.8,123.43 | 1948-11-02..>
Yingkou | @40.67,122.23 | 1948-11-02..>
Chengde | @40.95,117.96 | <..1946-08-28, 1948-11-12..>
Zhangjiakou | @40.77,114.88 | <..1946-10-11, 1948-12-24..>
# --- North China
Yan'an | @36.6,109.49 | <..1947-03-19, 1948-04-21..>
Handan | @36.61,114.49 | <..>
Linyi | @35.1,118.35 | <..1947-02-15, 1948-10-10..>
Yantai | @37.46,121.45 | <..1947-10-01, 1948-10-15..>
Shijiazhuang | @38.04,114.51 | 1947-11-12..>
Yuncheng | @35.03,111.0 | 1947-12-28..>
Luoyang | @34.62,112.45 | 1948-04-05..>
Weifang | @36.71,119.16 | 1948-04-27..>
Linfen | @36.09,111.52 | 1948-05-17..>
Jinan | @36.65,117.12 | 1948-09-24..>
Zhengzhou | @34.75,113.63 | 1948-10-22..>
Kaifeng | @34.8,114.31 | 1948-10-24..>
Baoding | @38.87,115.46 | 1948-11-22..>
Xuzhou | @34.2,117.28 | 1948-12-01..>
Tianjin | @39.13,117.2 | 1949-01-15..>
Bengbu | @32.92,117.38 | 1949-01-16..>
Hefei | @31.82,117.23 | 1949-01-21..>
Beiping | @39.9,116.4 | 1949-01-31..>
Taiyuan | @37.87,112.55 | 1949-04-24..>
Datong | @40.08,113.3 | 1949-05-01..>
Yulin | @38.29,109.73 | 1949-06-01..>
Qingdao | @36.07,120.38 | 1949-06-02..>
Guisui | @40.84,111.75 | 1949-09-19..>
Baotou | @40.66,109.84 | 1949-09-19..>
# --- The Yangtze and the south
Nanjing | @32.06,118.8 | 1949-04-23..>
Anqing | @30.51,117.05 | 1949-04-23..>
Hangzhou | @30.27,120.15 | 1949-05-03..>
Wenzhou | @28.0,120.67 | 1949-05-07..>
Wuhan | @30.59,114.31 | 1949-05-16..>
Nanchang | @28.68,115.86 | 1949-05-22..>
Ningbo | @29.87,121.55 | 1949-05-25..>
Shanghai | @31.23,121.47 | 1949-05-27..>
Yichang | @30.69,111.29 | 1949-07-16..>
Changsha | @28.23,112.94 | 1949-08-05..>
Ganzhou | @25.83,114.93 | 1949-08-14..>
Fuzhou | @26.07,119.3 | 1949-08-17..>
Hengyang | @26.89,112.57 | 1949-10-08..>
Guangzhou | @23.13,113.26 | 1949-10-14..>
Xiamen | @24.48,118.09 | 1949-10-17..>
Shantou | @23.35,116.68 | 1949-10-24..>
Guilin | @25.27,110.29 | 1949-11-22..>
Nanning | @22.82,108.32 | 1949-12-04..>
Zhanjiang | @21.27,110.36 | 1949-12-19..>
Haikou | @20.04,110.34 | 1950-04-23..>
# --- The west
Xi'an | @34.27,108.94 | 1949-05-20..>
Baoji | @34.36,107.24 | 1949-07-14..>
Lanzhou | @36.06,103.83 | 1949-08-26..>
Xining | @36.62,101.78 | 1949-09-05..>
Yinchuan | @38.47,106.27 | 1949-09-23..>
Jiuquan | @39.73,98.5 | 1949-09-25..>
Hami | @42.83,93.51 | 1949-10-12..>
Ürümqi | @43.8,87.6 | 1949-10-20..>
Kashgar | @39.47,75.99 | 1949-12-01..>
Guiyang | @26.65,106.63 | 1949-11-15..>
Chongqing | @29.56,106.55 | 1949-11-30..>
Kunming | @25.04,102.71 | 1949-12-09..>
Chengdu | @30.57,104.07 | 1949-12-27..>
Xichang | @27.89,102.26 | 1950-03-27..>
# --- Never taken
Taipei | @25.04,121.56 | -
Kinmen | @24.44,118.37 | -
Dinghai | @30.02,122.1 | -
`,
};

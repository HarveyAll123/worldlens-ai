import type { TheatreSource } from './types';

/**
 * Japan against China, 7 July 1937 – 2 September 1945. Side A is Japan: a period is the time a
 * place was in Japanese hands. Manchuria and Jehol, held since 1931–33, are Japanese from the
 * start. The occupation was of cities and railways — the countryside behind the line was
 * often in Chinese (Nationalist or Communist) hands, which a line cannot show.
 */
export const SINO_JAPANESE_WAR: TheatreSource = {
  id: 'second-sino-japanese-war',
  name: 'Sino-Japanese front',
  war: 'Second Sino-Japanese War',
  conflictId: 'conflict-second-sino-japanese-war',
  sideA: 'Japan',
  sideB: 'China',
  start: '1937-07-07',
  end: '1945-09-02',
  maxEdgeKm: 950,
  colorA: 'japan',
  colorB: 'china',
  politiesA: '^(empire of japan|japan|manchukuo|mengjiang|hong kong occupied)',
  politiesB: '^(china|republic of china)$',
  sources: [
    'https://en.wikipedia.org/wiki/Second_Sino-Japanese_War',
    'https://en.wikipedia.org/wiki/Battle_of_Wuhan',
    'https://en.wikipedia.org/wiki/Operation_Ichi-Go',
  ],
  note: 'Japan held the cities and railways; much of the countryside behind this line was not under its control.',
  places: `
# --- Held by Japan before the war (Manchukuo, Jehol, East Hebei)
Mukden | Shenyang | <..>
Hsinking | @43.82,125.32 | <..>
Jilin | @43.84,126.55 | <..>
Harbin | @45.75,126.65 | <..>
Qiqihar | @47.35,123.92 | <..>
Hailar | @49.21,119.77 | <..>
Heihe | @50.2,127.48 | <..>
Jiamusi | @46.8,130.32 | <..>
Mudanjiang | @44.55,129.63 | <..>
Tongliao | @43.62,122.26 | <..>
Dolonnor | @42.18,116.47 | <..>
Jinzhou | | <..>
Chengde | | <..>
Chifeng | | <..>
Shanhaiguan | Qinhuangdao | <..>
Tangshan | | <..>
Dalian | | <..>
# --- North China
Beiping | Beijing | 1937-07-29..>
Tianjin | | 1937-07-30..>
Zhangjiakou | | 1937-08-27..1945-08-23
Datong | | 1937-09-13..>
Guisui | Hohhot | 1937-10-14..>
Baotou | | 1937-10-17..>
Baoding | | 1937-09-24..>
Cangzhou | | 1937-09-24..>
Dezhou | | 1937-10-05..>
Shijiazhuang | | 1937-10-10..>
Handan | | 1937-10-17..>
Anyang | | 1937-11-05..>
Taiyuan | | 1937-11-08..>
Jinan | | 1937-12-27..>
Qingdao | | 1938-01-10..>
Yantai | | 1938-02-03..>
Xinxiang | | 1938-02-17..>
Changzhi | | 1938-02-20..>
Linfen | | 1938-02-28..>
Yuncheng | | 1938-03-06..>
Xuzhou | | 1938-05-19..>
Kaifeng | | 1938-06-06..>
Zhengzhou | | 1941-10-04..1941-10-31, 1944-04-22..>
Xuchang | | 1944-05-01..>
Luoyang | | 1944-05-25..>
Nanyang | Nanyang, Henan | 1945-03-30..>
Laohekou | | 1945-04-08..>
Wuyuan | Wuyuan County, Inner Mongolia | -
Yulin | Yulin, Shaanxi | -
Yan'an | | -
Xi'an | | -
Tongguan | Tongguan County | -
Lanzhou | | -
Yinchuan | | -
Hanzhong | | -
Ankang | | -
Xiangyang | | -
# --- The lower Yangtze and the coast
Shanghai | | 1937-11-12..>
Suzhou | | 1937-11-19..>
Wuxi | | 1937-11-25..>
Zhenjiang | | 1937-12-08..>
Wuhu | | 1937-12-10..>
Nanjing | | 1937-12-13..>
Hangzhou | | 1937-12-24..>
Bengbu | | 1938-02-02..>
Hefei | | 1938-05-14..>
Anqing | | 1938-06-12..>
Shaoxing | | 1941-04-17..>
Ningbo | | 1941-04-20..>
Jinhua | | 1942-05-28..>
Quzhou | | 1942-06-07..1942-08-28
Shangrao | | 1942-06-14..1942-08-19
Wenzhou | | 1944-09-09..1945-06-18
Fuzhou | | 1941-04-21..1941-09-03, 1944-10-04..1945-05-18
Xiamen | | 1938-05-12..>
Shantou | | 1939-06-21..>
Fuyang | | -
Lishui | | -
Tunxi | Huangshan City | -
Nanping | | -
Longyan | | -
Meixian | Meizhou | -
# --- The middle Yangtze, Hunan and Jiangxi
Jiujiang | | 1938-07-26..>
Xinyang | | 1938-10-12..>
Wuhan | | 1938-10-26..>
Yueyang | | 1938-11-11..>
Nanchang | | 1939-03-27..>
Shashi | Jingzhou | 1940-06-08..>
Yichang | | 1940-06-12..>
Changsha | | 1944-06-18..>
Hengyang | | 1944-08-08..>
Lingling | Yongzhou | 1944-09-07..>
Baoqing | Shaoyang | 1944-10-02..>
Ganzhou | | 1945-02-06..1945-07-15
Changde | | -
Zhijiang | Zhijiang Dong Autonomous County | -
Ji'an | | -
Enshi | Enshi City | -
Wanxian | Wanzhou, Chongqing | -
Chongqing | | -
Chengdu | | -
# --- The south
Guangzhou | | 1938-10-21..>
Haikou | | 1939-02-10..>
Qinzhou | | 1939-11-17..1940-11-13
Nanning | | 1939-11-24..1940-10-30, 1944-11-24..1945-05-27
Hong Kong | | 1941-12-25..>
Zhanjiang | | 1943-02-21..>
Guilin | | 1944-11-11..1945-07-28
Liuzhou | | 1944-11-11..1945-06-30
Dushan | Dushan County | 1944-12-02..1944-12-08
Shaoguan | | 1945-01-26..>
Guiyang | | -
Kunming | | -
# --- The Burma road
Tengchong | | 1942-05-10..1944-09-14
Longling | Longling County | 1942-05-05..1944-11-03
Baoshan | Baoshan, Yunnan | -
Simao | @22.79,100.97 | -
Zhenkang | @23.76,98.83 | -
Lincang | @23.88,100.09 | -
Gengma | @23.54,99.4 | -
Lancang | @22.55,99.93 | -
Jinghong | @22.01,100.8 | -
Mengzi | @23.37,103.39 | -
`,
};

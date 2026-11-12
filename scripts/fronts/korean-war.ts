import type { TheatreSource } from './types';

/**
 * North Korea (with China from October 1950) against South Korea and the United Nations
 * Command, 25 June 1950 – 27 July 1953. Side A is the North: a period is the time a place was
 * in North Korean or Chinese hands.
 */
export const KOREAN_WAR: TheatreSource = {
  id: 'korean-war',
  name: 'Korean War front',
  war: 'Korean War',
  conflictId: 'conflict-korean-war',
  sideA: 'North Korea and China',
  sideB: 'South Korea and the United Nations Command',
  start: '1950-06-25',
  end: '1953-07-27',
  horizonDays: 14,
  maxEdgeKm: 330,
  colorA: 'north-korea',
  colorB: 'south-korea',
  politiesA: '^north korea',
  politiesB: '^south korea',
  sources: [
    'https://en.wikipedia.org/wiki/Korean_War',
    'https://en.wikipedia.org/wiki/Battle_of_Pusan_Perimeter',
    'https://en.wikipedia.org/wiki/Battle_of_Inchon',
    'https://en.wikipedia.org/wiki/UN_offensive_into_North_Korea',
    'https://en.wikipedia.org/wiki/Chinese_spring_offensive',
  ],
  places: `
# --- North of the 38th parallel
Sinuiju | | <..>
Kanggye | | <..>
Hyesan | | <..1950-11-21, 1950-12-01..>
Chongjin | | <..1950-11-26, 1950-12-05..>
Hamhung | | <..1950-10-17, 1950-12-17..>
Hungnam | | <..1950-10-17, 1950-12-24..>
Wonsan | | <..1950-10-10, 1950-12-09..>
Unsan | Unsan County | <..1950-10-25, 1950-11-02..>
Anju | Anju, South Pyongan | <..1950-10-23, 1950-11-29..>
Pyongyang | | <..1950-10-19, 1950-12-06..>
Chinnampo | Nampo | <..1950-10-22, 1950-12-06..>
Sariwon | | <..1950-10-17, 1950-12-08..>
Haeju | | <..1950-10-17, 1950-12-12..>
Pyonggang | Pyonggang County | <..1950-10-12, 1950-12-18..>
Chorwon | Cheorwon County | <..1950-10-10, 1950-12-20..1951-06-11
Kumhwa | @38.29,127.47 | <..1950-10-11, 1950-12-20..1951-06-11
Hwacheon | Hwacheon County | <..1950-10-04, 1950-12-25..1951-06-01
Yanggu | Yanggu County, Gangwon | <..1950-10-05, 1950-12-25..1951-06-15
Inje | Inje County | <..1950-10-03, 1950-12-28..1951-05-27
Yangyang | Yangyang County | <..1950-10-01, 1951-01-01..1951-03-27
Kosong | Kosong County | <..1950-10-05, 1950-12-20..>
# --- South of the 38th parallel
Kaesong | | 1950-06-25..1950-10-09, 1950-12-15..>
Uijeongbu | | 1950-06-26..1950-10-01, 1951-01-02..1951-03-18
Chuncheon | | 1950-06-27..1950-10-02, 1951-01-02..1951-03-21
Seoul | | 1950-06-28..1950-09-28, 1951-01-04..1951-03-15
Gangneung | | 1950-06-28..1950-09-30
Incheon | | 1950-07-03..1950-09-15, 1951-01-05..1951-02-10
Suwon | | 1950-07-04..1950-09-22, 1951-01-07..1951-01-26
Wonju | | 1950-07-02..1950-09-28, 1951-01-08..1951-02-05
Osan | | 1950-07-05..1950-09-26, 1951-01-07..1951-01-15
Pyeongtaek | | 1950-07-06..1950-09-25
Chungju | | 1950-07-08..1950-09-27
Cheonan | | 1950-07-08..1950-09-25
Kunsan | Gunsan | 1950-07-16..1950-09-30
Daejeon | | 1950-07-20..1950-09-28
Jeonju | | 1950-07-20..1950-09-29
Gwangju | | 1950-07-23..1950-10-03
Mokpo | | 1950-07-24..1950-10-02
Suncheon | Suncheon | 1950-07-25..1950-09-30
Yeongdong | Yeongdong County | 1950-07-25..1950-09-26
Hadong | Hadong County | 1950-07-26..1950-09-26
Jinju | | 1950-07-31..1950-09-25
Sangju | | 1950-07-31..1950-09-24
Andong | | 1950-08-01..1950-09-26
Gimcheon | | 1950-08-03..1950-09-25
Yeongdeok | Yeongdeok County | 1950-07-17..1950-09-22
Pohang | | 1950-08-11..1950-08-18, 1950-09-06..1950-09-20
Daegu | | -
Masan | | -
Gyeongju | | -
Miryang | | -
Ulsan | | -
Busan | | -
`,
};

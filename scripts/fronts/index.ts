import { AMERICAN_CIVIL_WAR } from './american-civil-war';
import { CHINESE_CIVIL_WAR } from './chinese-civil-war';
import { CONTINUATION_WAR } from './continuation-war';
import { FIRST_BALKAN_WAR } from './first-balkan-war';
import { FRANCO_PRUSSIAN_WAR } from './franco-prussian-war';
import { ITALO_ETHIOPIAN_WAR, WW2_EAST_AFRICA } from './italo-ethiopian-wars';
import { KOREAN_WAR } from './korean-war';
import { IRAN_IRAQ_WAR, VIETNAM_1972_75, YUGOSLAV_WARS } from './late-cold-war';
import { MEXICAN_AMERICAN_WAR } from './mexican-american-war';
import { NAPOLEON_1812 } from './napoleon-1812';
import { POLISH_SOVIET_WAR } from './polish-soviet-war';
import { RUSSO_JAPANESE_WAR } from './russo-japanese-war';
import { SINO_JAPANESE_WAR } from './sino-japanese-war';
import { SPANISH_CIVIL_WAR } from './spanish-civil-war';
import type { TheatreSource } from './types';
import { WW1_BALKANS } from './ww1-balkans';
import { WW1_EASTERN_FRONT, WW1_ROMANIA } from './ww1-eastern-front';
import { WW1_ITALIAN_FRONT } from './ww1-italian-front';
import { WW1_CAUCASUS, WW1_MIDDLE_EAST } from './ww1-ottoman-fronts';
import { WW1_WESTERN_FRONT } from './ww1-western-front';
import { WINTER_WAR } from './winter-war';
import { WW2_EASTERN_FRONT } from './ww2-eastern-front';
import { WW2_GREECE } from './ww2-greece';
import { WW2_ITALY } from './ww2-italy';
import { WW2_MANCHURIA_1945 } from './ww2-manchuria-1945';
import { WW2_NORWAY } from './ww2-norway';
import { WW2_OCCUPIED_FRANCE } from './ww2-occupied-france';
import { WW2_PACIFIC } from './ww2-pacific';
import { WW2_TUNISIA, WW2_WESTERN_DESERT } from './ww2-north-africa';
import { WW2_POLAND_1939 } from './ww2-poland-1939';
import { WW2_POLAND_SOVIET } from './ww2-poland-soviet';
import { WW2_WEST_1940 } from './ww2-west-1940';
import { WW2_WESTERN_FRONT } from './ww2-western-front';

/** Every theatre `pnpm data:fronts` builds, oldest war first. */
export const THEATRES: TheatreSource[] = [
  NAPOLEON_1812,
  MEXICAN_AMERICAN_WAR,
  AMERICAN_CIVIL_WAR,
  FRANCO_PRUSSIAN_WAR,
  RUSSO_JAPANESE_WAR,
  FIRST_BALKAN_WAR,
  WW1_WESTERN_FRONT,
  WW1_EASTERN_FRONT,
  WW1_ROMANIA,
  WW1_BALKANS,
  WW1_CAUCASUS,
  WW1_MIDDLE_EAST,
  WW1_ITALIAN_FRONT,
  POLISH_SOVIET_WAR,
  ITALO_ETHIOPIAN_WAR,
  SPANISH_CIVIL_WAR,
  SINO_JAPANESE_WAR,
  WW2_POLAND_1939,
  WW2_POLAND_SOVIET,
  WINTER_WAR,
  WW2_NORWAY,
  WW2_WEST_1940,
  WW2_EAST_AFRICA,
  WW2_OCCUPIED_FRANCE,
  WW2_WESTERN_DESERT,
  WW2_GREECE,
  WW2_EASTERN_FRONT,
  WW2_PACIFIC,
  CONTINUATION_WAR,
  WW2_TUNISIA,
  WW2_ITALY,
  WW2_WESTERN_FRONT,
  WW2_MANCHURIA_1945,
  CHINESE_CIVIL_WAR,
  KOREAN_WAR,
  VIETNAM_1972_75,
  IRAN_IRAQ_WAR,
  YUGOSLAV_WARS,
];

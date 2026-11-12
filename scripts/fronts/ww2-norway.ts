import type { TheatreSource } from './types';

/**
 * Norway, 9 April 1940 – 8 May 1945: the German invasion, the campaign that ended on 10 June
 * 1940, five years of occupation, and the loss of Finnmark in the autumn of 1944 (the Red
 * Army took Kirkenes; the Germans burned and left the rest as far as Lyngen). Side A is
 * Germany. The dates in Finnmark west of the Tana are known only to a few weeks.
 */
export const WW2_NORWAY: TheatreSource = {
  id: 'ww2-norway',
  name: 'Norway: invasion and occupation',
  war: 'Second World War',
  conflictId: 'conflict-world-war-ii',
  sideA: 'Germany',
  sideB: 'Norway and the Allies',
  start: '1940-04-09',
  end: '1945-05-08',
  horizonDays: 8,
  maxEdgeKm: 420,
  colorA: 'germany',
  colorB: 'allies',
  politiesA: '^$',
  politiesB: '^norway$',
  sources: [
    'https://en.wikipedia.org/wiki/Norwegian_campaign',
    'https://en.wikipedia.org/wiki/German_occupation_of_Norway',
    'https://en.wikipedia.org/wiki/Liberation_of_Finnmark',
  ],
  places: `
# --- Landings of 9 April 1940
Oslo | @59.91,10.75 | 1940-04-09..>
Kristiansand | @58.15,8.0 | 1940-04-09..>
Arendal | @58.46,8.77 | 1940-04-09..>
Egersund | @58.45,6.0 | 1940-04-09..>
Stavanger | @58.97,5.73 | 1940-04-09..>
Bergen | @60.39,5.32 | 1940-04-09..>
Trondheim | @63.43,10.4 | 1940-04-09..>
Narvik | @68.44,17.43 | 1940-04-09..1940-05-28, 1940-06-08..>
# --- The south and the valleys, April and May
Haugesund | @59.41,5.27 | 1940-04-11..>
Fredrikstad | @59.22,10.93 | 1940-04-12..>
Halden | @59.12,11.39 | 1940-04-13..>
Kongsberg | @59.67,9.65 | 1940-04-13..>
Hønefoss | @60.17,10.26 | 1940-04-14..>
Kongsvinger | @60.19,12.0 | 1940-04-16..>
Hamar | @60.79,11.07 | 1940-04-18..>
Elverum | @60.88,11.56 | 1940-04-18..>
Lillehammer | @61.12,10.47 | 1940-04-21..>
Steinkjer | @64.01,11.5 | 1940-04-22..>
Voss | @60.63,6.42 | 1940-04-26..>
Geilo | @60.53,8.21 | 1940-04-28..>
Fagernes | @60.99,9.23 | 1940-04-29..>
Røros | @62.57,11.38 | 1940-04-30..>
Støren | @63.04,10.28 | 1940-04-30..>
Dombås | @62.07,9.12 | 1940-04-30..>
Florø | @61.6,5.03 | 1940-05-01..>
Sogndal | @61.23,7.1 | 1940-05-01..>
Åndalsnes | @62.57,7.69 | 1940-05-02..>
Molde | @62.74,7.16 | 1940-05-02..>
Kristiansund | @63.11,7.73 | 1940-05-02..>
Ålesund | @62.47,6.15 | 1940-05-03..>
Rjukan | @59.88,8.59 | 1940-05-03..>
Namsos | @64.47,11.5 | 1940-05-04..>
Grong | @64.46,12.31 | 1940-05-05..>
# --- Northwards to Narvik
Brønnøysund | @65.47,12.21 | 1940-05-10..>
Mosjøen | @65.84,13.19 | 1940-05-11..>
Mo i Rana | @66.31,14.14 | 1940-05-18..>
Bodø | @67.28,14.4 | 1940-06-01..>
Fauske | @67.26,15.39 | 1940-06-01..>
Harstad | @68.8,16.54 | 1940-06-09..>
Svolvær | @68.23,14.57 | 1940-06-10..>
Bardufoss | @69.06,18.54 | 1940-06-10..>
Tromsø | @69.65,18.96 | 1940-06-10..>
Skibotn | @69.39,20.27 | 1940-06-13..>
# --- Finnmark, lost in the autumn of 1944
Alta | @69.97,23.27 | 1940-06-13..1945-01-20
Hammerfest | @70.66,23.68 | 1940-06-13..1945-02-10
Kautokeino | @69.01,23.04 | 1940-06-13..1944-11-25
Lakselv | @70.05,24.97 | 1940-06-13..1944-11-20
Honningsvåg | @70.98,25.97 | 1940-06-13..1944-11-15
Karasjok | @69.47,25.51 | 1940-06-13..1944-11-15
Vardø | @70.37,31.11 | 1940-06-13..1944-10-31
Vadsø | @70.07,29.75 | 1940-06-13..1944-10-30
Kirkenes | @69.73,30.05 | 1940-06-13..1944-10-25
`,
};

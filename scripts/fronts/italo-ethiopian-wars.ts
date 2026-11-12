import type { TheatreSource } from './types';

/**
 * The Second Italo-Ethiopian War, 3 October 1935 – 1 June 1936 (when Ethiopia was merged into
 * Italian East Africa; fighting in the west went on into 1937). Side A is Italy.
 */
export const ITALO_ETHIOPIAN_WAR: TheatreSource = {
  id: 'second-italo-ethiopian-war',
  name: 'Italian invasion of Ethiopia',
  war: 'Second Italo-Ethiopian War',
  conflictId: 'conflict-italo-ethiopian-war',
  sideA: 'Italy',
  sideB: 'Ethiopia',
  start: '1935-10-03',
  end: '1936-06-01',
  horizonDays: 20,
  maxEdgeKm: 620,
  colorA: 'italy',
  colorB: 'ethiopia',
  politiesA: '^(italian eritrea|italian somaliland)',
  politiesB: '^ethiopian empire',
  sources: [
    'https://en.wikipedia.org/wiki/Second_Italo-Ethiopian_War',
    'https://en.wikipedia.org/wiki/Battle_of_Maychew',
    'https://en.wikipedia.org/wiki/March_of_the_Iron_Will',
  ],
  places: `
# --- Italian Eritrea and Somaliland
Asmara | @15.33,38.93 | <..>
Massawa | @15.61,39.45 | <..>
Assab | @13.01,42.74 | <..>
Mogadishu | @2.05,45.32 | <..>
Belet Uen | @4.74,45.2 | <..>
Dolo | @4.17,42.07 | <..>
# --- The northern front
Adigrat | @14.28,39.46 | 1935-10-05..>
Adwa | @14.17,38.9 | 1935-10-06..>
Aksum | @14.13,38.72 | 1935-10-15..>
Mekelle | @13.5,39.47 | 1935-11-08..>
Amba Aradam | @13.2,39.5 | 1936-02-15..>
Abiy Addi | @13.62,39.0 | 1936-02-28..>
Amba Alagi | @12.98,39.52 | 1936-02-28..>
Sardo | @11.97,41.3 | 1936-03-11..>
Maychew | @12.78,39.54 | 1936-03-31..>
Enda Selassie | @14.1,38.28 | 1936-03-03..>
Humera | @14.29,36.61 | 1936-03-20..>
Debarq | @13.15,37.9 | 1936-03-28..>
Gondar | @12.6,37.47 | 1936-04-01..>
Korem | @12.5,39.52 | 1936-04-06..>
Dessie | @11.13,39.63 | 1936-04-15..>
Bahir Dar | @11.59,37.39 | 1936-04-24..>
Debre Tabor | @11.85,38.02 | 1936-04-28..>
Debre Berhan | @9.68,39.53 | 1936-05-03..>
Addis Ababa | @9.03,38.74 | 1936-05-05..>
Debre Markos | @10.33,37.72 | 1936-05-20..>
# --- The southern front
Gorrahei | @6.6,44.25 | 1935-11-07..>
Neghelli | @5.33,39.58 | 1936-01-20..>
Dagahbur | @8.22,43.57 | 1936-04-30..>
Jijiga | @9.35,42.8 | 1936-05-06..>
Harar | @9.31,42.12 | 1936-05-08..>
Dire Dawa | @9.6,41.87 | 1936-05-09..>
# --- Not yet taken when the empire was proclaimed
Lekemti | @9.08,36.55 | -
Gore | @8.15,35.53 | -
Gambela | @8.25,34.58 | -
Jimma | @7.67,36.83 | -
Yirgalem | @6.75,38.42 | -
Moyale | @3.53,39.05 | -
`,
};

/**
 * The East African campaign, 10 June 1940 – 27 November 1941: Italy took British Somaliland
 * and posts on the Sudan and Kenya frontiers, then lost its whole empire in East Africa to
 * British Commonwealth, Ethiopian and Free French forces; Gondar surrendered last. Side A is
 * Italy.
 */
export const WW2_EAST_AFRICA: TheatreSource = {
  id: 'ww2-east-africa',
  name: 'East African campaign',
  war: 'Second World War',
  conflictId: 'conflict-world-war-ii',
  sideA: 'Italy',
  sideB: 'British Commonwealth and Ethiopia',
  start: '1940-06-10',
  end: '1941-11-27',
  horizonDays: 20,
  maxEdgeKm: 700,
  colorA: 'italy',
  colorB: 'uk',
  politiesA: '^italian east africa',
  politiesB: '^(british somaliland|anglo-egyptian sudan|british kenya)',
  sources: [
    'https://en.wikipedia.org/wiki/East_African_campaign_(World_War_II)',
    'https://en.wikipedia.org/wiki/Italian_invasion_of_British_Somaliland',
    'https://en.wikipedia.org/wiki/Battle_of_Keren',
    'https://en.wikipedia.org/wiki/Battle_of_Gondar',
  ],
  places: `
# --- Eritrea
Tessenei | @15.11,36.66 | <..1941-01-18
Agordat | @15.55,37.88 | <..1941-02-01
Barentu | @15.11,37.59 | <..1941-02-02
Keren | @15.78,38.45 | <..1941-03-27
Asmara | @15.33,38.93 | <..1941-04-01
Massawa | @15.61,39.45 | <..1941-04-08
Assab | @13.01,42.74 | <..1941-06-11
# --- Ethiopia
Asosa | @10.07,34.53 | <..1941-03-11
Jijiga | @9.35,42.8 | <..1941-03-17
Neghelli | @5.33,39.58 | <..1941-03-21
Gambela | @8.25,34.58 | <..1941-03-22
Harar | @9.31,42.12 | <..1941-03-26
Dire Dawa | @9.6,41.87 | <..1941-03-29
Debre Markos | @10.33,37.72 | <..1941-04-04
Addis Ababa | @9.03,38.74 | <..1941-04-06
Dessie | @11.13,39.63 | <..1941-04-26
Amba Alagi | @12.98,39.52 | <..1941-05-18
Soddu | @6.85,37.75 | <..1941-05-22
Maji | @6.2,35.58 | <..1941-06-30
Lekemti | @9.08,36.55 | <..1941-06-20
Jimma | @7.67,36.83 | <..1941-06-21
Debre Tabor | @11.85,38.02 | <..1941-07-06
Gondar | @12.6,37.47 | <..>
Mega | @4.07,38.32 | <..1941-02-18
Om Hajer | @14.33,36.65 | <..1941-01-22
Metemma | @12.96,36.2 | <..1941-01-31
Guba | @11.27,35.28 | <..1941-02-10
Lugh Ferrandi | @3.8,42.55 | <..1941-03-03
Bardera | @2.34,42.28 | <..1941-02-26
Yavello | @4.88,38.1 | <..1941-02-22
Dagahbur | @8.22,43.57 | <..1941-03-10
# --- Italian Somaliland
El Wak | @2.8,40.93 | <..1940-12-16
Afmadow | @0.52,42.07 | <..1941-02-11
Kismayu | @-0.36,42.55 | <..1941-02-14
Jelib | @0.49,42.77 | <..1941-02-22
Mogadishu | @2.05,45.32 | <..1941-02-25
Belet Uen | @4.74,45.2 | <..1941-03-01
Gabredarre | @6.74,44.27 | <..1941-03-10
Obbia | @5.35,48.53 | <..1941-03-10
Galcaio | @6.77,47.43 | <..1941-03-15
Garoe | @8.4,48.48 | <..1941-04-01
Bender Cassim | @11.28,49.18 | <..1941-04-20
Dante | @10.42,51.26 | <..1941-04-20
# --- Taken by Italy in 1940
Kassala | @15.45,36.4 | 1940-07-04..1941-01-18
Gallabat | @12.96,36.15 | 1940-07-04..1940-11-06
Kurmuk | @10.55,34.28 | 1940-07-07..1941-02-14
Moyale | @3.53,39.05 | 1940-07-15..1941-02-22
Hargeisa | @9.56,44.07 | 1940-08-05..1941-03-20
Zeila | @11.35,43.47 | 1940-08-05..1941-03-18
Burao | @9.52,45.53 | 1940-08-15..1941-03-24
Berbera | @10.43,45.01 | 1940-08-19..1941-03-16
# --- Never taken
Port Sudan | @19.62,37.22 | -
Roseires | @11.85,34.38 | -
Malakal | @9.53,31.66 | -
Juba | @4.85,31.58 | -
Lodwar | @3.12,35.6 | -
Marsabit | @2.33,37.99 | -
Lamu | @-2.27,40.9 | -
Malindi | @-3.22,40.12 | -
Mombasa | @-4.04,39.67 | -
Khartoum | @15.5,32.56 | -
Gedaref | @14.03,35.39 | -
Wajir | @1.75,40.06 | -
Garissa | @-0.46,39.65 | -
Nairobi | @-1.29,36.82 | -
`,
};

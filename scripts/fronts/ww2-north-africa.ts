import type { TheatreSource } from './types';

/**
 * The desert war in Libya and Egypt, from Italy's invasion of Egypt (13 September 1940) to the
 * fall of Tripoli (23 January 1943). Side A is the Axis (Italy, with Germany from 1941).
 */
export const WW2_WESTERN_DESERT: TheatreSource = {
  id: 'ww2-western-desert',
  name: 'Western Desert front',
  war: 'World War II',
  conflictId: 'conflict-world-war-ii',
  sideA: 'Axis (Italy and Germany)',
  sideB: 'British Commonwealth',
  start: '1940-09-13',
  end: '1943-01-23',
  horizonDays: 12,
  maxEdgeKm: 520,
  colorA: 'italy',
  colorB: 'uk',
  politiesA: '^italian libya',
  politiesB: '^(kingdom of egypt|egypt)',
  sources: [
    'https://en.wikipedia.org/wiki/Western_Desert_campaign',
    'https://en.wikipedia.org/wiki/Operation_Compass',
    'https://en.wikipedia.org/wiki/Operation_Crusader',
    'https://en.wikipedia.org/wiki/Battle_of_Gazala',
    'https://en.wikipedia.org/wiki/Second_Battle_of_El_Alamein',
  ],
  places: `
# --- Tripolitania
Tripoli | Tripoli, Libya | <..>
Homs | Al-Khums | <..1943-01-20
Misrata | | <..1943-01-18
Mizda | | <..1943-01-22
Hun | Hun, Libya | <..1943-01-14
Buerat | @31.41,15.72 | <..1943-01-16
Sirte | | <..1942-12-25
Nofilia | @30.78,17.83 | <..1942-12-17
Marada | @29.23,19.21 | <..1942-12-16
# --- Cyrenaica
El Agheila | | <..1941-02-08, 1941-03-24..1942-12-15
Mersa Brega | Brega | <..1941-02-07, 1941-03-31..1942-12-13
Agedabia | Ajdabiya | <..1941-02-06, 1941-04-02..1942-01-06, 1942-01-22..1942-11-23
Benghazi | | <..1941-02-06, 1941-04-04..1941-12-24, 1942-01-29..1942-11-20
Msus | @31.60,21.02 | <..1941-02-05, 1941-04-06..1941-12-23, 1942-01-25..1942-11-18
Barce | Marj | <..1941-02-05, 1941-04-05..1941-12-23, 1942-01-31..1942-11-19
Derna | Derna, Libya | <..1941-01-30, 1941-04-07..1941-12-19, 1942-02-03..1942-11-15
Mechili | @32.13,22.28 | <..1941-01-27, 1941-04-08..1941-12-18, 1942-02-03..1942-11-14
Gazala | @32.17,23.33 | <..1941-01-24, 1941-04-09..1941-12-17, 1942-06-14..1942-11-14
Bir Hakeim | | <..1941-01-25, 1941-04-09..1941-12-15, 1942-06-11..1942-11-13
Tobruk | | <..1941-01-22, 1942-06-21..1942-11-13
El Adem | @31.86,23.91 | <..1941-01-22, 1941-04-10..1941-12-08, 1942-06-17..1942-11-13
Bardia | | <..1941-01-05, 1941-04-12..1942-01-02, 1942-06-22..1942-11-12
Jarabub | Jaghbub | <..1941-03-21, 1942-06-28..1942-11-10
# --- Egypt
Sollum | Sallum | 1940-09-13..1940-12-16, 1941-04-13..1942-01-12, 1942-06-23..1942-11-11
Sidi Barrani | | 1940-09-16..1940-12-10, 1942-06-24..1942-11-09
Mersa Matruh | | 1942-06-29..1942-11-08
Fuka | @31.07,27.92 | 1942-06-29..1942-11-05
El Daba | El Dabaa | 1942-06-30..1942-11-05
Siwa | Siwa Oasis | 1942-07-21..1942-11-08
Kufra | @24.18,23.29 | <..1941-03-01
Jalo | @29.03,21.55 | <..1942-11-25
Farafra | @27.06,27.97 | -
Dakhla | @25.49,29.0 | -
Kharga | @25.44,30.55 | -
El Alamein | | -
@line alamein = 30.84,28.95; 30.7,28.92; 30.55,28.87; 30.4,28.8; 30.25,28.7 | - | 1942-07-01..1942-11-04 | 9 | 4
Ain Dalla | @27.32,27.33 | -
Gilf Kebir | @23.5,26.0 | -
Uweinat | @21.9,25.0 | -
Alexandria | | -
Wadi Natrun | Wadi El Natrun | -
Cairo | | -
Bahariya | Bahariya Oasis | -
`,
};

/**
 * Tunisia, from the first clashes after the Allied landings in Algeria (17 November 1942) to
 * the Axis surrender (13 May 1943). Side A is the Axis; the Eighth Army comes up from Libya.
 */
export const WW2_TUNISIA: TheatreSource = {
  id: 'ww2-tunisian-campaign',
  name: 'Tunisian front',
  war: 'World War II',
  conflictId: 'conflict-world-war-ii',
  sideA: 'Axis (Germany and Italy)',
  sideB: 'Allies',
  start: '1942-11-17',
  end: '1943-05-13',
  horizonDays: 12,
  maxEdgeKm: 330,
  colorA: 'germany',
  colorB: 'allies',
  politiesA: '^italian libya',
  politiesB: '^(french protectorate of tunisia|french algeria|algeria)',
  sources: [
    'https://en.wikipedia.org/wiki/Tunisian_campaign',
    'https://en.wikipedia.org/wiki/Battle_of_Kasserine_Pass',
    'https://en.wikipedia.org/wiki/Battle_of_the_Mareth_Line',
  ],
  places: `
# --- Algeria and western Tunisia (Allied)
Bône | Annaba | -
Souk Ahras | | -
Tébessa | | -
Tabarka | | -
Béja | | -
Le Kef | El Kef | -
Thala | Thala, Tunisia | -
Sbiba | | -
# --- The north
Medjez el Bab | Medjez el-Bab | <..1942-11-25
Tebourba | | <..1942-11-27, 1942-12-04..1943-05-07
Mateur | | <..1943-05-03
Bizerte | | <..1943-05-07
Tunis | | <..1943-05-07
Zaghouan | | <..1943-05-11
Hammamet | Hammamet, Tunisia | <..1943-05-10
Kelibia | | <..1943-05-11
Enfidaville | Enfidha | <..1943-04-20
# --- The centre
Kairouan | | <..1943-04-11
Sousse | | <..1943-04-12
Sfax | | <..1943-04-10
Faid | @34.97,9.62 | <..1942-12-03, 1943-01-30..1943-04-09
Sidi Bouzid | | 1943-02-14..1943-03-20
Sbeitla | | 1943-02-17..1943-03-01
Kasserine | | 1943-02-18..1943-02-25
Fériana | | 1943-02-17..1943-02-27
Gafsa | | <..1942-11-22, 1943-02-15..1943-03-17
El Guettar | El Guettar, Tunisia | <..1943-03-18
Maknassy | | <..1943-03-22
# --- The south and Tripolitania
Gabès | | <..1943-03-29
Mareth | | <..1943-03-28
Medenine | | <..1943-02-17
Ben Gardane | | <..1943-02-15
Zuara | Zuwarah | <..1943-01-31
Nalut | | <..1943-02-01
Tripoli | Tripoli, Libya | <..1943-01-23
`,
};

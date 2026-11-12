import type { TheatreSource } from './types';

/**
 * South Vietnam from the Easter Offensive to the fall of Saigon, 30 March 1972 – 30 April
 * 1975: what North Vietnam's army took in 1972 and kept under the Paris accords, and the
 * collapse of March and April 1975. Side A is North Vietnam and the Provisional Revolutionary
 * Government. Guerrilla-held countryside in the south is not shown: only the ground the
 * main-force armies held.
 */
export const VIETNAM_1972_75: TheatreSource = {
  id: 'vietnam-war-1972-1975',
  name: 'Vietnam War: the North’s advance (1972–75)',
  war: 'Vietnam War',
  conflictId: 'conflict-vietnam-war',
  sideA: 'North Vietnam and the Provisional Revolutionary Government',
  sideB: 'South Vietnam',
  start: '1972-03-30',
  end: '1975-04-30',
  horizonDays: 14,
  maxEdgeKm: 480,
  colorA: 'north-vietnam',
  colorB: 'south-vietnam',
  politiesA: '^$',
  politiesB: '^(south vietnam|republic of vietnam)',
  sources: [
    'https://en.wikipedia.org/wiki/Easter_Offensive',
    'https://en.wikipedia.org/wiki/1975_spring_offensive',
    'https://en.wikipedia.org/wiki/Battle_of_Ban_Me_Thuot',
    'https://en.wikipedia.org/wiki/Fall_of_Saigon',
  ],
  places: `
# --- North Vietnam and the border
Hanoi | @21.03,105.85 | <..>
Vinh | @18.67,105.69 | <..>
Dong Hoi | @17.47,106.62 | <..>
Khe Sanh | @16.63,106.73 | <..>
# --- Taken in 1972
Loc Ninh | @11.85,106.59 | 1972-04-07..>
Dak To | @14.65,107.83 | 1972-04-24..>
Dong Ha | @16.82,107.1 | 1972-04-28..>
Quang Tri | @16.75,107.19 | 1972-05-01..1972-09-16, 1975-03-19..>
# --- The collapse of 1975
Phuoc Long | @11.82,106.98 | 1975-01-06..>
Ban Me Thuot | @12.67,108.04 | 1975-03-11..>
Kontum | @14.35,108.0 | 1975-03-17..>
Pleiku | @13.98,108.0 | 1975-03-18..>
An Loc | @11.65,106.61 | 1975-03-20..>
Tam Ky | @15.57,108.47 | 1975-03-24..>
Quang Ngai | @15.12,108.8 | 1975-03-25..>
Hue | @16.46,107.6 | 1975-03-25..>
Da Nang | @16.07,108.22 | 1975-03-29..>
Qui Nhon | @13.77,109.23 | 1975-03-31..>
Tuy Hoa | @13.09,109.3 | 1975-04-01..>
Nha Trang | @12.25,109.19 | 1975-04-02..>
Cam Ranh | @11.9,109.2 | 1975-04-03..>
Da Lat | @11.94,108.44 | 1975-04-03..>
Phan Rang | @11.57,108.99 | 1975-04-16..>
Phan Thiet | @10.93,108.1 | 1975-04-19..>
Xuan Loc | @10.93,107.24 | 1975-04-21..>
Tay Ninh | @11.31,106.1 | 1975-04-29..>
# --- Held to the last day
Bien Hoa | @10.95,106.82 | -
Saigon | @10.78,106.7 | -
Vung Tau | @10.35,107.08 | -
My Tho | @10.36,106.36 | -
Can Tho | @10.03,105.78 | -
Rach Gia | @10.01,105.08 | -
Ca Mau | @9.18,105.15 | -
`,
};

/**
 * The Iran–Iraq War, 22 September 1980 – 20 August 1988: Iraq's invasion of Khuzestan and the
 * border hills, Iran's recovery of them by mid-1982 (Khorramshahr on 24 May), and the years
 * in which Iran held pieces of Iraq — the Majnoon marshes, the Faw peninsula, the heights
 * round Haj Omran and Halabja — until Iraq took them back in 1988. Side A is Iraq.
 */
export const IRAN_IRAQ_WAR: TheatreSource = {
  id: 'iran-iraq-war',
  name: 'Iran–Iraq War front',
  war: 'Iran–Iraq War',
  conflictId: 'conflict-iran-iraq-war',
  sideA: 'Iraq',
  sideB: 'Iran',
  start: '1980-09-22',
  end: '1988-08-20',
  horizonDays: 30,
  maxEdgeKm: 420,
  colorA: 'iraq',
  colorB: 'iran',
  politiesA: '^iraq',
  politiesB: '^iran',
  sources: [
    'https://en.wikipedia.org/wiki/Iran%E2%80%93Iraq_War',
    'https://en.wikipedia.org/wiki/Liberation_of_Khorramshahr',
    'https://en.wikipedia.org/wiki/First_Battle_of_al-Faw',
    'https://en.wikipedia.org/wiki/Second_Battle_of_al-Faw',
  ],
  places: `
# --- Iraq (with what Iran held of it)
Erbil | @36.19,44.01 | <..>
Kirkuk | @35.47,44.39 | <..>
Sulaymaniyah | @35.56,45.44 | <..>
Haj Omran | @36.67,45.05 | <..1983-07-22
Halabja | @35.18,45.99 | <..1988-03-15
Khanaqin | @34.35,45.39 | <..>
Mandali | @33.75,45.55 | <..>
Baghdad | @33.31,44.37 | <..>
Kut | @32.51,45.82 | <..>
Amarah | @31.84,47.15 | <..>
Majnoon | @31.1,47.6 | <..1984-02-25, 1988-06-25..>
Basra | @30.51,47.81 | <..>
Umm Qasr | @30.04,47.93 | <..>
Zubair | @30.39,47.71 | <..>
Nasiriyah | @31.04,46.26 | <..>
Samawah | @31.31,45.28 | <..>
Diwaniyah | @31.99,44.93 | <..>
Najaf | @32.0,44.33 | <..>
Al-Faw | @29.98,48.47 | <..1986-02-11, 1988-04-17..>
# --- Iranian ground Iraq took
Qasr-e Shirin | @34.52,45.58 | 1980-09-23..1982-06-20
Naft-e Shahr | @33.99,45.5 | 1980-09-23..1982-06-20
Sumar | @33.87,45.64 | 1980-09-23..1982-06-20
Mehran | @33.12,46.16 | 1980-10-10..1982-06-29, 1986-05-17..1986-07-03
Dehloran | @32.69,47.27 | 1980-10-01..1982-03-30
Musian | @32.52,47.38 | 1980-09-25..1982-03-28
Fakkeh | @32.07,47.72 | 1980-09-24..1982-03-29
Bostan | @31.72,48.0 | 1980-09-28..1981-12-01
Hoveyzeh | @31.46,48.07 | 1980-10-15..1982-05-10
Shalamcheh | @30.5,48.03 | 1980-09-23..1982-05-24
Khorramshahr | @30.44,48.18 | 1980-10-26..1982-05-24
# --- Never taken
Abadan | @30.34,48.3 | -
Ahvaz | @31.32,48.67 | -
Susangerd | @31.56,48.18 | -
Shush | @32.19,48.25 | -
Dezful | @32.38,48.4 | -
Ilam | @33.64,46.42 | -
Gilan-e Gharb | @34.14,45.92 | -
Sarpol-e Zahab | @34.46,45.86 | -
Kermanshah | @34.31,47.07 | -
Marivan | @35.52,46.18 | -
Sanandaj | @35.31,47.0 | -
Baneh | @35.99,45.89 | -
Piranshahr | @36.7,45.14 | -
Tehran | @35.69,51.39 | -
Khorramabad | @33.49,48.36 | -
Masjed Soleyman | @31.94,49.3 | -
Ramhormoz | @31.28,49.6 | -
Bandar Mahshahr | @30.56,49.19 | -
Hendijan | @30.24,49.71 | -
Behbahan | @30.6,50.24 | -
Bushehr | @28.97,50.84 | -
`,
};

/**
 * The wars in Croatia and Bosnia, 1 August 1991 – 21 November 1995: the ground held by the
 * Yugoslav army and the Serb forces of the Krajina and of Republika Srpska, to the Croatian
 * offensives of 1995 and the Dayton agreement. Side A is those Serb forces. The fighting
 * between Croats and Bosniaks in 1993–94 is not shown.
 */
export const YUGOSLAV_WARS: TheatreSource = {
  id: 'yugoslav-wars',
  name: 'Wars in Croatia and Bosnia: Serb-held territory',
  war: 'Yugoslav Wars',
  conflictId: 'conflict-yugoslav-wars',
  sideA: 'Yugoslav army, Republic of Serbian Krajina and Republika Srpska',
  sideB: 'Croatia and Bosnia and Herzegovina',
  start: '1991-08-01',
  end: '1995-11-21',
  horizonDays: 30,
  maxEdgeKm: 300,
  colorA: 'yugoslavia',
  colorB: 'croatia',
  politiesA: '^$',
  politiesB: '^(croatia|bosnia and herzegovina)$',
  sources: [
    'https://en.wikipedia.org/wiki/Croatian_War_of_Independence',
    'https://en.wikipedia.org/wiki/Bosnian_War',
    'https://en.wikipedia.org/wiki/Operation_Storm',
    'https://en.wikipedia.org/wiki/Operation_Sana',
  ],
  places: `
# --- Croatia: the Krajina
Knin | @44.04,16.2 | <..1995-08-05
Gračac | @44.3,15.85 | <..1995-08-05
Korenica | @44.74,15.71 | <..1995-08-05
Benkovac | @44.03,15.61 | 1991-08-15..1995-08-05
Obrovac | @44.2,15.68 | 1991-09-15..1995-08-05
Drniš | @43.86,16.16 | 1991-09-16..1995-08-05
Glina | @45.34,16.09 | <..1995-08-06
Dvor | @45.07,16.37 | <..1995-08-07
Kostajnica | @45.23,16.54 | 1991-09-13..1995-08-06
Petrinja | @45.44,16.28 | 1991-09-21..1995-08-06
Slunj | @45.12,15.58 | 1991-11-16..1995-08-06
Okučani | @45.26,17.2 | 1991-08-16..1995-05-02
Cavtat | @42.58,18.22 | 1991-10-15..1992-10-20
# --- Croatia: eastern Slavonia
Erdut | @45.52,19.06 | <..>
Beli Manastir | @45.77,18.6 | 1991-08-20..>
Ilok | @45.22,19.38 | 1991-10-17..>
Vukovar | @45.35,19.0 | 1991-11-18..>
# --- Croatia: never taken
Osijek | @45.55,18.69 | -
Vinkovci | @45.29,18.8 | -
Slavonski Brod | @45.19,18.02 | -
Pakrac | @45.44,17.19 | -
Sisak | @45.47,16.37 | -
Zagreb | @45.81,15.98 | -
Karlovac | @45.49,15.55 | -
Ogulin | @45.27,15.22 | -
Otočac | @44.87,15.24 | -
Gospić | @44.55,15.37 | -
Zadar | @44.12,15.23 | -
Šibenik | @43.73,15.9 | -
Sinj | @43.7,16.64 | -
Split | @43.51,16.44 | -
Dubrovnik | @42.65,18.09 | -
# --- Bosnia: Serb-held
Banja Luka | @44.77,17.19 | <..>
Pale | @43.82,18.57 | <..>
Trebinje | @42.71,18.34 | <..>
Nevesinje | @43.26,18.11 | <..>
Bijeljina | @44.76,19.21 | 1992-04-02..>
Zvornik | @44.39,19.1 | 1992-04-09..>
Višegrad | @43.78,19.29 | 1992-04-14..>
Foča | @43.51,18.78 | 1992-04-17..>
Vlasenica | @44.18,18.94 | 1992-04-21..>
Prijedor | @44.98,16.71 | 1992-04-30..>
Doboj | @44.73,18.09 | 1992-05-03..>
Brčko | @44.87,18.81 | 1992-05-07..>
Modriča | @44.96,18.3 | 1992-06-28..>
Derventa | @44.98,17.91 | 1992-07-04..>
Bosanski Brod | @45.14,18.01 | 1992-10-06..>
Srebrenica | @44.1,19.3 | 1995-07-11..>
Žepa | @43.95,19.13 | 1995-07-25..>
# --- Bosnia: lost in 1994–95
Kupres | @43.99,17.28 | 1992-04-10..1994-11-03
Bosansko Grahovo | @44.18,16.37 | <..1995-07-28
Glamoč | @44.05,16.85 | <..1995-07-28
Drvar | @44.37,16.38 | <..1995-09-14
Bosanski Petrovac | @44.55,16.37 | <..1995-09-15
Ključ | @44.53,16.78 | 1992-05-27..1995-09-15
Jajce | @44.34,17.27 | 1992-10-29..1995-09-13
Donji Vakuf | @44.14,17.4 | 1992-05-10..1995-09-13
Bosanska Krupa | @44.88,16.15 | 1992-04-21..1995-09-17
Sanski Most | @44.77,16.67 | 1992-05-25..1995-10-10
Mrkonjić Grad | @44.42,17.08 | <..1995-10-10
# --- Bosnia: never taken
Sarajevo | @43.85,18.4 | -
Goražde | @43.67,18.98 | -
Tuzla | @44.54,18.68 | -
Gradačac | @44.88,18.43 | -
Orašje | @45.03,18.69 | -
Maglaj | @44.55,18.1 | -
Zenica | @44.2,17.91 | -
Travnik | @44.23,17.66 | -
Bugojno | @44.06,17.45 | -
Konjic | @43.65,17.96 | -
Mostar | @43.34,17.81 | -
Livno | @43.83,17.0 | -
Bihać | @44.82,15.87 | -
Velika Kladuša | @45.19,15.81 | -
# --- Serbia and Montenegro
Sombor | @45.77,19.11 | <..>
Novi Sad | @45.25,19.85 | <..>
Šabac | @44.75,19.69 | <..>
Belgrade | @44.8,20.47 | <..>
Užice | @43.86,19.84 | <..>
Nikšić | @42.77,18.94 | <..>
Herceg Novi | @42.45,18.53 | <..>
`,
};

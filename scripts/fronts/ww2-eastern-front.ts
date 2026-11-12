import type { TheatreSource } from './types';

/**
 * Germany and its allies against the Soviet Union, 22 June 1941 – 9 May 1945. Side A is the
 * Axis: a period is the time a place was in Axis hands. (Finland's front is a theatre of its
 * own: it ended with an armistice, not an advance.)
 */
export const WW2_EASTERN_FRONT: TheatreSource = {
  id: 'ww2-eastern-front',
  name: 'Eastern Front',
  war: 'World War II',
  conflictId: 'conflict-world-war-ii',
  sideA: 'Axis (Germany and its allies)',
  sideB: 'Soviet Union',
  start: '1941-06-22',
  end: '1945-05-09',
  maxEdgeKm: 560,
  colorA: 'germany',
  colorB: 'ussr',
  politiesA:
    '^(german reich|generalgouvernement|reichskommissariat|bezirk bialystok|protectorate of bohemia|slovak|kingdom of hungary|hungarian|kingdom of romania|tsardom of bulgaria|independent state of croatia|territory of the military commander in serbia|kingdom of yugoslavia)',
  politiesB: '^(soviet union|ussr)',
  sources: [
    'https://en.wikipedia.org/wiki/Eastern_Front_(World_War_II)',
    'https://en.wikipedia.org/wiki/Operation_Barbarossa',
    'https://en.wikipedia.org/wiki/Battle_of_Moscow',
    'https://en.wikipedia.org/wiki/Case_Blue',
    'https://en.wikipedia.org/wiki/Battle_of_Stalingrad',
    'https://en.wikipedia.org/wiki/Battle_of_the_Dnieper',
    'https://en.wikipedia.org/wiki/Operation_Bagration',
    'https://en.wikipedia.org/wiki/Vistula%E2%80%93Oder_offensive',
    'https://en.wikipedia.org/wiki/Battle_of_Berlin',
  ],
  places: `
# --- East Prussia and the Baltic
Memel | Klaipėda | <..1945-01-28
Tilsit | Sovetsk, Kaliningrad Oblast | <..1945-01-20
Königsberg | Kaliningrad | <..1945-04-09
Pillau | Baltiysk | <..1945-04-25
Insterburg | Chernyakhovsk | <..1945-01-22
Gumbinnen | Gusev, Kaliningrad Oblast | <..1945-01-21
Suwałki | | <..1944-10-23
Tauragė | | 1941-06-22..1944-10-10
Kaunas | | 1941-06-24..1944-08-01
Vilnius | | 1941-06-24..1944-07-13
Šiauliai | | 1941-06-26..1944-07-27
Panevėžys | | 1941-06-27..1944-07-22
Liepāja | | 1941-06-29..>
Ventspils | | 1941-07-01..>
Tukums | | 1941-07-01..>
Jelgava | | 1941-06-29..1944-07-31
Riga | | 1941-07-01..1944-10-13
Daugavpils | | 1941-06-26..1944-07-27
Rēzekne | | 1941-07-03..1944-07-27
Pärnu | | 1941-07-08..1944-09-23
Tartu | | 1941-07-25..1944-08-25
Tallinn | | 1941-08-28..1944-09-22
Narva | | 1941-08-17..1944-07-26
Kuressaare | | 1941-09-21..1944-10-07
# --- Leningrad and the north-west
Kingisepp | | 1941-08-16..1944-02-01
Pskov | | 1941-07-09..1944-07-23
Ostrov | Ostrov, Ostrovsky District, Pskov Oblast | 1941-07-06..1944-07-21
Luga | Luga, Leningrad Oblast | 1941-08-24..1944-02-12
Novgorod | Veliky Novgorod | 1941-08-15..1944-01-20
Chudovo | Chudovo, Chudovsky District, Novgorod Oblast | 1941-08-20..1944-01-29
Lyuban | Lyuban (town), Leningrad Oblast | 1941-08-25..1944-01-28
Tosno | | 1941-08-28..1944-01-26
Mga | | 1941-08-30..1944-01-21
Shlisselburg | | 1941-09-08..1943-01-18
Pushkin | Pushkin, Saint Petersburg | 1941-09-17..1944-01-24
Krasnoye Selo | | 1941-09-12..1944-01-19
Peterhof | Petergof | 1941-09-23..1944-01-19
Gatchina | | 1941-09-13..1944-01-26
Leningrad | Saint Petersburg | -
Kronstadt | | -
Oranienbaum | Lomonosov, Russia | -
Kolpino | | -
Volkhov | | -
Novaya Ladoga | | -
Tikhvin | | 1941-11-08..1941-12-09
Malaya Vishera | | 1941-10-23..1941-11-20
Kirishi | | 1941-10-28..1943-10-04
Staraya Russa | | 1941-08-09..1944-02-18
Demyansk | | 1941-09-08..1943-02-21
Kholm | Kholm, Kholmsky District, Novgorod Oblast | 1941-08-03..1944-02-21
Valday | Valday, Novgorod Oblast | -
Ostashkov | | -
Bologoye | Bologoye, Tver Oblast | -
Vyshny Volochyok | | -
Toropets | | 1941-08-29..1942-01-21
Andreapol | | 1941-09-01..1942-01-16
Velikiye Luki | | 1941-08-25..1943-01-17
Nevel | Nevel (town) | 1941-07-16..1943-10-07
Novosokolniki | | 1941-07-25..1944-01-29
Idritsa | | 1941-07-15..1944-07-12
Opochka | | 1941-07-08..1944-07-15
# --- Belarus and Smolensk
Polotsk | | 1941-07-16..1944-07-04
Vitebsk | | 1941-07-11..1944-06-26
Velizh | | 1941-07-13..1943-09-20
Demidov | Demidov, Smolensk Oblast | 1941-07-13..1943-09-21
Bely | Bely, Tver Oblast | 1941-10-04..1943-03-10
Brest | Brest, Belarus | 1941-06-22..1944-07-28
Grodno | | 1941-06-23..1944-07-16
Białystok | | 1941-06-27..1944-07-27
Lida | | 1941-06-27..1944-07-08
Baranovichi | | 1941-06-27..1944-07-08
Pinsk | | 1941-07-04..1944-07-14
Minsk | | 1941-06-28..1944-07-03
Molodechno | Maladzyechna | 1941-06-26..1944-07-05
Borisov | Barysaw | 1941-07-02..1944-07-01
Bobruisk | Babruysk | 1941-06-28..1944-06-29
Slutsk | | 1941-06-26..1944-06-30
Mogilev | | 1941-07-26..1944-06-28
Orsha | | 1941-07-16..1944-06-27
Gomel | | 1941-08-19..1943-11-26
Rechitsa | Rechytsa | 1941-08-23..1943-11-18
Mozyr | Mazyr | 1941-08-22..1944-01-14
Zhlobin | | 1941-08-14..1944-06-26
Rogachev | Rahachow | 1941-08-14..1944-02-24
Krichev | Krychaw | 1941-07-17..1943-09-30
Lepel | | 1941-07-03..1944-06-28
Osipovichi | Asipovichy | 1941-06-30..1944-06-28
Klintsy | | 1941-08-20..1943-09-25
Unecha | | 1941-08-17..1943-09-23
Starodub | | 1941-08-18..1943-09-22
Pochep | Pochep, Bryansk Oblast | 1941-08-22..1943-09-21
Trubchevsk | | 1941-10-09..1943-09-18
Smolensk | | 1941-07-16..1943-09-25
Roslavl | | 1941-08-03..1943-09-25
Yelnya | Yelnya, Yelninsky District, Smolensk Oblast | 1941-07-19..1941-09-06, 1941-10-06..1943-08-30
Dorogobuzh | | 1941-10-05..1943-09-01
Yartsevo | Yartsevo, Smolensk Oblast | 1941-10-05..1943-09-16
Dukhovshchina | Dukhovshchina, Smolensk Oblast | 1941-07-15..1943-09-19
# --- Rzhev, Moscow and Tula
Rzhev | | 1941-10-14..1943-03-03
Zubtsov | | 1941-10-11..1942-08-23
Sychyovka | Sychyovka, Sychyovsky District, Smolensk Oblast | 1941-10-10..1943-03-08
Gzhatsk | Gagarin, Smolensk Oblast | 1941-10-09..1943-03-06
Vyazma | | 1941-10-07..1943-03-12
Kalinin | Tver | 1941-10-14..1941-12-16
Staritsa | Staritsa (town), Tver Oblast | 1941-10-12..1942-01-01
Torzhok | | -
Klin | Klin, Klinsky District, Moscow Oblast | 1941-11-23..1941-12-15
Solnechnogorsk | | 1941-11-23..1941-12-12
Istra | Istra, Istrinsky District, Moscow Oblast | 1941-11-26..1941-12-11
Volokolamsk | | 1941-10-27..1941-12-20
Mozhaisk | Mozhaysk | 1941-10-18..1942-01-20
Naro-Fominsk | | 1941-10-22..1941-12-26
Maloyaroslavets | | 1941-10-18..1942-01-02
Kaluga | | 1941-10-12..1941-12-30
Yukhnov | | 1941-10-05..1942-03-05
Medyn | | 1941-10-11..1942-01-14
Moscow | | -
Dmitrov | | -
Serpukhov | | -
Kashira | | -
Kolomna | | -
Ryazan | | -
Tula | Tula, Russia | -
Venyov | | 1941-11-25..1941-12-09
Stalinogorsk | Novomoskovsk, Russia | 1941-11-25..1941-12-12
Mikhaylov | Mikhaylov, Ryazan Oblast | 1941-11-24..1941-12-07
Yefremov | Yefremov (town) | 1941-11-22..1941-12-13
Yelets | | 1941-12-04..1941-12-09
Livny | | 1941-11-26..1941-12-25
Kozelsk | | 1941-10-08..1941-12-28
Sukhinichi | | 1941-10-07..1942-01-29
Kirov (Kaluga) | Kirov, Kaluga Oblast | 1941-10-04..1942-01-11
Belyov | | 1941-10-24..1941-12-31
Mtsensk | | 1941-10-11..1943-07-20
Bolkhov | | 1941-10-10..1943-07-28
Zhizdra | | 1941-10-05..1943-08-16
Spas-Demensk | | 1941-10-04..1943-08-13
# --- Bryansk, Orel, Kursk
Bryansk | | 1941-10-06..1943-09-17
Orel | Oryol | 1941-10-03..1943-08-05
Karachev | | 1941-10-06..1943-08-15
Kromy | Kromy, Oryol Oblast | 1941-10-02..1943-08-06
Novosil | | 1941-11-13..1941-12-27
Maloarkhangelsk | Maloarkhangelsk, Oryol Oblast | 1941-11-11..1943-02-23
Kursk | | 1941-11-02..1943-02-08
Shchigry | Shchigry, Kursk Oblast | 1941-11-21..1943-02-05
Fatezh | | 1941-10-22..1943-02-07
Dmitriyev | Dmitriyev (town) | 1941-10-08..1943-03-02
Sevsk | Sevsk, Bryansk Oblast | 1941-10-01..1943-08-27
Rylsk | Rylsk, Russia | 1941-10-05..1943-08-30
Lgov | Lgov, Kursk Oblast | 1941-10-27..1943-03-03
Oboyan | | 1941-11-15..1943-02-18
Belgorod | | 1941-10-24..1943-02-09, 1943-03-18..1943-08-05
Stary Oskol | | 1942-07-02..1943-02-05
Novy Oskol | | 1942-07-02..1943-01-28
Valuyki | Valuyki, Belgorod Oblast | 1942-07-06..1943-01-19
# --- Voronezh, the Don and Stalingrad
Voronezh | | 1942-07-06..1943-01-25
Ostrogozhsk | | 1942-07-05..1943-01-20
Rossosh | Rossosh, Rossoshansky District, Voronezh Oblast | 1942-07-07..1943-01-16
Kantemirovka | @49.70,39.86 | 1942-07-10..1942-12-19
Boguchar | | 1942-07-10..1942-12-19
Millerovo | @48.92,40.40 | 1942-07-16..1943-01-17
Liski | Liski, Voronezh Oblast | -
Lipetsk | | -
Michurinsk | | -
Tambov | | -
Borisoglebsk | | -
Uryupinsk | | -
Serafimovich | Serafimovich (town) | -
Frolovo | | -
Kamyshin | | -
Saratov | | -
Morozovsk | | 1942-07-15..1943-01-05
Tatsinskaya | @48.19,41.27 | 1942-07-18..1942-12-31
Tormosin | | 1942-07-25..1942-12-31
Kalach-na-Donu | | 1942-08-25..1942-11-23
Kotelnikovo | Kotelnikovo, Volgograd Oblast | 1942-08-02..1942-12-29
Abganerovo | @48.03,43.93 | 1942-08-08..1942-11-20
Zimovniki | | 1942-08-01..1943-01-07
Stalingrad | Volgograd | 1942-09-13..1943-02-02
Gumrak | | 1942-08-28..1943-01-22
Karpovka | @48.70,43.97 | 1942-08-25..1943-01-10
Beketovka | @48.59,44.43 | -
Dubovka | Dubovka, Volgograd Oblast | -
Leninsk | Leninsk, Volgograd Oblast | -
Ilovlya | @49.30,43.98 | -
Astrakhan | | -
Elista | | 1942-08-12..1942-12-31
# --- Donbas and Rostov
Kharkov | Kharkiv | 1941-10-24..1943-02-16, 1943-03-15..1943-08-23
Sumy | | 1941-10-10..1943-09-02
Akhtyrka | Okhtyrka | 1941-10-15..1943-02-23, 1943-03-11..1943-08-25
Poltava | | 1941-09-18..1943-09-23
Krasnograd | Berestyn | 1941-09-20..1943-09-19
Lozovaya | Lozova | 1941-10-11..1942-01-27, 1942-05-25..1943-02-11, 1943-02-26..1943-09-16
Barvenkovo | Barvinkove | 1941-10-24..1942-01-23, 1942-05-17..1943-02-06, 1943-02-28..1943-09-10
Izyum | Izium | 1942-06-24..1943-02-05
Kupyansk | Kupiansk | 1942-06-24..1943-02-03
Chuguyev | Chuhuiv | 1941-10-30..1943-02-10, 1943-03-18..1943-08-11
Slavyansk | Sloviansk | 1941-10-28..1943-02-17, 1943-03-01..1943-09-06
Kramatorsk | | 1941-10-27..1943-02-05, 1943-02-28..1943-09-06
Artemovsk | Bakhmut | 1941-10-31..1943-09-05
Voroshilovgrad | Luhansk | 1942-07-17..1943-02-14
Stalino | Donetsk | 1941-10-21..1943-09-08
Mariupol | | 1941-10-08..1943-09-10
Taganrog | | 1941-10-17..1943-08-30
Rostov-on-Don | | 1941-11-21..1941-11-29, 1942-07-24..1943-02-14
Novocherkassk | | 1942-07-25..1943-02-13
Shakhty | | 1942-07-21..1943-02-12
Kamensk | Kamensk-Shakhtinsky | 1942-07-18..1943-02-13
Bataysk | | 1942-07-27..1943-02-07
Azov | | 1942-07-28..1943-02-07
Yeysk | | 1942-08-09..1943-02-05
Salsk | | 1942-07-31..1943-01-22
Tikhoretsk | | 1942-08-05..1943-01-30
# --- The Caucasus
Krasnodar | | 1942-08-09..1943-02-12
Maykop | | 1942-08-09..1943-01-29
Armavir | Armavir, Russia | 1942-08-07..1943-01-24
Stavropol | | 1942-08-03..1943-01-21
Kropotkin | Kropotkin, Krasnodar Krai | 1942-08-05..1943-01-29
Cherkessk | | 1942-08-11..1943-01-17
Pyatigorsk | | 1942-08-09..1943-01-11
Mineralnye Vody | | 1942-08-10..1943-01-11
Nalchik | | 1942-10-28..1943-01-03
Mozdok | | 1942-08-25..1943-01-03
Prokhladny | Prokhladny, Kabardino-Balkarian Republic | 1942-08-26..1943-01-05
Ordzhonikidze | Vladikavkaz | -
Grozny | | -
Kizlyar | | -
Makhachkala | | -
Tuapse | | -
Sochi | | -
Sukhumi | | -
Gelendzhik | | -
Novorossiysk | | 1942-09-10..1943-09-16
Anapa | | 1942-08-31..1943-09-21
Temryuk | | 1942-08-24..1943-09-27
Krymskaya | Krymsk | 1942-08-21..1943-05-04
Slavyanskaya | Slavyansk-na-Kubani | 1942-08-11..1943-03-23
# --- Crimea
Armyansk | | 1941-09-26..1944-04-08
Dzhankoy | | 1941-10-31..1944-04-11
Simferopol | | 1941-11-01..1944-04-13
Yevpatoria | | 1941-10-31..1944-04-13
Feodosia | | 1941-11-03..1941-12-29, 1942-01-18..1944-04-13
Kerch | | 1941-11-16..1941-12-30, 1942-05-15..1944-04-11
Yalta | | 1941-11-08..1944-04-16
Sevastopol | | 1942-07-04..1944-05-09
Bakhchysarai | | 1941-11-02..1944-04-14
# --- Southern Ukraine and the Dnieper
Kherson | | 1941-08-19..1944-03-13
Nikolaev | Mykolaiv | 1941-08-16..1944-03-28
Odessa | Odesa | 1941-10-16..1944-04-10
Melitopol | | 1941-10-06..1943-10-23
Berdyansk | | 1941-10-07..1943-09-17
Genichesk | Henichesk | 1941-09-16..1943-10-30
Nikopol | Nikopol, Ukraine | 1941-08-17..1944-02-08
Krivoy Rog | Kryvyi Rih | 1941-08-14..1944-02-22
Kirovograd | Kropyvnytskyi | 1941-08-05..1944-01-08
Zaporozhye | Zaporizhzhia | 1941-10-04..1943-10-14
Dnepropetrovsk | Dnipro | 1941-08-25..1943-10-25
Dneprodzerzhinsk | Kamianske | 1941-08-22..1943-10-25
Kremenchug | Kremenchuk | 1941-09-08..1943-09-29
Cherkassy | Cherkasy | 1941-08-22..1943-12-14
Korsun | Korsun-Shevchenkivskyi | 1941-07-30..1944-02-14
Uman | | 1941-08-01..1944-03-10
Pervomaisk | Pervomaisk, Mykolaiv Oblast | 1941-08-03..1944-03-22
Voznesensk | | 1941-08-06..1944-03-24
Belaya Tserkov | Bila Tserkva | 1941-07-16..1944-01-04
Fastov | Fastiv | 1941-07-22..1943-11-07
Kiev | Kyiv | 1941-09-19..1943-11-06
Zhitomir | Zhytomyr | 1941-07-09..1943-11-12, 1943-11-19..1943-12-31
Korosten | | 1941-08-07..1943-11-17, 1943-11-27..1943-12-29
Berdichev | Berdychiv | 1941-07-07..1944-01-05
Novograd-Volynsky | Zviahel | 1941-07-08..1944-01-03
Vinnitsa | Vinnytsia | 1941-07-19..1944-03-20
Proskurov | Khmelnytskyi, Ukraine | 1941-07-08..1944-03-25
Kamenets-Podolsky | Kamianets-Podilskyi | 1941-07-10..1944-03-26
Shepetovka | Shepetivka | 1941-07-05..1944-02-11
Rovno | Rivne | 1941-06-28..1944-02-02
Lutsk | | 1941-06-25..1944-02-02
Kovel | | 1941-06-28..1944-07-06
Sarny | | 1941-07-08..1944-01-11
Ternopol | Ternopil | 1941-07-02..1944-04-15
Lvov | Lviv | 1941-06-30..1944-07-27
Stanislav | Ivano-Frankivsk | 1941-07-02..1944-07-27
Chernovtsy | Chernivtsi | 1941-07-05..1944-03-29
Drohobych | | 1941-07-01..1944-08-06
Brody | | 1941-06-29..1944-07-17
Vladimir-Volynsky | Volodymyr (city) | 1941-06-23..1944-07-20
Mogilev-Podolsky | Mohyliv-Podilskyi | 1941-07-19..1944-03-19
Balta | Balta, Ukraine | 1941-08-05..1944-03-29
Chernigov | Chernihiv | 1941-09-09..1943-09-21
Nezhin | Nizhyn | 1941-09-13..1943-09-15
Konotop | | 1941-09-09..1943-09-06
Bakhmach | | 1941-09-10..1943-09-09
Priluki | Pryluky | 1941-09-18..1943-09-18
Romny | | 1941-09-10..1943-09-16
Lubny | | 1941-09-13..1943-09-18
Glukhov | Hlukhiv | 1941-09-09..1943-08-30
Novgorod-Seversky | Novhorod-Siverskyi | 1941-08-26..1943-09-16
Pereyaslav | | 1941-09-17..1943-09-21
Kanev | Kaniv | 1941-08-15..1944-01-31
# --- Bessarabia and Romania
Kishinev | Chișinău | 1941-07-16..1944-08-24
Tiraspol | | 1941-08-08..1944-04-12
Bălți | | 1941-07-09..1944-03-26
Bendery | Bender, Moldova | 1941-07-23..1944-08-23
Izmail | | 1941-07-22..1944-08-26
Botoșani | | <..1944-04-07
Iași | | <..1944-08-21
Galați | | <..1944-08-27
Focșani | | <..1944-08-27
Constanța | | <..1944-08-29
Ploiești | | <..1944-08-30
Bucharest | | <..1944-08-31
Brașov | | <..1944-09-04
Sibiu | | <..1944-08-30
Craiova | | <..1944-09-05
Timișoara | | <..1944-08-25
Arad | Arad, Romania | <..1944-09-21
Cluj | Cluj-Napoca | <..1944-10-11
Oradea | | <..1944-10-12
Târgu Mureș | | <..1944-09-28
# --- Bulgaria and Yugoslavia
Ruse | Ruse, Bulgaria | <..1944-09-08
Varna | Varna, Bulgaria | <..1944-09-08
Sofia | | <..1944-09-09
Niš | | <..1944-10-14
Belgrade | | <..1944-10-20
Novi Sad | | <..1944-10-23
Subotica | | <..1944-10-10
Vukovar | | <..1945-04-12
Osijek | | <..1945-04-14
Zagreb | | <..1945-05-08
# --- Poland
Łomża | | 1941-06-24..1944-09-13
Ostrołęka | | <..1944-09-06
Siedlce | | <..1944-07-31
Biała Podlaska | | <..1944-07-26
Lublin | | <..1944-07-24
Chełm | | <..1944-07-22
Zamość | | <..1944-07-25
Przemyśl | | <..1944-07-27
Jarosław | | <..1944-07-27
Rzeszów | | <..1944-08-02
Sandomierz | | <..1944-08-18
Warsaw | | <..1945-01-17
Radom | | <..1945-01-16
Kielce | | <..1945-01-15
Kraków | | <..1945-01-19
Łódź | | <..1945-01-19
Częstochowa | | <..1945-01-17
Katowice | | <..1945-01-28
Poznań | | <..1945-02-23
Bromberg | Bydgoszcz | <..1945-01-23
Thorn | Toruń | <..1945-02-01
Graudenz | Grudziądz | <..1945-03-06
Elbing | Elbląg | <..1945-02-10
Allenstein | Olsztyn | <..1945-01-22
Danzig | Gdańsk | <..1945-03-30
Gdynia | | <..1945-03-28
Kolberg | Kołobrzeg | <..1945-03-18
Stettin | Szczecin | <..1945-04-26
Schneidemühl | Piła | <..1945-02-14
Küstrin | Kostrzyn nad Odrą | <..1945-03-30
Breslau | Wrocław | <..1945-05-06
Glogau | Głogów | <..1945-04-01
Oppeln | Opole | <..1945-01-24
Liegnitz | Legnica | <..1945-02-09
# --- Germany, Bohemia, Slovakia, Hungary, Austria
Frankfurt (Oder) | | <..1945-04-23
Cottbus | | <..1945-04-22
Berlin | | <..1945-05-02
Potsdam | | <..1945-04-27
Torgau | | <..1945-04-25
Stralsund | | <..1945-05-01
Rostock | | <..1945-05-01
Görlitz | | <..1945-05-08
Dresden | | <..1945-05-08
Wismar | | <..>
Schwerin | | <..>
Magdeburg | | <..>
Leipzig | | <..>
Chemnitz | | <..>
Karlsbad | Karlovy Vary | <..>
Pilsen | Plzeň | <..>
Budweis | České Budějovice | <..>
Linz | | <..>
Graz | | <..>
Prague | | <..1945-05-09
Brno | | <..1945-04-26
Ostrava | | <..1945-04-30
Olomouc | | <..1945-05-08
Bratislava | | <..1945-04-04
Košice | | <..1945-01-19
Banská Bystrica | | <..1945-03-26
Kőrösmező | @48.27,24.35 | <..1944-09-28
Rahó | @48.05,24.2 | <..1944-10-16
Máramarossziget | @47.93,23.89 | <..1944-10-17
Huszt | @48.17,23.29 | <..1944-10-24
Munkács | @48.44,22.72 | <..1944-10-26
Szatmárnémeti | @47.79,22.89 | <..1944-10-25
Nagybánya | @47.66,23.58 | <..1944-10-18
Dés | @47.14,23.87 | <..1944-10-14
Beszterce | @47.13,24.5 | <..1944-10-13
Uzhhorod | | <..1944-10-27
Dukla | | <..1944-09-20
Debrecen | | <..1944-10-20
Szeged | | <..1944-10-11
Miskolc | | <..1944-12-03
Pécs | | <..1944-11-29
Budapest | | <..1945-02-13
Székesfehérvár | | <..1944-12-23, 1945-01-22..1945-03-22
Győr | | <..1945-03-28
Nagykanizsa | | <..1945-04-02
Wiener Neustadt | | <..1945-04-02
Vienna | | <..1945-04-13
St. Pölten | Sankt Pölten | <..1945-04-15
# --- Behind the limit of the German advance: never taken (they pin the line from the east)
Voybokalo | @59.88,32.05 | -
Syasstroy | @60.14,32.56 | -
Lodeynoye Pole | @60.73,33.55 | -
Vytegra | @61.0,36.45 | -
Belozersk | @60.03,37.79 | -
Boksitogorsk | @59.47,33.85 | -
Nebolchi | @59.12,33.35 | -
Khvoynaya | @58.9,34.53 | -
Lyubytino | @58.81,33.39 | -
Okulovka | @58.4,33.3 | -
Borovichi | @58.39,33.91 | -
Kresttsy | @58.25,32.52 | -
Pestovo | @58.6,35.8 | -
Ustyuzhna | @58.84,36.43 | -
Cherepovets | @59.13,37.9 | -
Vologda | @59.22,39.89 | -
Udomlya | @57.88,35.0 | -
Maksatikha | @57.8,35.88 | -
Bezhetsk | @57.78,36.69 | -
Vesyegonsk | @58.66,37.26 | -
Rybinsk | @58.05,38.83 | -
Yaroslavl | @57.63,39.87 | -
Kostroma | @57.77,40.93 | -
Ivanovo | @57.0,40.98 | -
Likhoslavl | @57.12,35.47 | -
Kashin | @57.36,37.61 | -
Kimry | @56.87,37.36 | -
Uglich | @57.53,38.33 | -
Zagorsk | @56.3,38.13 | -
Vladimir | @56.13,40.4 | -
Gorky | @56.33,44.0 | -
Yegoryevsk | @55.38,39.03 | -
Zaraysk | @54.76,38.88 | -
Ryazhsk | @53.71,40.07 | -
Lebedyan | @53.02,39.13 | -
Morshansk | @53.44,41.81 | -
Penza | @53.2,45.0 | -
Balashov | @51.55,43.17 | -
Povorino | @51.2,42.25 | -
Novokhopyorsk | @51.1,41.62 | -
Buturlinovka | @50.83,40.6 | -
Kalach (Voronezh) | @50.42,41.02 | -
Veshenskaya | @49.63,41.73 | -
Mikhaylovka | @50.07,43.24 | -
Elton | @49.13,46.85 | -
Vladimirovka | @48.28,46.17 | -
Derbent | @42.06,48.29 | -
Baku | @40.4,49.87 | -
Tbilisi | @41.72,44.79 | -
Kutaisi | @42.27,42.7 | -
Batumi | @41.65,41.64 | -
# --- The Tikhvin thrust, October to December 1941
Gruzino | @59.02,31.95 | 1941-10-18..1944-01-25
Bolshaya Vishera | @58.92,32.08 | 1941-10-22..1941-12-27
Budogoshch | @59.28,32.47 | 1941-10-28..1941-12-21
Sitomlya | @59.47,33.05 | 1941-11-05..1941-12-12
# --- Lines whose course is known: unnamed places set either side of them (left and right as
# --- the line is travelled). East of each, places the Germans never held; west, when they did.
# Leningrad: the siege line from the Gulf to Shlisselburg, and the lake shore to Lipka
@line leningrad = 59.845,30.2; 59.83,30.22; 59.76,30.33; 59.74,30.47; 59.72,30.6; 59.73,30.72; 59.78,30.8; 59.82,30.9; 59.87,30.98; 59.94,31.03 | - | 1941-09-12..1944-01-20 | 9 | 4
@line ladoga shore = 59.94,31.03; 59.97,31.2; 60.0,31.42 | - | 1941-09-08..1943-01-18 | 9 | 4
# The Oranienbaum bridgehead (travelled east to west: the Germans on the left)
@line oranienbaum = 59.89,29.86; 59.82,29.8; 59.78,29.5; 59.76,29.15; 59.75,28.85; 59.78,28.6; 59.84,28.52 | 1941-09-16..1944-01-19 | - | 12 | 5
# The Volkhov line, held from the autumn of 1941 to January 1944; east of it only during the Tikhvin thrust
@line volkhov north = 60.0,31.42; 59.87,31.42; 59.78,31.5; 59.72,31.62; 59.68,31.75; 59.6,31.82; 59.52,31.95; 59.45,32.1 | 1941-11-10..1941-12-22 | 1941-09-08..1944-01-21 | 12 | 5
@line volkhov middle = 59.45,32.1; 59.3,32.03; 59.15,32.0; 59.02,32.03; 58.9,31.88; 58.78,31.74 | 1941-10-20..1941-12-24 | 1941-08-25..1944-01-21 | 12 | 5
@line volkhov south = 58.78,31.74; 58.68,31.52; 58.6,31.42; 58.52,31.37; 58.45,31.4 | - | 1941-08-20..1944-01-20 | 10 | 4
# The limit of the Tikhvin thrust (8 November – 9 December 1941)
@line tikhvin = 59.87,31.48; 59.85,31.75; 59.86,32.05; 59.86,32.33; 59.78,32.55; 59.72,32.9; 59.75,33.3; 59.78,33.55; 59.72,33.72; 59.62,33.74; 59.52,33.62; 59.42,33.25; 59.3,32.95; 59.18,32.72; 59.02,32.6; 58.88,32.42; 58.75,32.3; 58.68,32.0; 58.72,31.8 | - | 1941-11-10..1941-12-12 | 14 | 6
# Lake Ilmen to Kalinin: Staraya Russa, the Demyansk salient, Lake Seliger, the upper Volga
@line ilmen = 58.12,31.55; 58.0,31.72; 57.97,32.0 | - | 1941-08-15..1942-01-12 | 12 | 5
@line demyansk = 57.97,32.0; 57.95,32.42; 57.88,32.85; 57.78,33.05; 57.6,33.1; 57.45,33.0 | - | 1941-09-10..1943-02-20 | 14 | 6
@line seliger = 57.45,33.0; 57.25,32.95; 57.05,32.98; 56.93,33.25; 56.92,33.48; 56.95,33.9; 56.93,34.4; 56.85,34.9 | - | 1941-10-12..1942-01-14 | 14 | 6
@line kalinin = 56.85,34.9; 56.93,35.35; 56.97,35.62; 56.93,35.92; 56.85,36.08 | - | 1941-10-15..1941-12-16 | 12 | 5
# The limit before Moscow, 5 December 1941
@line moscow north = 56.85,36.08; 56.72,36.3; 56.6,36.55; 56.58,36.9; 56.5,37.2; 56.38,37.47; 56.29,37.53; 56.18,37.47; 56.08,37.5; 56.0,37.42; 55.97,37.22; 55.9,37.1; 55.84,37.02 | - | 1941-11-28..1941-12-09 | 12 | 5
@line moscow west = 55.84,37.02; 55.78,36.88; 55.71,36.72; 55.62,36.63; 55.52,36.68; 55.42,36.72; 55.38,36.76; 55.25,36.85; 55.1,36.95; 54.95,37.18; 54.82,37.25; 54.72,37.22; 54.55,37.15 | - | 1941-10-26..1941-12-19 | 12 | 5
# Round Tula, and Guderian's thrust east of it
@line tula south = 54.55,37.15; 54.38,37.28; 54.2,37.42; 54.1,37.55; 54.12,37.78 | - | 1941-11-02..1941-12-17 | 10 | 4
@line tula east = 54.12,37.78; 54.25,37.85; 54.36,37.72; 54.48,37.9; 54.62,38.05; 54.72,38.12; 54.65,38.5; 54.52,38.8; 54.35,39.12; 54.22,39.18; 54.0,39.5; 53.85,39.62; 53.6,39.25 | - | 1941-11-25..1941-12-08 | 12 | 5
@line yelets = 53.6,39.25; 53.4,38.85; 53.18,38.35; 52.9,38.55; 52.65,38.62; 52.5,38.2; 52.42,37.78 | - | 1941-11-26..1941-12-12 | 14 | 6
# The front of the winter of 1941–42 from Livny to the Sea of Azov (east of it German from the summer of 1942)
@line kursk east = 52.42,37.78; 52.1,37.7; 51.8,37.45; 51.5,37.3; 51.2,37.1 | 1942-06-30..1943-02-05 | 1941-11-05..1943-02-08 | 16 | 6
@line oskol = 51.2,37.1; 50.95,36.95; 50.68,36.85 | 1942-06-12..1943-02-06 | 1941-10-25..1943-02-08 | 14 | 6
@line donets = 50.68,36.85; 50.35,36.95; 50.05,36.9; 49.85,36.85; 49.6,36.85; 49.45,37.0 | 1942-06-12..1943-02-08 | 1941-10-25..1943-02-10, 1943-03-18..1943-08-08 | 16 | 6
@line donbas = 49.2,37.15; 49.05,37.4; 48.92,37.75; 48.75,38.1; 48.55,38.25; 48.38,38.5; 48.2,38.75; 48.05,38.9 | 1942-07-08..1943-02-01 | 1941-10-28..1943-09-04 | 16 | 6
@line mius = 48.05,38.9; 47.85,38.9; 47.6,38.85; 47.35,38.95; 47.2,39.05; 47.15,39.1 | 1942-07-18..1943-02-14 | 1941-10-20..1943-08-30 | 14 | 6
# The limit of 1942: Voronezh, the Don, Stalingrad, the Kalmyk steppe, the Terek, the Caucasus
@line voronezh = 52.45,37.35; 52.3,37.7; 52.1,38.2; 52.0,38.7; 51.95,39.0; 51.85,39.12; 51.75,39.18 | - | 1942-07-03..1943-01-27 | 16 | 6
@line upper don = 51.75,39.18; 51.67,39.24; 51.56,39.14; 51.4,39.15; 51.15,39.2; 51.0,39.25; 50.9,39.5; 50.7,39.75; 50.47,40.05 | - | 1942-07-08..1943-01-18 | 14 | 5
@line middle don = 50.47,40.05; 50.25,40.25; 50.1,40.45; 49.95,40.72; 49.8,41.1; 49.68,41.5; 49.6,41.8 | - | 1942-07-10..1942-12-18 | 16 | 6
@line don bend = 49.6,41.8; 49.58,42.2; 49.48,42.65; 49.4,42.95; 49.25,43.1; 49.38,43.4; 49.2,43.65; 49.05,43.95 | - | 1942-07-25..1942-11-21 | 16 | 6
@line stalingrad = 49.05,43.95; 48.98,44.25; 48.93,44.6; 48.88,44.68; 48.8,44.62; 48.72,44.55; 48.65,44.47 | - | 1942-08-23..1943-01-28 | 9 | 4
@line sarpa lakes = 48.65,44.47; 48.6,44.38; 48.5,44.42; 48.4,44.55; 48.28,44.62; 48.15,44.68; 47.98,44.72 | - | 1942-08-25..1942-11-21 | 12 | 5
@line kalmyk steppe = 47.98,44.72; 47.6,44.9; 47.2,45.2; 46.8,45.6; 46.45,46.2; 46.3,46.45; 46.05,46.1; 45.6,45.6; 45.1,45.3; 44.6,45.3; 44.1,45.25; 43.74,45.2 | - | 1942-08-25..1942-12-30 | 25 | 10
@line terek = 43.74,45.2; 43.58,44.95; 43.48,44.7; 43.38,44.42; 43.3,44.3 | - | 1942-08-28..1943-01-02 | 12 | 5
@line ordzhonikidze = 43.3,44.3; 43.15,44.5; 43.03,44.62; 42.98,44.4; 43.0,44.15; 43.1,43.9; 43.25,43.65 | - | 1942-10-30..1942-12-28 | 10 | 4
@line caucasus = 43.25,43.65; 43.3,43.3; 43.3,42.9; 43.3,42.45; 43.22,41.95; 43.3,41.5; 43.38,41.05; 43.5,40.7; 43.7,40.3; 43.9,39.9 | - | 1942-08-22..1943-01-08 | 20 | 8
@line tuapse = 43.9,39.9; 44.1,39.55; 44.2,39.3; 44.38,39.05; 44.5,38.7; 44.6,38.35; 44.68,38.0; 44.71,37.83 | - | 1942-09-12..1943-02-10 | 14 | 5
# The fronts of 1942–43 in the centre: Kholm to Livny round the Rzhev and Orel salients
@line velikiye luki = 57.15,31.25; 56.8,31.3; 56.5,31.0; 56.35,30.75; 56.1,30.9; 55.85,31.1; 55.68,31.2; 55.55,31.6; 55.35,31.55 | 1941-09-01..1942-01-25 | 1941-08-25..1943-09-19 | 18 | 7
@line rzhev = 55.35,31.55; 55.5,32.2; 55.6,32.6; 55.9,32.85; 56.05,33.1; 56.3,33.5; 56.35,34.3; 56.2,34.75; 55.95,34.95; 55.83,34.87; 55.55,35.15 | 1941-10-14..1942-01-18 | 1941-10-12..1943-03-04 | 16 | 6
@line vyazma = 55.55,35.15; 55.2,35.2; 54.95,35.25; 54.7,34.95; 54.5,34.55; 54.08,34.2 | 1941-10-10..1942-01-25 | 1941-10-08..1943-03-10 | 16 | 6
@line orel = 54.08,34.2; 53.95,34.5; 53.85,34.75; 53.9,35.3; 53.85,35.75; 53.75,36.05; 53.55,36.2; 53.5,36.3; 53.3,36.7; 53.05,36.95 | 1941-10-20..1941-12-31 | 1941-10-08..1943-07-25 | 16 | 6
@line livny west = 52.95,37.02; 52.75,36.9; 52.55,37.1; 52.45,37.35 | 1941-11-25..1941-12-27 | 1941-11-20..1943-02-12 | 14 | 6
# The Kursk salient, March to July 1943 (travelled with the salient on the left)
@line kursk north = 52.95,36.9; 52.78,36.72; 52.62,36.55; 52.5,36.2; 52.35,35.6; 52.4,35.15 | 1941-11-02..1943-02-10 | 1941-10-05..1943-08-01 | 14 | 6
@line kursk west = 52.4,35.15; 52.2,34.6; 51.8,34.5; 51.55,34.75; 51.2,34.75; 50.95,34.95; 50.75,35.15 | 1941-10-20..1943-02-25 | 1941-10-08..1943-08-30 | 16 | 6
@line kursk south = 50.75,35.15; 50.6,35.6; 50.65,36.1; 50.7,36.6; 50.65,36.8 | 1941-10-28..1943-02-10 | 1941-10-24..1943-02-10, 1943-03-18..1943-08-05 | 14 | 6
# The line the Red Army stood on from April to June 1944 (Vitebsk to the Dniester)
@line belorussia = 55.6,29.2; 55.2,30.4; 54.8,30.75; 54.5,30.75; 54.2,30.85; 53.9,30.65; 53.5,30.5; 53.08,30.0; 52.9,30.1 | 1941-07-20..1943-10-05 | 1941-07-12..1944-06-25 | 22 | 8
@line polesia = 52.9,30.1; 52.6,29.8; 52.35,29.3; 52.1,28.6; 51.9,27.8; 51.85,26.5; 51.75,25.5; 51.25,24.9 | 1941-08-20..1944-01-20 | 1941-07-05..1944-07-05 | 25 | 9
@line galicia = 51.25,24.9; 50.9,24.9; 50.6,25.0; 50.2,25.1; 49.8,25.3; 49.55,25.35; 49.2,25.1; 48.9,24.95; 48.55,24.85 | 1941-07-02..1944-03-25 | 1941-06-30..1944-07-18 | 20 | 8
@line bessarabia = 47.3,27.85; 47.38,28.4; 47.35,28.85; 47.25,29.15; 46.9,29.5; 46.6,29.75; 46.35,30.05; 46.1,30.4 | 1941-07-20..1944-04-08 | 1941-07-12..1944-08-23 | 18 | 7
# The Vistula, August 1944 to January 1945, and the Courland pocket (travelled west to east: the Germans on the left)
@line vistula = 53.1,21.65; 52.88,21.4; 52.7,21.1; 52.5,21.07; 52.25,21.03; 52.0,21.2; 51.8,21.3; 51.55,21.75; 51.4,21.9; 51.1,21.8; 50.85,21.75; 50.7,21.45; 50.5,21.05; 50.35,21.2; 50.2,21.3; 50.05,21.35; 49.8,21.4; 49.6,21.5 | <..1944-08-01 | <..1945-01-14 | 20 | 7
@line courland = 56.3,21.0; 56.45,21.6; 56.6,22.5; 56.62,23.27; 56.8,23.3; 56.97,23.28; 57.0,23.32 | 1941-07-01..> | 1941-06-28..1944-10-12 | 18 | 7
`,
};

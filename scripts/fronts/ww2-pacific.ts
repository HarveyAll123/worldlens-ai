import type { TheatreSource } from './types';

/**
 * The war in the Pacific and South-East Asia, 7 December 1941 – 2 September 1945: Japan's
 * conquests, the perimeter it held, and the Allied return. Side A is Japan: a period is the
 * time a place was in Japanese hands. The line runs over the sea, between the islands each
 * side held. China has its own theatre (sino-japanese-war.ts) and is left out here; the
 * Soviet Union was not at war with Japan until August 1945 (ww2-manchuria-1945.ts).
 * A few garrison dates on by-passed coasts (western New Britain, north New Guinea) are known
 * only to the month.
 */
export const WW2_PACIFIC: TheatreSource = {
  id: 'ww2-pacific',
  name: 'Pacific War: the Japanese perimeter',
  war: 'Second World War',
  conflictId: 'conflict-world-war-ii',
  sideA: 'Japan',
  sideB: 'The United States, the British Commonwealth, the Netherlands and their allies',
  start: '1941-12-07',
  end: '1945-09-02',
  horizonDays: 30,
  maxEdgeKm: 2600,
  clipToLand: false,
  colorA: 'japan',
  colorB: 'allies',
  politiesA:
    '^(empire of japan|japanese occupation|state of burma|philippine executive commission|second philippine republic|hong kong occupied)',
  politiesB:
    '^(dutch east indies|commonwealth of the philippines|united states|australia|british burma|british raj|portuguese timor|british solomon|british western pacific|gilbert and ellice|nauru|colony of the straits|federated malay|unfederated malay|british protectorate of|british north borneo|north borneo|british hong kong|british malaya)',
  sources: [
    'https://en.wikipedia.org/wiki/Pacific_War',
    'https://en.wikipedia.org/wiki/Dutch_East_Indies_campaign',
    'https://en.wikipedia.org/wiki/Philippines_campaign_(1941%E2%80%931942)',
    'https://en.wikipedia.org/wiki/Burma_campaign',
    'https://en.wikipedia.org/wiki/New_Guinea_campaign',
    'https://en.wikipedia.org/wiki/Solomon_Islands_campaign',
    'https://en.wikipedia.org/wiki/Gilbert_and_Marshall_Islands_campaign',
    'https://en.wikipedia.org/wiki/Mariana_and_Palau_Islands_campaign',
    'https://en.wikipedia.org/wiki/Philippines_campaign_(1944%E2%80%931945)',
  ],
  note: 'Over the sea the line is only where the islands on either side of it put it. By-passed garrisons (Rabaul, Truk, Wake …) stay Japanese to the end.',
  places: `
# --- Japan and what it held before the war
Tokyo | @35.68,139.76 | <..>
Osaka | @34.69,135.5 | <..>
Nagasaki | @32.75,129.87 | <..>
Sapporo | @43.06,141.35 | <..>
Paramushir | @50.68,156.12 | <..>
Toyohara | @46.96,142.73 | <..>
Keijo | @37.57,126.98 | <..>
Taihoku | @25.04,121.56 | <..>
Takao | @22.62,120.3 | <..>
Naha | @26.21,127.68 | <..1945-06-22
Iwo Jima | @24.78,141.32 | <..1945-03-26
Chichijima | @27.08,142.2 | <..>
Marcus Island | @24.29,153.98 | <..>
Saipan | @15.19,145.75 | <..1944-07-09
Tinian | @15.0,145.63 | <..1944-08-01
Rota | @14.15,145.2 | <..>
Yap | @9.53,138.12 | <..>
Ulithi | @10.0,139.7 | <..1944-09-23
Koror | @7.34,134.48 | <..>
Peleliu | @7.0,134.25 | <..1944-11-27
Truk | @7.42,151.78 | <..>
Ponape | @6.88,158.22 | <..>
Kusaie | @5.32,162.98 | <..>
Eniwetok | @11.5,162.33 | <..1944-02-23
Kwajalein | @8.72,167.73 | <..1944-02-04
Majuro | @7.09,171.38 | <..1944-01-31
Jaluit | @5.92,169.64 | <..>
Wotje | @9.45,170.02 | <..>
Mili | @6.08,171.92 | <..>
Haikou | @20.04,110.34 | <..>
Hanoi | @21.03,105.85 | <..>
Saigon | @10.78,106.7 | <..>
Cam Ranh | @11.9,109.2 | <..>
# --- Taken in the first six months
Guam | @13.45,144.78 | 1941-12-10..1944-08-10
Wake Island | @19.28,166.65 | 1941-12-23..>
Makin | @3.07,172.8 | 1941-12-10..1943-11-24
Tarawa | @1.33,173.0 | 1941-12-10..1943-11-23
Nauru | @-0.53,166.93 | 1942-08-26..>
Ocean Island | @-0.86,169.54 | 1942-08-26..>
Hong Kong | @22.3,114.17 | 1941-12-25..>
Bangkok | @13.75,100.5 | 1941-12-08..>
Chiang Mai | @18.79,98.98 | 1941-12-21..>
Singora | @7.2,100.6 | 1941-12-08..>
Victoria Point | @9.98,98.55 | 1941-12-16..>
# --- Malaya
Kota Bharu | @6.13,102.25 | 1941-12-08..>
Alor Star | @6.12,100.37 | 1941-12-12..>
Penang | @5.41,100.33 | 1941-12-19..>
Ipoh | @4.6,101.08 | 1941-12-28..>
Kuantan | @3.81,103.33 | 1941-12-31..>
Kuala Lumpur | @3.14,101.69 | 1942-01-11..>
Malacca | @2.2,102.25 | 1942-01-15..>
Johor Bahru | @1.47,103.76 | 1942-01-31..>
Singapore | @1.29,103.85 | 1942-02-15..>
# --- Burma, and the line of the Chindwin and the Salween
Tavoy | @14.08,98.2 | 1942-01-19..>
Moulmein | @16.49,97.63 | 1942-01-31..>
Pegu | @17.34,96.48 | 1942-03-07..1945-05-01
Rangoon | @16.8,96.15 | 1942-03-08..1945-05-03
Toungoo | @18.94,96.43 | 1942-03-30..1945-04-22
Prome | @18.82,95.22 | 1942-04-02..1945-05-03
Yenangyaung | @20.46,94.87 | 1942-04-17..1945-04-22
Meiktila | @20.88,95.86 | 1942-04-25..1945-03-03
Mandalay | @21.97,96.08 | 1942-05-01..1945-03-20
Shwebo | @22.57,95.7 | 1942-05-02..1945-01-09
Lashio | @22.94,97.75 | 1942-04-29..1945-03-07
Bhamo | @24.25,97.23 | 1942-05-04..1944-12-15
Indaw | @24.22,96.14 | 1942-05-05..1944-12-10
Myitkyina | @25.38,97.4 | 1942-05-08..1944-08-03
Mogaung | @25.3,96.94 | 1942-05-10..1944-06-26
Kalewa | @23.2,94.3 | 1942-05-12..1944-12-02
Akyab | @20.15,92.9 | 1942-05-04..1945-01-03
Maungdaw | @20.82,92.37 | 1943-05-14..1944-01-09
Tiddim | @23.37,93.65 | 1944-03-14..1944-10-17
Tamu | @24.22,94.3 | 1944-04-01..1944-08-04
Ukhrul | @25.12,94.36 | 1944-03-21..1944-07-08
Kengtung | @21.3,99.6 | 1942-05-27..>
Wanting | @24.08,98.07 | 1942-05-03..1945-01-20
Longling | @24.59,98.69 | 1942-05-05..1944-11-03
Tengchong | @25.02,98.49 | 1942-05-10..1944-09-14
Paoshan | @25.11,99.17 | -
Imphal | @24.8,93.94 | -
Kohima | @25.67,94.1 | -
Dimapur | @25.9,93.73 | -
Ledo | @27.29,95.74 | -
Chittagong | @22.36,91.78 | -
Silchar | @24.83,92.8 | -
Aijal | @23.73,92.72 | -
Lungleh | @22.89,92.75 | -
Calcutta | @22.57,88.36 | -
Colombo | @6.93,79.86 | -
Port Blair | @11.67,92.74 | 1942-03-23..>
# --- Borneo
Miri | @4.4,113.98 | 1941-12-16..1945-06-23
Brunei Town | @4.89,114.94 | 1941-12-22..1945-06-13
Kuching | @1.55,110.35 | 1941-12-24..>
Labuan | @5.28,115.24 | 1942-01-01..1945-06-10
Jesselton | @5.98,116.07 | 1942-01-09..>
Sandakan | @5.84,118.12 | 1942-01-19..>
Tarakan | @3.3,117.63 | 1942-01-11..1945-05-05
Balikpapan | @-1.27,116.83 | 1942-01-24..1945-07-03
Samarinda | @-0.5,117.15 | 1942-02-03..>
Banjarmasin | @-3.32,114.59 | 1942-02-10..>
Pontianak | @-0.03,109.33 | 1942-01-29..>
# --- Dutch East Indies
Manado | @1.49,124.84 | 1942-01-11..>
Kendari | @-3.97,122.52 | 1942-01-24..>
Makassar | @-5.14,119.42 | 1942-02-09..>
Ambon | @-3.7,128.18 | 1942-02-03..>
Ternate | @0.79,127.38 | 1942-04-07..>
Morotai | @2.05,128.3 | 1942-04-10..1944-09-15
Kupang | @-10.18,123.6 | 1942-02-20..>
Dili | @-8.56,125.57 | 1942-02-20..>
Denpasar | @-8.65,115.22 | 1942-02-19..>
Mataram | @-8.58,116.12 | 1942-05-09..>
Surabaya | @-7.25,112.75 | 1942-03-08..>
Semarang | @-6.97,110.42 | 1942-03-08..>
Tjilatjap | @-7.73,109.01 | 1942-03-08..>
Bandung | @-6.91,107.61 | 1942-03-09..>
Batavia | @-6.2,106.82 | 1942-03-05..>
Palembang | @-2.98,104.76 | 1942-02-14..>
Djambi | @-1.6,103.61 | 1942-03-04..>
Padang | @-0.95,100.35 | 1942-03-17..>
Medan | @3.59,98.67 | 1942-03-13..>
Kutaraja | @5.55,95.32 | 1942-03-12..>
Christmas Island | @-10.45,105.68 | 1942-03-31..>
Cocos Islands | @-12.17,96.83 | -
# --- Philippines
Aparri | @18.36,121.64 | 1941-12-10..1945-06-21
Vigan | @17.57,120.39 | 1941-12-10..1945-04-18
Lingayen | @16.02,120.23 | 1941-12-22..1945-01-09
Baguio | @16.41,120.6 | 1941-12-27..1945-04-27
Clark Field | @15.17,120.58 | 1942-01-01..1945-01-31
Manila | @14.6,120.98 | 1942-01-02..1945-03-03
Bataan | @14.43,120.49 | 1942-04-09..1945-02-21
Corregidor | @14.38,120.57 | 1942-05-06..1945-02-26
Batangas | @13.76,121.06 | 1941-12-31..1945-03-11
Legazpi | @13.14,123.74 | 1941-12-12..1945-04-01
San Jose, Mindoro | @12.35,121.07 | 1942-02-27..1944-12-15
Tacloban | @11.24,125.0 | 1942-05-25..1944-10-20
Ormoc | @11.0,124.61 | 1942-05-25..1944-12-10
Cebu | @10.31,123.89 | 1942-04-10..1945-03-27
Iloilo | @10.72,122.56 | 1942-04-16..1945-03-20
Bacolod | @10.68,122.95 | 1942-05-21..1945-03-30
Puerto Princesa | @9.74,118.74 | 1942-05-18..1945-02-28
Zamboanga | @6.91,122.07 | 1942-03-02..1945-03-10
Cagayan de Oro | @8.48,124.65 | 1942-05-03..1945-05-10
Davao | @7.07,125.61 | 1941-12-20..1945-05-03
Jolo | @6.05,121.0 | 1941-12-25..1945-04-09
# --- New Guinea and the Bismarck Archipelago
Rabaul | @-4.2,152.17 | 1942-01-23..>
Kavieng | @-2.57,150.8 | 1942-01-23..>
Talasea | @-5.28,150.03 | 1942-02-09..1944-03-06
Cape Gloucester | @-5.46,148.42 | 1942-02-09..1943-12-30
Lorengau | @-2.03,147.27 | 1942-04-08..1944-03-18
Lae | @-6.73,147.0 | 1942-03-08..1943-09-16
Salamaua | @-7.05,147.05 | 1942-03-08..1943-09-11
Finschhafen | @-6.6,147.85 | 1942-03-10..1943-10-02
Madang | @-5.22,145.79 | 1942-12-18..1944-04-24
Wewak | @-3.55,143.63 | 1942-12-18..1945-05-11
Aitape | @-3.14,142.35 | 1942-12-18..1944-04-22
Hollandia | @-2.53,140.72 | 1942-04-19..1944-04-22
Wakde | @-1.87,138.75 | 1942-05-01..1944-05-18
Biak | @-1.18,136.08 | 1942-04-12..1944-06-22
Manokwari | @-0.87,134.08 | 1942-04-12..>
Sansapor | @-0.5,132.08 | 1942-04-10..1944-07-30
Sorong | @-0.88,131.25 | 1942-04-04..>
Fakfak | @-2.93,132.3 | 1942-04-01..>
Kokoda | @-8.88,147.74 | 1942-07-29..1942-11-02
Buna | @-8.67,148.4 | 1942-07-21..1943-01-02
Gona | @-8.6,148.3 | 1942-07-21..1942-12-09
Port Moresby | @-9.48,147.15 | -
Milne Bay | @-10.32,150.4 | -
Wau | @-7.34,146.72 | -
Merauke | @-8.49,140.4 | -
Mount Hagen | @-5.86,144.23 | -
Bena Bena | @-6.08,145.39 | -
Kainantu | @-6.29,145.86 | -
Mendi | @-6.15,143.65 | -
Kikori | @-7.42,144.25 | -
Daru | @-9.08,143.21 | -
# --- Solomon Islands
Buka | @-5.42,154.67 | 1942-03-30..>
Buin | @-6.75,155.68 | 1942-03-30..>
Shortland Islands | @-7.05,155.75 | 1942-03-30..>
Torokina | @-6.25,155.03 | 1942-04-01..1943-11-01
Green Islands | @-4.5,154.22 | 1942-04-01..1944-02-15
Vella Lavella | @-7.72,156.62 | 1942-12-01..1943-08-15
Kolombangara | @-8.1,157.17 | 1942-12-01..1943-10-04
Munda | @-8.33,157.26 | 1942-11-24..1943-08-05
Rekata Bay | @-7.57,158.7 | 1942-05-01..1943-08-25
Tulagi | @-9.1,160.15 | 1942-05-03..1942-08-08
Henderson Field | @-9.43,160.05 | 1942-07-06..1942-08-07
Cape Esperance | @-9.25,159.72 | 1942-07-06..1943-02-09
Emirau | @-1.65,149.98 | -
# --- Never taken
Midway | @28.21,-177.37 | -
Honolulu | @21.31,-157.86 | -
Johnston Atoll | @16.73,-169.53 | -
Canton Island | @-2.81,-171.68 | -
Funafuti | @-8.52,179.2 | -
Suva | @-18.14,178.44 | -
Apia | @-13.83,-171.77 | -
Nouméa | @-22.27,166.45 | -
Espiritu Santo | @-15.5,167.2 | -
Efate | @-17.73,168.32 | -
Auckland | @-36.85,174.76 | -
Brisbane | @-27.47,153.03 | -
Townsville | @-19.26,146.82 | -
Cairns | @-16.92,145.77 | -
Thursday Island | @-10.58,142.22 | -
Darwin | @-12.46,130.84 | -
Broome | @-17.96,122.24 | -
Perth | @-31.95,115.86 | -
Dutch Harbor | @53.89,-166.54 | -
Adak | @51.88,-176.66 | -
# --- Aleutians
Attu | @52.9,173.15 | 1942-06-07..1943-05-30
Kiska | @51.97,177.5 | 1942-06-06..1943-08-15
# --- China and the Soviet Far East: not this theatre
Kunming | @25.04,102.71 | n
Chongqing | @29.56,106.55 | n
Nanning | @22.82,108.32 | n
Guilin | @25.27,110.29 | n
Changsha | @28.23,112.94 | n
Canton | @23.13,113.26 | n
Fuzhou | @26.07,119.3 | n
Shanghai | @31.23,121.47 | n
Tsingtao | @36.07,120.38 | n
Peking | @39.9,116.4 | n
Vladivostok | @43.12,131.89 | n
Khabarovsk | @48.48,135.08 | n
Petropavlovsk | @53.02,158.65 | n
`,
};

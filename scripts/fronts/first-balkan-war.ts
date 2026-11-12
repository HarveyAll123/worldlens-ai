import type { TheatreSource } from './types';

/**
 * The First Balkan War, 8 October 1912 – 30 May 1913: Bulgaria, Serbia, Greece and Montenegro
 * drove the Ottoman Empire out of Macedonia, Albania and most of Thrace. Side A is the Balkan
 * League. Towns taken without a fight behind the armies are dated to within a few days.
 */
export const FIRST_BALKAN_WAR: TheatreSource = {
  id: 'first-balkan-war',
  name: 'First Balkan War: the League’s advance',
  war: 'Balkan Wars',
  conflictId: 'conflict-balkan-wars',
  sideA: 'Bulgaria, Serbia, Greece and Montenegro',
  sideB: 'Ottoman Empire',
  start: '1912-10-08',
  end: '1913-05-30',
  horizonDays: 12,
  maxEdgeKm: 330,
  colorA: 'balkan-league',
  colorB: 'ottoman',
  politiesA: '^(kingdom of greece|kingdom of serbia|tsardom of bulgaria|kingdom of montenegro)',
  politiesB: '^ottoman empire',
  sources: [
    'https://en.wikipedia.org/wiki/First_Balkan_War',
    'https://en.wikipedia.org/wiki/Battle_of_Kumanovo',
    'https://en.wikipedia.org/wiki/Siege_of_Adrianople_(1912%E2%80%931913)',
    'https://en.wikipedia.org/wiki/Battle_of_Bizani',
  ],
  places: `
# --- The League's own ground
Sofia | @42.7,23.32 | <..>
Kyustendil | @42.28,22.69 | <..>
Plovdiv | @42.15,24.75 | <..>
Burgas | @42.5,27.47 | <..>
Belgrade | @44.8,20.47 | <..>
Niš | @43.32,21.9 | <..>
Vranje | @42.55,21.9 | <..>
Cetinje | @42.39,18.92 | <..>
Podgorica | @42.44,19.26 | <..>
Athens | @37.98,23.73 | <..>
Larissa | @39.64,22.42 | <..>
Arta | @39.16,20.99 | <..>
Corfu | @39.62,19.92 | <..>
Lefkada | @38.83,20.71 | <..>
Patras | @38.25,21.73 | <..>
Volos | @39.36,22.94 | <..>
Chalkis | @38.46,23.6 | <..>
Syros | @37.44,24.94 | <..>
# --- Kosovo, Macedonia and Albania
Priština | @42.66,21.17 | 1912-10-22..>
Novi Pazar | @43.14,20.52 | 1912-10-23..>
Kumanovo | @42.13,21.72 | 1912-10-24..>
Üsküb | @42.0,21.43 | 1912-10-26..>
Pljevlja | @43.36,19.36 | 1912-10-28..>
Štip | @41.74,22.2 | 1912-10-28..>
Veles | @41.72,21.77 | 1912-10-29..>
Prizren | @42.21,20.74 | 1912-10-30..>
Peć | @42.66,20.29 | 1912-10-30..>
Strumica | @41.44,22.64 | 1912-10-30..>
Prilep | @41.35,21.55 | 1912-11-05..>
Monastir | @41.03,21.33 | 1912-11-19..>
Ohrid | @41.12,20.8 | 1912-11-22..>
Tirana | @41.33,19.82 | 1912-11-28..>
Durazzo | @41.32,19.45 | 1912-11-29..>
Elbasan | @41.11,20.08 | 1912-11-29..>
Scutari | @42.07,19.51 | 1913-04-23..>
Valona | @40.47,19.49 | -
# --- The Greek advance
Elassona | @39.89,22.19 | 1912-10-19..>
Kozani | @40.3,21.79 | 1912-10-25..>
Veria | @40.52,22.2 | 1912-10-29..>
Preveza | @38.96,20.75 | 1912-11-03..>
Salonika | @40.64,22.94 | 1912-11-09..>
Florina | @40.78,21.41 | 1912-11-20..>
Kastoria | @40.52,21.27 | 1912-11-24..>
Korçë | @40.62,20.78 | 1912-12-20..>
Ioannina | @39.67,20.85 | 1913-03-06..>
Gjirokastër | @40.08,20.14 | 1913-03-16..>
Lemnos | @39.87,25.06 | 1912-10-21..>
Mytilene | @39.1,26.55 | 1912-11-21..>
Chios | @38.37,26.14 | 1912-11-24..>
Samos | @37.75,26.98 | 1913-03-15..>
# --- Thrace
Kirk Kilisse | @41.73,27.22 | 1912-10-24..>
Dimotika | @41.35,26.5 | 1912-11-01..>
Lüleburgaz | @41.4,27.36 | 1912-11-02..>
Seres | @41.09,23.55 | 1912-11-06..>
Drama | @41.15,24.15 | 1912-11-06..>
Xanthi | @41.13,24.89 | 1912-11-08..>
Kavala | @40.94,24.41 | 1912-11-09..>
Rodosto | @40.98,27.51 | 1912-11-10..>
Dedeagach | @40.85,25.87 | 1912-11-26..>
Adrianople | @41.68,26.56 | 1913-03-26..>
Çatalca | @41.14,28.46 | -
Constantinople | @41.01,28.98 | -
Gallipoli | @40.41,26.67 | -
Çanakkale | @40.15,26.41 | -
Bursa | @40.19,29.06 | -
Smyrna | @38.42,27.14 | -
Kuşadası | @37.86,27.26 | -
Aydın | @37.85,27.85 | -
Bodrum | @37.03,27.43 | -
Kos | @36.89,27.29 | -
Rhodes | @36.44,28.22 | -
`,
};

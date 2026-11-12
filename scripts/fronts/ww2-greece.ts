import type { TheatreSource } from './types';

/**
 * Greece, 6 April 1941 – 8 May 1945: the German invasion through Yugoslavia and Bulgaria, the
 * fall of the mainland by the end of April and of Crete by 1 June 1941, the occupation shared
 * with Italy and Bulgaria, and the withdrawal of autumn 1944 — which left garrisons on Crete
 * and Milos to the end. Side A is the Axis. Withdrawal dates of small towns are known to a
 * few days at best.
 */
export const WW2_GREECE: TheatreSource = {
  id: 'ww2-greece',
  name: 'Greece: invasion and occupation',
  war: 'Second World War',
  conflictId: 'conflict-world-war-ii',
  sideA: 'Germany, Italy and Bulgaria',
  sideB: 'Greece and the British Commonwealth',
  start: '1941-04-06',
  end: '1945-05-08',
  horizonDays: 6,
  maxEdgeKm: 380,
  colorA: 'germany',
  colorB: 'greece',
  politiesA: '^$',
  politiesB: '^(greece|kingdom of greece|hellenic state)$',
  sources: [
    'https://en.wikipedia.org/wiki/German_invasion_of_Greece',
    'https://en.wikipedia.org/wiki/Battle_of_Crete',
    'https://en.wikipedia.org/wiki/Axis_occupation_of_Greece',
    'https://en.wikipedia.org/wiki/Liberation_of_Greece',
  ],
  places: `
# --- Macedonia and Thrace
Alexandroupoli | @40.85,25.87 | 1941-04-09..1944-10-25
Kavala | @40.94,24.41 | 1941-04-09..1944-10-25
Serres | @41.09,23.55 | 1941-04-09..1944-10-25
Thessaloniki | @40.64,22.94 | 1941-04-09..1944-10-30
Florina | @40.78,21.41 | 1941-04-10..1944-11-01
Kozani | @40.3,21.79 | 1941-04-14..1944-10-27
Kastoria | @40.52,21.27 | 1941-04-15..1944-10-28
# --- Epirus, Thessaly and central Greece
Ioannina | @39.67,20.85 | 1941-04-20..1944-10-15
Trikala | @39.56,21.77 | 1941-04-19..1944-10-18
Larissa | @39.64,22.42 | 1941-04-19..1944-10-23
Volos | @39.36,22.94 | 1941-04-21..1944-10-19
Lamia | @38.9,22.43 | 1941-04-23..1944-10-18
Thebes | @38.32,23.32 | 1941-04-26..1944-10-12
Athens | @37.98,23.73 | 1941-04-27..1944-10-12
# --- Peloponnese
Corinth | @37.94,22.93 | 1941-04-26..1944-10-07
Patras | @38.25,21.73 | 1941-04-27..1944-10-04
Tripoli | @37.51,22.37 | 1941-04-28..1944-09-29
Kalamata | @37.04,22.11 | 1941-04-29..1944-09-09
Sparta | @37.07,22.43 | 1941-04-29..1944-09-15
# --- Islands
Corfu | @39.62,19.92 | 1941-04-28..1944-10-12
Argostoli | @38.18,20.49 | 1941-04-30..1944-09-15
Kythira | @36.15,22.99 | 1941-05-10..1944-09-15
Lemnos | @39.87,25.06 | 1941-04-25..1944-10-16
Mytilene | @39.1,26.55 | 1941-05-04..1944-09-10
Chios | @38.37,26.14 | 1941-05-04..1944-09-10
Samos | @37.75,26.98 | 1941-05-08..1943-09-09, 1943-11-22..1944-10-04
Syros | @37.44,24.94 | 1941-05-05..1944-10-13
Naxos | @37.1,25.38 | 1941-05-10..1944-10-15
Milos | @36.72,24.45 | 1941-05-06..>
# --- Crete
Chania | @35.51,24.02 | 1941-05-27..>
Rethymno | @35.37,24.47 | 1941-05-30..1944-10-13
Heraklion | @35.34,25.13 | 1941-05-29..1944-10-11
Ierapetra | @35.01,25.74 | 1941-05-31..1944-10-08
# --- Beyond the frontier (Axis ground when the invasion began, or taken on the way)
Sofia | @42.7,23.32 | <..1944-09-09
Plovdiv | @42.15,24.75 | <..1944-09-09
Skopje | @42.0,21.43 | 1941-04-07..1944-11-13
Bitola | @41.03,21.33 | 1941-04-09..1944-11-04
Tirana | @41.33,19.82 | <..1944-11-17
Korçë | @40.62,20.78 | 1941-04-14..1944-10-24
Gjirokastër | @40.08,20.14 | 1941-04-18..1944-09-20
Sarandë | @39.87,20.0 | 1941-04-20..1944-10-09
`,
};

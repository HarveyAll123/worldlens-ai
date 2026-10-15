/**
 * Frontline / control-line records. Only lines whose geometry is defensible are included:
 *  - lines defined by a geometric rule (the 38th parallel), and
 *  - present-day ceasefire / control lines from Natural Earth (public domain), class
 *    "Line of control", built into geo/ceasefire-lines.json by `pnpm data:build`. Natural Earth
 *    gives geometry only; the names, dates and sides below are WorldLens metadata.
 * Real frontlines of ongoing wars are NOT bundled: they must be imported from a licensed,
 * cited dataset (see DATA_MODEL.md → frontlines). Until then the UI and the AI report that
 * frontline data is unavailable for those wars.
 */
import type { Frontline } from '../schemas';
import ceasefireJson from './geo/ceasefire-lines.json';

type LonLat = [number, number];
const ceasefire = ceasefireJson as unknown as {
  commit: string;
  lines: Record<string, LonLat[][]>;
};

const NE_SOURCE = `Natural Earth 1:10m boundary lines, class "Line of control" (commit ${ceasefire.commit.slice(0, 7)})`;
const NE_LICENSE = 'Public domain (Natural Earth)';
const NE_NOTE = 'World-scale (1:10m) depiction, not survey-grade.';

/** Natural Earth BRK_A3 code → the line it depicts. */
const CEASEFIRE_LINES: Array<Omit<Frontline, 'geometry' | 'source' | 'license'> & { key: string }> =
  [
    {
      key: 'B10',
      id: 'line-korea-mdl-1953',
      conflictId: 'conflict-korean-war',
      name: 'Military Demarcation Line (Korea)',
      validFrom: '1953-07-27',
      validTo: null,
      datePrecision: 'day',
      certainty: 'APPROXIMATE',
      sideA: 'North Korea',
      sideB: 'South Korea / UN Command',
      disputed: false,
      confidence: 0.9,
      notes: `Set by the Korean Armistice Agreement of 27 July 1953; the Demilitarized Zone extends 2 km either side. ${NE_NOTE}`,
    },
    {
      key: 'B05',
      id: 'line-kashmir-loc-1972',
      conflictId: 'conflict-kashmir',
      name: 'Line of Control (Kashmir)',
      validFrom: '1972-07-02',
      validTo: null,
      datePrecision: 'day',
      certainty: 'APPROXIMATE',
      sideA: 'India',
      sideB: 'Pakistan',
      disputed: true,
      confidence: 0.85,
      notes: `Established by the Simla Agreement (2 July 1972) from the ceasefire line of 17 December 1971; a de facto line, not an agreed international border. ${NE_NOTE}`,
    },
    {
      key: 'B49',
      id: 'line-golan-1974',
      conflictId: 'conflict-arab-israeli',
      name: 'Israel–Syria ceasefire line (1974)',
      validFrom: '1974-05-31',
      validTo: null,
      datePrecision: 'day',
      certainty: 'APPROXIMATE',
      sideA: 'Syria',
      sideB: 'Israel (Israeli-occupied Golan Heights)',
      disputed: true,
      confidence: 0.8,
      notes: `Line of the Agreement on Disengagement of 31 May 1974, with a UN-patrolled (UNDOF) zone between the two sides. ${NE_NOTE}`,
    },
    {
      key: 'B20',
      id: 'line-cyprus-1974',
      conflictId: 'conflict-cyprus',
      name: 'Cyprus ceasefire line (northern edge of the UN buffer zone)',
      validFrom: '1974-08-16',
      validTo: null,
      datePrecision: 'day',
      certainty: 'APPROXIMATE',
      sideA: 'Republic of Cyprus',
      sideB: 'Turkish-controlled north (Northern Cyprus)',
      disputed: true,
      confidence: 0.8,
      notes: `Ceasefire line of August 1974; the UN buffer zone ("Green Line") lies between the two sides' lines. ${NE_NOTE}`,
    },
    {
      key: 'B28',
      id: 'line-western-sahara-berm',
      conflictId: 'conflict-western-sahara',
      name: 'Moroccan Western Sahara Wall (Berm)',
      validFrom: '1987',
      validTo: null,
      datePrecision: 'year',
      certainty: 'APPROXIMATE',
      sideA: 'Polisario Front (east)',
      sideB: 'Morocco (west)',
      disputed: true,
      confidence: 0.8,
      notes: `Sand wall completed by Morocco in 1987; the 1991 UN ceasefire froze the front along it until fighting resumed in November 2020. ${NE_NOTE}`,
    },
  ];

export const FRONTLINES: Frontline[] = [
  {
    id: 'line-korea-38th-parallel-1945',
    conflictId: 'conflict-korean-war',
    name: '38th parallel division line',
    // The line is defined as latitude 38°N; only the coastal endpoints are approximate.
    geometry: {
      type: 'LineString',
      coordinates: [
        [124.65, 38.0],
        [125.5, 38.0],
        [126.5, 38.0],
        [127.5, 38.0],
        [128.65, 38.0],
      ],
    },
    validFrom: '1945-08',
    validTo: '1950-06-25',
    datePrecision: 'month',
    certainty: 'CERTAIN',
    sideA: 'Soviet zone (North Korea from 1948)',
    sideB: 'US zone (South Korea from 1948)',
    disputed: false,
    confidence: 0.9,
    source:
      'Defined by the 38th parallel north (US–Soviet agreement, August 1945). Coastal endpoints approximate.',
    license: 'Public domain (geometric definition)',
    notes: 'Replaced in 1953 by the Military Demarcation Line (line-korea-mdl-1953).',
  },
  ...CEASEFIRE_LINES.flatMap(({ key, ...line }): Frontline[] => {
    const parts = ceasefire.lines[key];
    if (!parts?.length) return [];
    return [
      {
        ...line,
        geometry: { type: 'MultiLineString', coordinates: parts },
        source: NE_SOURCE,
        license: NE_LICENSE,
      },
    ];
  }),
];

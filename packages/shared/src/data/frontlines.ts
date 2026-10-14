/**
 * Frontline / control-line records. Only lines whose geometry is defensible are included.
 * Real frontlines of ongoing conflicts are NOT bundled: they must be imported from a
 * licensed, cited dataset (see DATA_MODEL.md → frontlines). Until then the UI and the AI
 * report that frontline data is unavailable.
 */
import type { Frontline } from '../schemas';

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
    source: 'Defined by the 38th parallel north (US–Soviet agreement, August 1945). Coastal endpoints approximate.',
    license: 'Public domain (geometric definition)',
    notes: 'Replaced in 1953 by the Military Demarcation Line, whose geometry is not yet loaded.',
  },
];

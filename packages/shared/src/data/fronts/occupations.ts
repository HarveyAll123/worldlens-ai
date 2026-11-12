/**
 * Occupations with no front worth drawing: a country, or part of one, held whole by another
 * between two dates. The map paints that ground in the occupier's colour (the Territories
 * layer); the assistant is told of them with the fronts. Where the conquest took weeks and
 * its course is known, it is a theatre with a moving front instead (scripts/fronts/).
 */
export interface Occupation {
  id: string;
  name: string;
  war: string;
  conflictId: string;
  occupier: string;
  occupied: string;
  /** Colour key of the occupier (apps/web/src/globe/territoryColors.ts). */
  color: string;
  /** The occupied countries, by their OpenHistoricalMap names (a case-insensitive pattern). */
  polities: string;
  /** ISO days: from the first, up to but not including the last. */
  from: string;
  to: string;
  /** West, south, east, north: only the ground inside these boxes is painted. */
  boxes: Array<[number, number, number, number]>;
  sources: string[];
  note?: string;
}

export const OCCUPATIONS: Occupation[] = [
  {
    id: 'occupation-denmark-1940',
    name: 'German occupation of Denmark',
    war: 'Second World War',
    conflictId: 'conflict-world-war-ii',
    occupier: 'Germany',
    occupied: 'Denmark',
    color: 'germany',
    polities: '^denmark$',
    from: '1940-04-09',
    to: '1945-05-05',
    // Denmark proper: Iceland, Greenland and the Faroes, mapped with it, were not occupied by Germany.
    boxes: [[7.9, 54.5, 15.3, 57.9]],
    sources: ['https://en.wikipedia.org/wiki/Denmark_in_World_War_II'],
    note: 'Denmark was overrun in a few hours on 9 April 1940; the German forces there surrendered on 5 May 1945.',
  },
  {
    id: 'occupation-channel-islands-1940',
    name: 'German occupation of the Channel Islands',
    war: 'Second World War',
    conflictId: 'conflict-world-war-ii',
    occupier: 'Germany',
    occupied: 'Jersey and Guernsey (British Crown Dependencies)',
    color: 'germany',
    polities: '^(jersey|guernsey|bailiwick of (jersey|guernsey))',
    from: '1940-06-30',
    to: '1945-05-09',
    boxes: [[-2.8, 49.1, -1.9, 49.8]],
    sources: ['https://en.wikipedia.org/wiki/German_occupation_of_the_Channel_Islands'],
  },
  {
    id: 'occupation-kuwait-1990',
    name: 'Iraqi occupation of Kuwait',
    war: 'Gulf War',
    conflictId: 'conflict-gulf-war',
    occupier: 'Iraq',
    occupied: 'Kuwait',
    color: 'iraq',
    polities: '^kuwait$',
    from: '1990-08-02',
    to: '1991-02-27',
    boxes: [[46.4, 28.4, 48.6, 30.2]],
    sources: [
      'https://en.wikipedia.org/wiki/Iraqi_invasion_of_Kuwait',
      'https://en.wikipedia.org/wiki/Liberation_of_Kuwait_campaign',
    ],
    note: 'Kuwait was overrun on 2 August 1990 and annexed by Iraq; Kuwait City was freed on 27 February 1991.',
  },
];

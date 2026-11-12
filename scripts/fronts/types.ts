/**
 * How a front's theatre is written down (scripts/fronts/*.ts) before `pnpm data:fronts` turns
 * it into packages/shared/src/data/fronts/theatres.json.
 *
 * `places` has one place per line:
 *
 *     Name | Wikipedia title or @lat,lon | periods side A held it
 *
 *  - Name: as histories of the war write it ("Stalingrad", "Lemberg").
 *  - Second column: the English Wikipedia article of the place when its title differs from
 *    the name ("Volgograd"); coordinates come from its Wikidata item (CC0). Or "@lat,lon"
 *    for a spot with no article. Empty: the name is the title.
 *  - Periods: "1941-06-28..1944-07-03", several separated by commas. "<" as a start means
 *    side A held it since before the theatre opens; ">" as an end, until it closes. "-" (or
 *    nothing) means side A never held it — such places pin the line from the other side.
 *    "n" marks a place in a country that took no part: nothing is worked out across it.
 *
 * Lines starting with "#" are comments.
 */
export interface TheatreSource {
  id: string;
  name: string;
  war: string;
  conflictId: string;
  sideA: string;
  sideB: string;
  /** ISO days between which the theatre has a front. */
  start: string;
  end: string;
  /** Default 30. */
  horizonDays?: number;
  /** Default 500. */
  maxEdgeKm?: number;
  /** Default true. */
  clipToLand?: boolean;
  /**
   * Colouring the map by who held the ground: each side's colour (a key of
   * apps/web/src/globe/territoryColors.ts) and a case-insensitive pattern naming the countries
   * of the time (OpenHistoricalMap names) that were that side's own.
   */
  colorA: string;
  colorB: string;
  politiesA: string;
  politiesB: string;
  sources: string[];
  note?: string;
  places: string;
}

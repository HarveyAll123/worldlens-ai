import type { TheatreSource } from './types';

/**
 * The American Civil War, 12 April 1861 – 2 June 1865. Side A is the Confederacy: a period is
 * the time a town was in Confederate hands. Towns that changed hands many times (Winchester,
 * Jackson) are given their lasting change only; a town counts as Confederate from the start
 * even where its state seceded a few weeks later.
 */
export const AMERICAN_CIVIL_WAR: TheatreSource = {
  id: 'american-civil-war',
  name: 'American Civil War: Confederate-held territory',
  war: 'American Civil War',
  conflictId: 'conflict-american-civil-war',
  sideA: 'Confederate States',
  sideB: 'United States (the Union)',
  start: '1861-04-12',
  end: '1865-06-02',
  horizonDays: 45,
  maxEdgeKm: 900,
  colorA: 'confederacy',
  colorB: 'usa',
  politiesA: '^confederate states',
  politiesB: '^united states',
  sources: [
    'https://en.wikipedia.org/wiki/American_Civil_War',
    'https://en.wikipedia.org/wiki/Western_Theater_of_the_American_Civil_War',
    'https://en.wikipedia.org/wiki/Vicksburg_campaign',
    'https://en.wikipedia.org/wiki/Atlanta_campaign',
    'https://en.wikipedia.org/wiki/Sherman%27s_March_to_the_Sea',
    'https://en.wikipedia.org/wiki/Appomattox_campaign',
  ],
  places: `
# --- Virginia
Richmond | @37.54,-77.44 | <..1865-04-03
Petersburg | @37.23,-77.4 | <..1865-04-03
Alexandria | @38.8,-77.05 | <..1861-05-24
Harpers Ferry | @39.32,-77.73 | <..1861-06-15
Charleston, West Virginia | @38.35,-81.63 | <..1861-07-25
Manassas | @38.75,-77.47 | <..1862-03-10
Yorktown | @37.24,-76.51 | <..1862-05-04
Norfolk | @36.85,-76.29 | <..1862-05-10
Fredericksburg | @38.3,-77.46 | <..1864-05-10
Winchester | @39.19,-78.16 | <..1864-09-19
Staunton | @38.15,-79.07 | <..1865-03-02
Charlottesville | @38.03,-78.48 | <..1865-03-03
Lynchburg | @37.41,-79.14 | <..1865-04-12
Danville | @36.59,-79.4 | <..1865-04-27
# --- The Carolinas
Roanoke Island | @35.9,-75.67 | <..1862-02-08
New Bern | @35.11,-77.04 | <..1862-03-14
Wilmington | @34.23,-77.94 | <..1865-02-22
Fayetteville, North Carolina | @35.05,-78.88 | <..1865-03-11
Goldsboro | @35.38,-77.99 | <..1865-03-21
Raleigh | @35.78,-78.64 | <..1865-04-13
Asheville | @35.6,-82.55 | <..1865-04-26
Charlotte | @35.23,-80.84 | <..1865-05-07
Port Royal | @32.43,-80.67 | <..1861-11-07
Columbia | @34.0,-81.03 | <..1865-02-17
Charleston | @32.78,-79.93 | <..1865-02-18
Greenville | @34.85,-82.4 | <..1865-05-02
# --- Georgia and Florida
Dalton | @34.77,-84.97 | <..1864-05-13
Atlanta | @33.75,-84.39 | <..1864-09-02
Milledgeville | @33.08,-83.23 | <..1864-11-23
Savannah | @32.08,-81.09 | <..1864-12-21
Columbus, Georgia | @32.46,-84.99 | <..1865-04-16
Macon | @32.84,-83.63 | <..1865-04-20
Augusta | @33.47,-81.97 | <..1865-05-03
Saint Augustine | @29.9,-81.31 | <..1862-03-11
Pensacola | @30.42,-87.22 | <..1862-05-10
Jacksonville | @30.33,-81.66 | <..1864-02-07
Tampa | @27.95,-82.46 | <..1864-05-06
Tallahassee | @30.44,-84.28 | <..1865-05-10
Key West | @24.56,-81.78 | -
# --- Alabama and Mississippi
Huntsville | @34.73,-86.59 | <..1862-04-11
Selma | @32.41,-87.02 | <..1865-04-02
Tuscaloosa | @33.21,-87.57 | <..1865-04-04
Montgomery | @32.38,-86.31 | <..1865-04-12
Mobile | @30.69,-88.04 | <..1865-04-12
Corinth | @34.93,-88.52 | <..1862-05-30
Vicksburg | @32.35,-90.88 | <..1863-07-04
Natchez | @31.56,-91.4 | <..1863-07-13
Jackson, Mississippi | @32.3,-90.18 | <..1863-07-17
Meridian | @32.36,-88.7 | <..1865-05-04
# --- Tennessee and Kentucky
Fort Donelson | @36.49,-87.84 | <..1862-02-16
Nashville | @36.16,-86.78 | <..1862-02-25
Memphis | @35.15,-90.05 | <..1862-06-06
Jackson, Tennessee | @35.61,-88.81 | <..1862-06-07
Murfreesboro | @35.85,-86.39 | <..1863-01-05
Knoxville | @35.96,-83.92 | <..1863-09-02
Chattanooga | @35.05,-85.31 | <..1863-09-09
Cumberland Gap | @36.6,-83.67 | 1861-09-14..1862-06-18, 1862-09-17..1863-09-09
Columbus, Kentucky | @36.76,-89.1 | 1861-09-04..1862-03-02
Bowling Green | @36.99,-86.44 | 1861-09-18..1862-02-14
Lexington, Kentucky | @38.04,-84.5 | 1862-09-02..1862-10-08
Frankfort | @38.2,-84.87 | 1862-09-03..1862-10-04
Louisville | @38.25,-85.76 | -
Paducah | @37.08,-88.6 | -
# --- West of the Mississippi
New Orleans | @29.95,-90.07 | <..1862-05-01
Baton Rouge | @30.45,-91.19 | <..1862-05-09, 1862-08-21..1862-12-17
Port Hudson | @30.69,-91.27 | <..1863-07-09
Alexandria, Louisiana | @31.31,-92.45 | <..1864-03-16, 1864-05-13..>
Shreveport | @32.52,-93.75 | <..>
Helena | @34.53,-90.59 | <..1862-07-12
Fayetteville, Arkansas | @36.06,-94.16 | <..1862-12-08
Fort Smith | @35.39,-94.4 | <..1863-09-01
Little Rock | @34.75,-92.29 | <..1863-09-10
Pine Bluff | @34.23,-92.0 | <..1863-09-14
Camden, Arkansas | @33.58,-92.83 | <..>
Tahlequah | @35.92,-94.97 | 1861-10-07..1863-07-17
New Madrid | @36.59,-89.53 | 1861-07-28..1862-03-14
Springfield, Missouri | @37.21,-93.29 | 1861-08-11..1862-02-13
Galveston | @29.3,-94.8 | <..1862-10-09, 1863-01-01..>
Brownsville | @25.9,-97.5 | <..1863-11-06, 1864-07-30..>
Houston | @29.76,-95.37 | <..>
Austin | @30.27,-97.74 | <..>
San Antonio | @29.42,-98.49 | <..>
Dallas | @32.78,-96.8 | <..>
El Paso | @31.76,-106.49 | <..1862-08-20
Mesilla | @32.27,-106.8 | 1861-07-25..1862-08-07
Tucson | @32.22,-110.97 | 1862-02-28..1862-05-20
Albuquerque | @35.08,-106.65 | 1862-03-02..1862-04-12
Santa Fe | @35.69,-105.94 | 1862-03-10..1862-04-08
# --- Never Confederate
Washington | @38.9,-77.04 | -
Baltimore | @39.29,-76.61 | -
Fort Monroe | @37.0,-76.31 | -
Wheeling | @40.06,-80.72 | -
Harrisburg | @40.26,-76.88 | -
Philadelphia | @39.95,-75.17 | -
Cincinnati | @39.1,-84.51 | -
Cairo, Illinois | @37.0,-89.18 | -
Saint Louis | @38.63,-90.2 | -
Jefferson City | @38.58,-92.17 | -
Kansas City | @39.1,-94.58 | -
`,
};

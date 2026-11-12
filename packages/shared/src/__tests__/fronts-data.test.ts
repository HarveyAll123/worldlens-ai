import { describe, expect, it } from 'vitest';
import { CONFLICTS } from '../data';
import {
  FRONT_THEATRES,
  OCCUPATIONS,
  controlAt,
  frontBriefs,
  frontTheatreList,
  isLand,
  occupationBriefs,
  reconstructedFrontlines,
} from '../data/fronts';
import { dayNumber, heldByA, holderAt } from '../fronts';
import { FrontlineSchema } from '../schemas';

const at = (iso: string) => Date.parse(`${iso}T12:00:00Z`);
const theatre = (id: string) => {
  const t = FRONT_THEATRES.find((x) => x.id === id);
  if (!t) throw new Error(`no theatre ${id}`);
  return t;
};
/** Whether side A holds a place of a theatre on a day. */
const holds = (id: string, place: string, iso: string) => {
  const p = theatre(id).places.find((x) => x.name === place);
  if (!p) throw new Error(`no place ${place} in ${id}`);
  return heldByA(p, dayNumber(at(iso)));
};
const points = (id: string, iso: string) => {
  const f = reconstructedFrontlines(at(iso)).find((x) => x.id === `front-${id}`);
  return f && f.geometry.type === 'MultiLineString' ? f.geometry.coordinates.flat() : [];
};
const km = (a: number[], lon: number, lat: number) =>
  Math.hypot((a[0]! - lon) * Math.cos((lat * Math.PI) / 180), a[1]! - lat) * 111.2;

describe('the front theatres', () => {
  it('are well formed', () => {
    const conflicts = new Set(CONFLICTS.map((c) => c.id));
    expect(new Set(FRONT_THEATRES.map((t) => t.id)).size).toBe(FRONT_THEATRES.length);
    for (const t of FRONT_THEATRES) {
      expect(conflicts.has(t.conflictId), `${t.id}: ${t.conflictId}`).toBe(true);
      expect(t.end).toBeGreaterThan(t.start);
      expect(t.places.length).toBeGreaterThanOrEqual(20);
      expect(t.sources.length).toBeGreaterThan(0);
      expect(t.colorA && t.colorB).toBeTruthy();
      expect(() => new RegExp(t.politiesA, 'i')).not.toThrow();
      expect(() => new RegExp(t.politiesB, 'i')).not.toThrow();
      for (const p of t.places) {
        expect(Math.abs(p.lat)).toBeLessThanOrEqual(90);
        expect(Math.abs(p.lon)).toBeLessThanOrEqual(180);
        let last = -Infinity;
        for (const [from, to] of p.held) {
          expect(to, `${t.id} ${p.name}`).toBeGreaterThan(from);
          expect(from, `${t.id} ${p.name}`).toBeGreaterThanOrEqual(last);
          last = to;
        }
      }
      // Every place is on land or at its edge (a port, a lagoon city) — not a spot at sea —
      // islands' theatres aside.
      const ashore = (lon: number, lat: number) =>
        [-0.25, 0, 0.25].some((dx) => [-0.25, 0, 0.25].some((dy) => isLand(lon + dx, lat + dy)));
      if (t.clipToLand)
        for (const p of t.places) expect(ashore(p.lon, p.lat), `${t.id} ${p.name}`).toBe(true);
    }
  });

  it('give records the globe can draw, only while the front exists', () => {
    for (const iso of ['1916-07-01', '1938-06-01', '1942-11-18', '1944-09-15', '1950-09-10']) {
      const fronts = reconstructedFrontlines(at(iso));
      expect(fronts.length, iso).toBeGreaterThan(0);
      for (const f of fronts) {
        expect(FrontlineSchema.safeParse(f).success, `${iso} ${f.id}`).toBe(true);
        expect(f.certainty).toBe('RECONSTRUCTED');
      }
    }
    expect(reconstructedFrontlines(at('1930-01-01'))).toEqual([]);
    expect(reconstructedFrontlines(at('1941-06-21')).map((f) => f.name)).not.toContain(
      'Eastern Front',
    );
    expect(reconstructedFrontlines(at('1945-05-10')).map((f) => f.name)).not.toContain(
      'Eastern Front',
    );
    expect(frontTheatreList().length).toBe(FRONT_THEATRES.length);
  });
});

describe('the Eastern Front, 1941–45', () => {
  const id = 'ww2-eastern-front';
  it('knows who held what, when', () => {
    expect(holds(id, 'Minsk', '1941-06-27')).toBe(false);
    expect(holds(id, 'Minsk', '1941-06-29')).toBe(true);
    expect(holds(id, 'Minsk', '1944-07-04')).toBe(false);
    expect(holds(id, 'Kiev', '1942-06-01')).toBe(true);
    expect(holds(id, 'Kharkov', '1943-03-01')).toBe(false); // between its two occupations
    expect(holds(id, 'Kharkov', '1943-04-01')).toBe(true);
    expect(holds(id, 'Berlin', '1945-05-01')).toBe(true);
    expect(holds(id, 'Berlin', '1945-05-03')).toBe(false);
    for (const never of ['Moscow', 'Leningrad', 'Tula', 'Grozny', 'Astrakhan'])
      expect(theatre(id).places.find((p) => p.name === never)!.held).toEqual([]);
  });

  it('runs from Leningrad past Stalingrad to the Caucasus on the eve of Uranus', () => {
    const line = points(id, '1942-11-18');
    expect(line.length).toBeGreaterThan(100);
    const lats = line.map((p) => p[1]!);
    expect(Math.max(...lats)).toBeGreaterThan(59);
    expect(Math.min(...lats)).toBeLessThan(44.5);
    // Close by Stalingrad and Voronezh; well clear of Moscow, Kiev and Berlin.
    const nearest = (lon: number, lat: number) => Math.min(...line.map((p) => km(p, lon, lat)));
    expect(nearest(44.5, 48.7)).toBeLessThan(80);
    expect(nearest(39.2, 51.7)).toBeLessThan(80);
    expect(nearest(37.6, 55.75)).toBeGreaterThan(100);
    expect(nearest(30.5, 50.45)).toBeGreaterThan(400);
    expect(nearest(13.4, 52.5)).toBeGreaterThan(1200);
  });

  it('moves a little every day while an offensive is on', () => {
    // Bagration: the front in Belarus, 23 June – 4 July 1944.
    const east = (iso: string) => {
      const band = points(id, iso).filter((p) => p[1]! > 53 && p[1]! < 55);
      return band.reduce((s, p) => s + p[0]!, 0) / band.length;
    };
    let last = east('1944-06-22');
    let moved = 0;
    for (let d = 23; d <= 30; d++) {
      const now = east(`1944-06-${d}`);
      expect(now).toBeLessThan(last + 0.05); // westward, never jumping back east
      if (last - now > 0.01) moved++;
      last = now;
    }
    expect(moved).toBeGreaterThanOrEqual(6);
    expect(east('1944-06-22') - east('1944-07-15')).toBeGreaterThan(3);
  });

  it('tells the assistant where the front is, by places', () => {
    const [brief] = frontBriefs(at('1942-11-18'), 'conflict-world-war-ii').filter(
      (b) => b.name === 'Eastern Front',
    );
    expect(brief).toBeDefined();
    expect(brief!.certainty).toBe('RECONSTRUCTED');
    expect(brief!.held_by_side_a_near_the_line.length).toBeGreaterThan(8);
    expect(brief!.held_by_side_b_near_the_line.length).toBeGreaterThan(8);
    // North to south.
    expect(brief!.held_by_side_a_near_the_line[0]).toMatch(/Shlisselburg|Peterhof|Pushkin|Mga/);
    const january = frontBriefs(at('1943-02-10')).find((b) => b.name === 'Eastern Front')!;
    expect(january.changed_hands_in_the_last_30_days.map((c) => c.place)).toContain('Kursk');
  });
});

describe('other theatres', () => {
  it('Korea: Seoul changes hands four times', () => {
    const id = 'korean-war';
    expect(holds(id, 'Seoul', '1950-06-27')).toBe(false);
    expect(holds(id, 'Seoul', '1950-07-15')).toBe(true);
    expect(holds(id, 'Seoul', '1950-10-15')).toBe(false);
    expect(holds(id, 'Seoul', '1951-02-01')).toBe(true);
    expect(holds(id, 'Seoul', '1951-04-01')).toBe(false);
    expect(holds(id, 'Busan', '1950-09-01')).toBe(false);
    // The Pusan Perimeter: the line stays within 150 km of Busan.
    for (const p of points(id, '1950-09-05')) expect(km(p, 129.04, 35.1)).toBeLessThan(190);
  });

  it('France: the line of June 1940, then the demarcation line until November 1942', () => {
    const weygand = points('ww2-battle-of-france', '1940-06-05');
    expect(weygand.length).toBeGreaterThan(20);
    for (const [, lat] of weygand) expect(lat).toBeGreaterThan(47.2);
    const demarcation = points('ww2-occupied-france', '1941-06-01');
    expect(demarcation.length).toBeGreaterThan(20);
    // Between Tours (occupied) and Loches (free), and between Moulins and Vichy.
    const nearest = (lon: number, lat: number) =>
      Math.min(...demarcation.map((p) => km(p, lon, lat)));
    expect(nearest(0.85, 47.25)).toBeLessThan(30);
    expect(nearest(3.38, 46.35)).toBeLessThan(30);
    // Gone once the free zone was occupied.
    expect(points('ww2-occupied-france', '1943-01-01')).toEqual([]);
  });

  it('China: Wuhan falls in October 1938; Chongqing never', () => {
    const id = 'second-sino-japanese-war';
    expect(holds(id, 'Wuhan', '1938-10-20')).toBe(false);
    expect(holds(id, 'Wuhan', '1938-11-01')).toBe(true);
    expect(theatre(id).places.find((p) => p.name === 'Chongqing')!.held).toEqual([]);
  });

  it('gives the ground each side holds, for colouring the map', () => {
    const zones = controlAt(at('1942-11-18'));
    const east = zones.find((z) => z.theatre.id === 'ww2-eastern-front')!;
    expect(east.a.length).toBeGreaterThan(200);
    expect(east.b.length).toBeGreaterThan(100);
    expect(controlAt(at('1930-01-01'))).toEqual([]);
  });

  it('covers wars from 1812 to 1995', () => {
    const wars = new Set(FRONT_THEATRES.map((t) => t.war));
    for (const war of [
      'Napoleonic Wars',
      'American Civil War',
      'Franco-Prussian War',
      'First World War',
      'Spanish Civil War',
      'Second World War',
      'Chinese Civil War',
      'Korean War',
      'Iran–Iraq War',
      'Yugoslav Wars',
    ])
      expect(wars.has(war), war).toBe(true);
    expect(FRONT_THEATRES.length).toBeGreaterThanOrEqual(38);
  });

  it('1812: Moscow is French for five weeks', () => {
    const id = 'french-invasion-of-russia';
    expect(holds(id, 'Moscow', '1812-09-10')).toBe(false);
    expect(holds(id, 'Moscow', '1812-10-01')).toBe(true);
    expect(holds(id, 'Moscow', '1812-11-01')).toBe(false);
    expect(holds(id, 'Saint Petersburg', '1812-10-01')).toBe(false);
  });

  it('American Civil War: Vicksburg falls on 4 July 1863, Richmond in April 1865', () => {
    const id = 'american-civil-war';
    expect(holds(id, 'Vicksburg', '1863-07-01')).toBe(true);
    expect(holds(id, 'Vicksburg', '1863-07-05')).toBe(false);
    expect(holds(id, 'Richmond', '1865-04-01')).toBe(true);
    expect(holds(id, 'Richmond', '1865-04-05')).toBe(false);
    expect(holds(id, 'Washington', '1863-07-01')).toBe(false);
  });

  it('First World War in the east: Warsaw falls in August 1915, Kiev in March 1918', () => {
    const id = 'ww1-eastern-front';
    expect(holds(id, 'Warsaw', '1915-08-01')).toBe(false);
    expect(holds(id, 'Warsaw', '1915-08-10')).toBe(true);
    expect(holds(id, 'Lemberg', '1915-01-01')).toBe(false);
    expect(holds(id, 'Lemberg', '1915-07-01')).toBe(true);
    expect(holds(id, 'Kiew', '1918-04-01')).toBe(true);
    expect(holds(id, 'Moscow', '1918-04-01')).toBe(false);
    // Romania, neutral until August 1916, is a theatre of its own.
    expect(theatre('ww1-romanian-front').start).toBe(Math.floor(dayNumber(at('1916-08-27'))));
    expect(holds('ww1-romanian-front', 'Bukarest', '1917-01-01')).toBe(true);
  });

  it('Spain: Madrid holds out until 28 March 1939', () => {
    const id = 'spanish-civil-war';
    expect(holds(id, 'Seville', '1936-08-01')).toBe(true);
    expect(holds(id, 'Madrid', '1939-03-01')).toBe(false);
    expect(holds(id, 'Madrid', '1939-03-30')).toBe(true);
    expect(holds(id, 'Teruel', '1938-02-01')).toBe(false);
  });

  it('the Pacific: Singapore, Guadalcanal, Manila', () => {
    const id = 'ww2-pacific';
    expect(holds(id, 'Singapore', '1942-02-10')).toBe(false);
    expect(holds(id, 'Singapore', '1942-02-20')).toBe(true);
    expect(holds(id, 'Henderson Field', '1942-08-01')).toBe(true);
    expect(holds(id, 'Henderson Field', '1942-08-10')).toBe(false);
    expect(holds(id, 'Manila', '1944-06-01')).toBe(true);
    expect(holds(id, 'Manila', '1945-03-10')).toBe(false);
    expect(holds(id, 'Honolulu', '1942-06-01')).toBe(false);
    // The perimeter is a line over the sea: it is not cut to the land.
    expect(theatre(id).clipToLand).toBe(false);
    expect(points(id, '1942-08-01').length).toBeGreaterThan(50);
  });

  it('Norway and Greece: taken in weeks, held for years', () => {
    expect(holds('ww2-norway', 'Oslo', '1940-04-08')).toBe(false);
    expect(holds('ww2-norway', 'Oslo', '1943-01-01')).toBe(true);
    expect(holds('ww2-norway', 'Narvik', '1940-06-01')).toBe(false);
    expect(holds('ww2-norway', 'Kirkenes', '1944-11-01')).toBe(false);
    expect(holds('ww2-greece', 'Athens', '1941-04-20')).toBe(false);
    expect(holds('ww2-greece', 'Athens', '1943-01-01')).toBe(true);
    expect(holds('ww2-greece', 'Athens', '1944-11-01')).toBe(false);
    expect(holds('ww2-greece', 'Chania', '1945-04-01')).toBe(true);
  });
});

describe('who holds a point, as the map paints it', () => {
  /** The holder of a spot (not necessarily a listed place) in a theatre on a day. */
  const holder = (id: string, iso: string, lat: number, lon: number) =>
    holderAt(theatre(id), dayNumber(at(iso)), lon, lat, isLand);

  it('keeps the Tikhvin thrust a thrust: the Valdai and the upper Volga stay Soviet', () => {
    const east = 'ww2-eastern-front';
    // 1 December 1941: Tikhvin and Kalinin are German, at the tips of two salients …
    expect(holder(east, '1941-12-01', 59.64, 33.51)).toBe('a');
    expect(holder(east, '1941-12-01', 56.86, 35.9)).toBe('a');
    // … and nothing joins them: Bezhetsk, Borovichi, Bologoye, Rybinsk were never reached.
    for (const [lat, lon] of [
      [57.78, 36.69],
      [58.39, 33.91],
      [57.88, 34.05],
      [58.05, 38.83],
      [59.13, 37.9],
    ] as const)
      expect(holder(east, '1941-12-01', lat, lon), `${lat},${lon}`).toBe('b');
    // Leningrad holds out behind the siege line; the Oranienbaum bridgehead too.
    expect(holder(east, '1942-06-01', 59.94, 30.31)).toBe('b');
    expect(holder(east, '1942-06-01', 59.9, 29.5)).toBe('b');
    expect(holder(east, '1942-06-01', 59.57, 30.13)).toBe('a');
  });

  it('stops the 1942 advance on the Don, the Volga and the Caucasus', () => {
    const east = 'ww2-eastern-front';
    // West bank of the Don German, east bank Soviet; Stalingrad's centre German, the far bank not.
    expect(holder(east, '1942-11-10', 50.3, 39.6)).toBe('a');
    expect(holder(east, '1942-11-10', 50.5, 40.6)).toBe('b');
    expect(holder(east, '1942-11-10', 48.71, 44.45)).toBe('a');
    expect(holder(east, '1942-11-10', 48.75, 44.9)).toBe('b');
    // Astrakhan, Grozny and Tuapse were never taken.
    expect(holder(east, '1942-11-10', 46.35, 48.04)).toBe('b');
    expect(holder(east, '1942-11-10', 43.32, 45.69)).toBe('b');
    expect(holder(east, '1942-11-10', 44.1, 39.08)).toBe('b');
  });

  it('paints the ground beside a neutral country: the French Jura was occupied to the frontier', () => {
    const id = 'ww2-occupied-france';
    // Morteau and Maîche, between Pontarlier and the Swiss border: occupied zone.
    expect(holder(id, '1941-06-15', 47.06, 6.6)).toBe('a');
    expect(holder(id, '1941-06-15', 47.25, 6.8)).toBe('a');
    // Annecy, south of the line: free until November 1942.
    expect(holder(id, '1941-06-15', 45.9, 6.12)).toBe('b');
    expect(holder(id, '1942-12-15', 45.9, 6.12)).toBe('a');
  });

  it('holds the Rhine: Baden is not Allied in January 1945', () => {
    const id = 'ww2-western-front';
    // Offenburg and Lörrach, east of the river: German until April.
    expect(holder(id, '1945-01-15', 48.47, 7.95)).toBe('a');
    expect(holder(id, '1945-01-15', 47.62, 7.66)).toBe('a');
    expect(holder(id, '1945-04-28', 48.47, 7.95)).toBe('b');
    // Strasbourg, west of it: Allied since November.
    expect(holder(id, '1945-01-15', 48.58, 7.72)).toBe('b');
  });
});

describe('occupations with no front', () => {
  it('are well formed', () => {
    const conflicts = new Set(CONFLICTS.map((c) => c.id));
    expect(new Set(OCCUPATIONS.map((o) => o.id)).size).toBe(OCCUPATIONS.length);
    for (const o of OCCUPATIONS) {
      expect(conflicts.has(o.conflictId), `${o.id}: ${o.conflictId}`).toBe(true);
      expect(o.to > o.from, o.id).toBe(true);
      expect(() => new RegExp(o.polities, 'i')).not.toThrow();
      for (const [w, s, e, n] of o.boxes) {
        expect(e).toBeGreaterThan(w);
        expect(n).toBeGreaterThan(s);
      }
    }
  });

  it('paint Denmark as held by Germany from 9 April 1940 to 5 May 1945, and tell the assistant', () => {
    const zone = (iso: string) =>
      controlAt(at(iso)).find((z) => z.theatre.id === 'occupation-denmark-1940');
    expect(zone('1940-04-08')).toBeUndefined();
    const held = zone('1942-06-15')!;
    expect(held.theatre.colorA).toBe('germany');
    expect(new RegExp(held.theatre.politiesB, 'i').test('Denmark')).toBe(true);
    // Denmark proper only: Iceland and Greenland, mapped with it, were never German.
    expect(held.a).toHaveLength(1);
    expect(Math.min(...held.a[0]!.map((p) => p[0]!))).toBeGreaterThan(5);
    expect(held.b).toEqual([]);
    expect(zone('1945-05-06')).toBeUndefined();
    expect(occupationBriefs(at('1942-06-15')).map((o) => o.name)).toContain(
      'German occupation of Denmark',
    );
    expect(occupationBriefs(at('1990-10-01')).map((o) => o.occupied)).toEqual(['Kuwait']);
    // Occupations come first, so a front over the same ground is painted over them.
    expect(controlAt(at('1942-06-15'))[0]!.theatre.id).toMatch(/^occupation-/);
  });
});

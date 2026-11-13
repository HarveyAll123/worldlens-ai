import { describe, expect, it } from 'vitest';
import type { PlaceName } from '@worldlens/shared';
import {
  PLACE_STYLE,
  inZoom,
  nameBox,
  namesInTheClear,
  placePlaceNames,
  placeText,
  placeTextStyle,
  webZoom,
  type MovingName,
  type PlaceCandidate,
} from './placeNames';

const place = (o: Partial<PlaceName> & { id: string }): PlaceName => ({
  name: o.id,
  lat: 0,
  lon: 0,
  minZoom: 3,
  kind: 'c',
  ...o,
});
const at = (p: PlaceName, x: number, y: number, width = 60, height = 14): PlaceCandidate => ({
  place: p,
  x,
  y,
  width,
  height,
});

describe('place names on the globe', () => {
  it('appear by zoom: oceans first, small towns last', () => {
    expect(webZoom(156_543.03)).toBeCloseTo(0);
    expect(webZoom(156_543.03 / 8)).toBeCloseTo(3);
    const ocean = place({ id: 'o1', kind: 'o', minZoom: 1 });
    const town = place({ id: 'c1', kind: 'c', minZoom: 7 });
    expect(inZoom(ocean, 1)).toBe(true);
    expect(inZoom(town, 4)).toBe(false);
    expect(inZoom(town, 7.5)).toBe(true);
    expect(placeText(place({ id: 'm', name: 'Alps', kind: 'm' }))).toBe('ALPS');
    expect(placeText(place({ id: 'p', name: 'Mount Everest', kind: 'p' }))).toBe('▲ Mount Everest');
  });

  it('never over an event’s marker or title, a country name, a panel — or each other', () => {
    const paris = place({ id: 'paris', kind: 'C', minZoom: 1.7 });
    const lyon = place({ id: 'lyon', minZoom: 3 });
    const seine = place({ id: 'seine', kind: 'r', minZoom: 4 });
    // An event's marker right where Lyon's dot would be; a panel over the Seine's label.
    const marker = { x: 296, y: 296, width: 10, height: 10 };
    const panel = { x: 380, y: 380, width: 200, height: 200 };
    const placed = placePlaceNames(
      [at(paris, 100, 100), at(lyon, 300, 300), at(seine, 420, 420)],
      [marker, panel],
      10,
    );
    expect(placed.map((p) => p.place.id)).toEqual(['paris']);
    // Two names on one spot: the more important one only.
    const two = placePlaceNames([at(lyon, 200, 200), at(paris, 205, 202)], [], 10);
    expect(two.map((p) => p.place.id)).toEqual(['paris']);
  });

  it('a city takes the free side of its dot; other names centre on their place', () => {
    const city = place({ id: 'city' });
    const blockRight = { x: 210, y: 190, width: 80, height: 20 };
    const [left] = placePlaceNames([at(city, 200, 200)], [blockRight], 10);
    expect(left).toMatchObject({ side: 'left' });
    expect(left!.rect.x + left!.rect.width).toBeLessThanOrEqual(200);
    const [lake] = placePlaceNames([at(place({ id: 'l', kind: 'l' }), 200, 200)], [], 10);
    expect(lake).toMatchObject({ side: 'center', rect: { x: 170 } });
  });

  it('a name is not cut off at the edge of the screen', () => {
    const frame = { width: 390 };
    const city = (id: string) => place({ id });
    // København near the right edge: the name goes left of its dot, where all of it shows.
    const [right] = placePlaceNames([at(city('kobenhavn'), 360, 200, 80)], [], 10, 4, frame);
    expect(right).toMatchObject({ side: 'left' });
    // Something already to its left as well: no room on either side, so it waits.
    const taken = { x: 250, y: 190, width: 100, height: 20 };
    expect(placePlaceNames([at(city('kobenhavn'), 360, 200, 80)], [taken], 10, 4, frame)).toEqual(
      [],
    );
    // A city at the left edge keeps the usual side; one wider than the screen has no side.
    expect(placePlaceNames([at(city('dublin'), 6, 200, 60)], [], 10, 4, frame)[0]).toMatchObject({
      side: 'right',
    });
    // A sea may run a little over the edge (a tenth of it here), not nearly half of it.
    const sea = place({ id: 'biscay', kind: 's' });
    expect(placePlaceNames([at(sea, 10, 300, 100)], [], 10, 4, frame)).toHaveLength(0);
    expect(placePlaceNames([at(sea, 40, 300, 100)], [], 10, 4, frame)).toHaveLength(1);
    // Without a frame (the old call), nothing changes.
    expect(placePlaceNames([at(city('kobenhavn'), 360, 200, 80)], [], 10)[0]).toMatchObject({
      side: 'right',
    });
  });

  it('a budget keeps a phone screen readable', () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      at(place({ id: `c${i}`, minZoom: 3 }), (i % 8) * 120 + 10, Math.floor(i / 8) * 60 + 10),
    );
    expect(placePlaceNames(many, [], 12)).toHaveLength(12);
  });

  it('are opaque and near white whatever their kind, so they read on any ground', () => {
    for (const [kind, style] of Object.entries(PLACE_STYLE)) {
      // #rrggbb with every channel at 0xd0 or above: bright, and never see-through.
      expect(style.color, kind).toMatch(/^#[d-f][0-9a-f][d-f][0-9a-f][d-f][0-9a-f]$/);
      expect(style.size, kind).toBeGreaterThanOrEqual(11);
    }
    // Capitals lead by size and brightness, not weight (DESIGN.md: regular weight only).
    expect(PLACE_STYLE.C.size).toBeGreaterThan(PLACE_STYLE.c.size);
    expect(placeTextStyle('C').font).toContain('400 13.5px');
    expect(placeTextStyle('r').font).toMatch(/^italic 400 /);
    // Spaced capitals for ranges; one style object per kind (drawn names are cached by it).
    expect(placeTextStyle('m').tracking).toBeGreaterThan(0);
    expect(placeTextStyle('m')).toBe(placeTextStyle('m'));
  });

  it('a name sits beside its dot or centred on its place', () => {
    expect(nameBox(200, 100, 'right', 60, 16)).toEqual({ x: 206, y: 92, width: 60, height: 16 });
    expect(nameBox(200, 100, 'left', 60, 16)).toEqual({ x: 134, y: 92, width: 60, height: 16 });
    expect(nameBox(200, 100, 'center', 60, 16)).toEqual({ x: 170, y: 92, width: 60, height: 16 });
  });

  it('while the view moves, a name steps aside for an event, a battle or a more important name', () => {
    const name = (x: number, y: number, o: Partial<MovingName> = {}): MovingName => ({
      box: nameBox(x, y, 'right', 60, 16),
      dot: { x, y },
      hidden: false,
      ...o,
    });
    const marker = (x: number, y: number) => ({ x: x - 9, y: y - 9, width: 18, height: 18 });
    // Zooming out brought a battle's marker onto Lyon's name, and Lyon's dot onto another.
    expect(namesInTheClear([name(100, 100)], [marker(140, 100)])).toEqual([false]);
    expect(namesInTheClear([name(100, 100)], [marker(101, 101)])).toEqual([false]);
    expect(namesInTheClear([name(100, 100)], [marker(140, 140)])).toEqual([true]);
    // An event's title is an obstacle like its marker.
    const title = { x: 150, y: 89, width: 120, height: 22 };
    expect(namesInTheClear([name(100, 100)], [title])).toEqual([false]);
    // Two names run into each other: the more important one (first) stays.
    expect(namesInTheClear([name(100, 100), name(130, 104), name(400, 100)], [])).toEqual([
      true,
      false,
      true,
    ]);
    // A name that stepped aside comes back only with room to spare — no flicker on the edge.
    const near = marker(178, 100); // 3 px clear of the name's box
    expect(namesInTheClear([name(100, 100)], [near])).toEqual([true]);
    expect(namesInTheClear([name(100, 100, { hidden: true })], [near])).toEqual([false]);
    expect(namesInTheClear([name(100, 100, { hidden: true })], [marker(190, 100)])).toEqual([true]);
  });
});

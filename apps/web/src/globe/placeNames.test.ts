import { describe, expect, it } from 'vitest';
import type { PlaceName } from '@worldlens/shared';
import { inZoom, placePlaceNames, placeText, webZoom, type PlaceCandidate } from './placeNames';

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

  it('a budget keeps a phone screen readable', () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      at(place({ id: `c${i}`, minZoom: 3 }), (i % 8) * 120 + 10, Math.floor(i / 8) * 60 + 10),
    );
    expect(placePlaceNames(many, [], 12)).toHaveLength(12);
  });
});

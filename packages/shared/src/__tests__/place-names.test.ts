import { describe, expect, it } from 'vitest';
import {
  decodePlaceNames,
  findPlaceNames,
  normalizePlaceName,
  placeShapeId,
  type PlaceNameRaw,
} from '../place-names';
import namesJson from '../../../../apps/web/public/data/places/names.json';

// The real list the app ships (apps/web/public/data/places/names.json).
const places = decodePlaceNames(namesJson as unknown as { places: PlaceNameRaw[] });
const top = (q: string, group?: Parameters<typeof findPlaceNames>[2]) =>
  findPlaceNames(places, q, group)[0];

describe('place names', () => {
  it('finds rivers, lakes, seas, mountains, deserts and cities by the names people use', () => {
    expect(top('Nile')).toMatchObject({ kind: 'r' });
    expect(top('the Nile River')).toMatchObject({ name: 'Nile', kind: 'r' });
    expect(top('Amazon', 'river')).toMatchObject({ kind: 'r' });
    expect(top('Lake Victoria')).toMatchObject({ kind: 'l' });
    expect(top('Nyanza')).toMatchObject({ name: 'Lake Victoria' });
    expect(top('Mediterranean')).toMatchObject({ name: 'Mediterranean Sea', kind: 's' });
    expect(top('Himalayas')).toMatchObject({ kind: 'm' });
    expect(top('Mount Everest')).toMatchObject({ kind: 'p' });
    expect(top('Sahara')).toMatchObject({ kind: 'd' });
    expect(top('Paris')).toMatchObject({ kind: 'C' });
    expect(top('Gulf of Mexico')).toMatchObject({ kind: 's' });
  });

  it('the kind decides between namesakes; nothing is invented', () => {
    expect(top('Victoria', 'lake')).toMatchObject({ name: 'Lake Victoria' });
    expect(top('Mississippi', 'river')).toMatchObject({ kind: 'r' });
    expect(findPlaceNames(places, 'Atlantis')).toEqual([]);
    expect(findPlaceNames(places, 'Paris', 'river')).toEqual([]);
  });

  it('labels sit where the place is', () => {
    // A river's label points share its shape; a sea's label is in the sea.
    const nile = places.filter((p) => p.name === 'Nile');
    expect(new Set(nile.map((p) => placeShapeId(p.id))).size).toBe(1);
    const gulf = top('Gulf of Mexico')!;
    expect(gulf.lat).toBeGreaterThan(21);
    expect(gulf.lat).toBeLessThan(29);
    expect(gulf.lon).toBeGreaterThan(-97);
    expect(gulf.lon).toBeLessThan(-84);
    const paris = top('Paris')!;
    expect(paris.lat).toBeCloseTo(48.87, 1);
    expect(paris.lon).toBeCloseTo(2.33, 1);
    expect(normalizePlaceName('Río Grande')).toBe('rio grande');
  });
});

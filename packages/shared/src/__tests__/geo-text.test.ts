import { describe, expect, it } from 'vitest';
import {
  bboxContains,
  haversineKm,
  parseBBox,
  simplifyLine,
  simplifyPolygonGeometry,
} from '../geo';
import {
  cosine,
  extractYears,
  headlineSimilarity,
  sanitizeText,
  termVector,
  tokenize,
} from '../text';
import { COUNTRIES, findCountry, normalizeName, resolvePlace } from '../data/geo';

describe('geo', () => {
  it("a country's own name wins over territories that name it as their sovereign", () => {
    // New Caledonia's sovereign is "France", Puerto Rico's "United States of America".
    expect(findCountry('France')?.iso3).toBe('FRA');
    expect(findCountry('United States')?.iso3).toBe('USA');
    expect(findCountry('United States of America')?.iso3).toBe('USA');
    expect(resolvePlace('France')?.name).toBe('France');
    for (const c of COUNTRIES)
      expect(normalizeName(findCountry(c.name)?.name ?? ''), c.name).toBe(normalizeName(c.name));
  });

  it('computes great-circle distances', () => {
    expect(haversineKm(51.5074, -0.1278, 48.8566, 2.3522)).toBeGreaterThan(330);
    expect(haversineKm(51.5074, -0.1278, 48.8566, 2.3522)).toBeLessThan(350);
  });
  it('handles antimeridian bboxes', () => {
    const b = parseBBox('170,-10,-170,10')!;
    expect(bboxContains(b, 0, 179)).toBe(true);
    expect(bboxContains(b, 0, -179)).toBe(true);
    expect(bboxContains(b, 0, 0)).toBe(false);
    expect(parseBBox('1,2,3')).toBeNull();
  });
  it('simplifies lines and polygons', () => {
    const line: [number, number][] = [
      [0, 0],
      [1, 0.001],
      [2, 0],
      [3, 0.001],
      [4, 0],
    ];
    expect(simplifyLine(line, 0.01)).toEqual([
      [0, 0],
      [4, 0],
    ]);
    const square = {
      type: 'Polygon' as const,
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
          [0, 0],
        ] as [number, number][],
      ],
    };
    expect(simplifyPolygonGeometry(square, 0.01)?.coordinates[0]).toHaveLength(5);
    expect(simplifyPolygonGeometry(square, 5)).toBeNull();
  });
});

describe('gazetteer', () => {
  it('resolves countries, aliases, regions and cities', () => {
    expect(findCountry('Germany')?.iso3).toBe('DEU');
    expect(findCountry('UK')?.iso3).toBe('GBR');
    expect(findCountry('FRA')?.name).toBe('France');
    expect(resolvePlace('South China Sea')?.kind).toBe('region');
    expect(resolvePlace('Taiwan')?.kind).toBe('country');
    expect(resolvePlace('Berlin')?.kind).toBe('place');
    expect(resolvePlace('Atlantis')).toBeNull();
  });
});

describe('text', () => {
  it('tokenizes with stemming and stopword removal', () => {
    expect(tokenize('The drills continued near Taiwan')).toEqual([
      'drill',
      'continued',
      'near',
      'taiwan',
    ]);
  });
  it('scores near-duplicate headlines highly', () => {
    expect(
      headlineSimilarity('Quake hits Sulawesi, dozens hurt', 'Quake hits Sulawesi; dozens hurt'),
    ).toBeGreaterThan(0.8);
    expect(headlineSimilarity('Quake hits Sulawesi', 'Stocks rally in Tokyo')).toBeLessThan(0.2);
  });
  it('computes cosine similarity', () => {
    expect(cosine(termVector(['a', 'b']), termVector(['a', 'b']))).toBeCloseTo(1);
    expect(cosine(termVector(['a']), termVector(['b']))).toBe(0);
  });
  it('sanitizes HTML and control characters', () => {
    expect(sanitizeText('<b>Hi</b>\u0000 there&amp;')).toBe('Hi there&');
    expect(sanitizeText(42)).toBe('');
  });
  it('extracts years', () => {
    expect(extractYears('Germany between 1933 and 1945')).toEqual([1933, 1945]);
    expect(extractYears('the 1810s')).toEqual([1810]);
  });
});

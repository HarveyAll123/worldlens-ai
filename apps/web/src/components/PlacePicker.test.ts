import { describe, expect, it } from 'vitest';
import { placeCard } from './PlacePicker';

const view = { width: 1200, height: 800, safeBottom: 128 };
const card = { width: 300, height: 240 };

describe('placing the same-place chooser', () => {
  it('opens to the right of the marker, level with it', () => {
    expect(placeCard({ x: 400, y: 300 }, card, view, [])).toEqual({ left: 422, top: 272 });
  });

  it('flips to the left near the right edge or next to another panel', () => {
    expect(placeCard({ x: 1000, y: 300 }, card, view, []).left).toBe(1000 - 22 - 300);
    const panel = { left: 780, right: 1200, top: 0, bottom: 800 }; // the detail card
    expect(placeCard({ x: 600, y: 300 }, card, view, [panel]).left).toBe(600 - 22 - 300);
  });

  it('stays below the top bar and above the timeline', () => {
    expect(placeCard({ x: 400, y: 40 }, card, view, []).top).toBe(78);
    expect(placeCard({ x: 400, y: 780 }, card, view, []).top).toBe(800 - 128 - 240);
  });

  it('keeps on screen when neither side fits (phones)', () => {
    const phone = { width: 380, height: 760, safeBottom: 196 };
    const at = placeCard({ x: 200, y: 300 }, { width: 356, height: 240 }, phone, []);
    expect(at.left).toBe(12);
  });
});

import { describe, expect, it } from 'vitest';
import { RESOLUTIONS, trackSpan, utcMs, type Resolution } from '@worldlens/shared';
import { labelWidth, timelineTicks, type Tick } from './timelineTicks';

const NOW = utcMs(2026, 10, 30, 10, 30);

function layout(view: Resolution, centerMs: number, trackPx: number) {
  const { startMs, endMs } = trackSpan(centerMs, view, NOW);
  const ticks = timelineTicks(startMs, endMs, view, trackPx);
  const x = (t: Tick) => ((t.ms - startMs) / (endMs - startMs)) * trackPx;
  return { ticks, x, labels: ticks.map((t) => t.label) };
}

describe('timeline ticks', () => {
  // A Fold cover screen's track is ~260 px (~180 px beside "Before 1800"); desktops ~800.
  const widths = [180, 260, 400, 620, 800, 1700];
  const centers = [NOW, utcMs(1944, 6, 6), utcMs(1815, 6, 18)];

  it('keeps labels apart and on the track at every zoom and width', () => {
    for (const view of RESOLUTIONS)
      for (const center of centers)
        for (const width of widths) {
          const { ticks, x } = layout(view, center, width);
          const where = `${view} @ ${width}px around ${new Date(center).toISOString()}`;
          expect(ticks.length, where).toBeGreaterThan(0);
          expect(ticks.length, where).toBeLessThanOrEqual(10);
          ticks.forEach((t, i) => {
            expect(x(t) + labelWidth(t.label), where).toBeLessThanOrEqual(width);
            const next = ticks[i + 1];
            if (next) expect(x(next) - x(t), where).toBeGreaterThanOrEqual(labelWidth(t.label));
          });
        }
  });

  it('labels hours as times on round hours, with the date at midnight', () => {
    // Phones used to get "27 Oct 2026, 23:00 UTC" three times over in 260 px.
    const phone = layout('hour', NOW, 260);
    expect(phone.labels.slice(0, 2)).toEqual(['28 Oct', '29 Oct']);
    for (const t of phone.ticks) expect(new Date(t.ms).getUTCHours()).toBe(0);
    const desktop = layout('hour', NOW, 800);
    expect(desktop.labels).toEqual(['12:00', '28 Oct', '12:00', '29 Oct', '12:00', '30 Oct']);
    for (const t of desktop.ticks) expect(new Date(t.ms).getUTCHours() % 12).toBe(0);
  });

  it('puts days on the 1st and 15th on phones (the year at New Year), Mondays on desktops', () => {
    // 19 Nov 1939 – 20 Jan 1940; "15 Jan" would run past the end of the track.
    const phone = layout('day', utcMs(1939, 12, 20), 260);
    expect(phone.labels).toEqual(['1 Dec', '15 Dec', '1940']);
    const desktop = layout('day', utcMs(1939, 12, 20), 800);
    for (const t of desktop.ticks) expect(new Date(t.ms).getUTCDay()).toBe(1);
    expect(desktop.labels[0]).toBe('20 Nov 1939');
  });

  it('keeps the overview on round years', () => {
    expect(layout('century', NOW, 180).labels).toEqual(['1800', '1850', '1900', '1950']);
    expect(layout('century', NOW, 680).labels).toEqual([
      '1800',
      '1840',
      '1880',
      '1920',
      '1960',
      '2000',
    ]);
  });

  it('shortens month labels on phones and keeps the year at January', () => {
    expect(layout('month', utcMs(1940, 1, 1), 800).labels[0]).toMatch(/^[A-Z][a-z]{2} 19\d\d$/);
    for (const label of layout('month', utcMs(1940, 1, 1), 260).labels)
      expect(label).toMatch(/^([A-Z][a-z]{2}|[A-Z][a-z]{2} \d{4}|\d{4})$/);
  });
});

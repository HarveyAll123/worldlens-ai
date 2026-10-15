import { describe, expect, it } from 'vitest';
import { parseDateInput } from './dateInput';

describe('typed timeline dates', () => {
  it('reads ISO-style dates at the precision typed', () => {
    expect(parseDateInput('1941')).toEqual({ ms: Date.UTC(1941, 0, 1), resolution: 'year' });
    expect(parseDateInput('1941-06')).toEqual({ ms: Date.UTC(1941, 5, 1), resolution: 'month' });
    expect(parseDateInput(' 1941-06-22 ')).toEqual({
      ms: Date.UTC(1941, 5, 22),
      resolution: 'day',
    });
  });
  it('reads written dates', () => {
    expect(parseDateInput('22 June 1941')).toEqual({
      ms: Date.UTC(1941, 5, 22),
      resolution: 'day',
    });
    expect(parseDateInput('Sept 1939')).toEqual({ ms: Date.UTC(1939, 8, 1), resolution: 'month' });
  });
  it('rejects what it cannot read', () => {
    expect(parseDateInput('soon')).toBeNull();
    expect(parseDateInput('1941-13')).toBeNull();
    expect(parseDateInput('32 June 1941')).toBeNull();
  });
});

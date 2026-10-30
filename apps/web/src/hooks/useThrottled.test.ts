import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useThrottled } from './useThrottled';

describe('useThrottled', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('follows a value while it keeps changing (a dragged timeline)', () => {
    const { result, rerender } = renderHook(({ v }) => useThrottled(v, 150), {
      initialProps: { v: 1800 },
    });
    // A new year every 100 ms for a second: a debounce would still show 1800 throughout.
    const seen: number[] = [];
    for (let year = 1801; year <= 1810; year++) {
      rerender({ v: year });
      act(() => vi.advanceTimersByTime(100));
      seen.push(result.current);
    }
    expect(new Set(seen).size).toBeGreaterThanOrEqual(5);
    // Never more than one step (100 ms) behind.
    seen.forEach((v, i) => expect(v).toBeGreaterThanOrEqual(1800 + i));
    act(() => vi.advanceTimersByTime(150));
    expect(result.current).toBe(1810);
  });

  it('passes the first change through and lands only the last of a burst', () => {
    const { result, rerender } = renderHook(({ v }) => useThrottled(v, 150), {
      initialProps: { v: 0 },
    });
    rerender({ v: 1 });
    act(() => vi.advanceTimersByTime(0));
    expect(result.current).toBe(1);
    for (const v of [2, 3, 4]) {
      rerender({ v });
      act(() => vi.advanceTimersByTime(40));
    }
    expect(result.current).toBe(1); // 120 ms after the last update
    act(() => vi.advanceTimersByTime(30));
    expect(result.current).toBe(4);
  });

  it('goes quiet once the value stops changing', () => {
    let renders = 0;
    const { rerender } = renderHook(
      ({ v }) => {
        renders++;
        return useThrottled(v, 150);
      },
      { initialProps: { v: 'live' } },
    );
    rerender({ v: '1815' });
    act(() => vi.advanceTimersByTime(1000));
    const settled = renders;
    act(() => vi.advanceTimersByTime(5000));
    expect(renders).toBe(settled);
    expect(vi.getTimerCount()).toBe(0);
  });
});

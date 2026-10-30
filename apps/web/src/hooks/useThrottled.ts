import { useEffect, useRef, useState } from 'react';

/**
 * `value`, updated at most once every `ms`. The first change after a quiet spell passes
 * straight through and the last one always lands, so a value that keeps changing (the timeline
 * being dragged) is still followed while it changes — a debounce waits until it stops.
 * Pass a stable value (a primitive or a memoized object): a new object on every render counts
 * as a change every time.
 */
export function useThrottled<T>(value: T, ms: number): T {
  const [current, setCurrent] = useState(value);
  const lastSet = useRef(0);
  useEffect(() => {
    if (Object.is(value, current)) return;
    const t = setTimeout(
      () => {
        lastSet.current = Date.now();
        setCurrent(value);
      },
      Math.max(0, lastSet.current + ms - Date.now()),
    );
    return () => clearTimeout(t);
  }, [value, current, ms]);
  return current;
}

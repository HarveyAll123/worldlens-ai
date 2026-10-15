import type { Resolution } from '@worldlens/shared';

const MONTH_NAMES = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
];

/**
 * "1941", "1941-06", "1941-06-22", "June 1941", "22 June 1941" → time and the resolution the
 * text is precise to. null when it cannot be read.
 */
export function parseDateInput(text: string): { ms: number; resolution: Resolution } | null {
  const t = text.trim().toLowerCase();
  let m = /^(\d{4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?$/.exec(t);
  if (m) {
    const [y, mo, d] = [Number(m[1]), m[2] ? Number(m[2]) : 1, m[3] ? Number(m[3]) : 1];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return { ms: Date.UTC(y, mo - 1, d), resolution: m[3] ? 'day' : m[2] ? 'month' : 'year' };
  }
  m = /^(?:(\d{1,2})\s+)?([a-z]+)\.?\s+(\d{4})$/.exec(t);
  if (m) {
    const mo = MONTH_NAMES.indexOf(m[2]!.slice(0, 3));
    if (mo < 0) return null;
    const d = m[1] ? Number(m[1]) : 1;
    if (d < 1 || d > 31) return null;
    return { ms: Date.UTC(Number(m[3]), mo, d), resolution: m[1] ? 'day' : 'month' };
  }
  return null;
}

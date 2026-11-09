/**
 * Account rules shared by the web app (live hints) and the API (which enforces them).
 */

/**
 * Long passwords are strong; shorter ones need numbers and symbols. No uppercase is ever
 * required. Letters only: 12+ characters; with a number or a symbol: 8+; with both: 6+.
 */
export const PASSWORD_MIN_LENGTH = 6;
export const PASSWORD_MAX_LENGTH = 128;
/** "aaaaaaaa" or "abababab" is long enough but guessable at once. */
const PASSWORD_MIN_DISTINCT = 4;

const hasNumber = (p: string) => /\p{N}/u.test(p);
/** Spaces do not count: "river stone lantern" is letters only. */
const hasSymbol = (p: string) => /[^\p{L}\p{N}\s]/u.test(p);

/** The length a password needs, from what it mixes in. */
export function passwordMinLength(password: string): number {
  const number = hasNumber(password);
  const symbol = hasSymbol(password);
  return number && symbol ? 6 : number || symbol ? 8 : 12;
}

/** "12345678", "abcdefgh", "87654321": one straight run up or down. */
function isSequence(password: string): boolean {
  const codes = [...password.toLowerCase()].map((c) => c.codePointAt(0)!);
  if (codes.length < 4) return false;
  const step = codes[1]! - codes[0]!;
  return Math.abs(step) === 1 && codes.every((c, i) => i === 0 || c - codes[i - 1]! === step);
}

/** Why a password is refused, in words for the person typing it; null when it is fine. */
export function passwordProblem(password: string): string | null {
  const min = passwordMinLength(password);
  if (password.length < min)
    return min === 12
      ? 'Use at least 12 characters, or 8 with a number or a symbol, or 6 with both.'
      : min === 8
        ? 'Use at least 8 characters, or 6 with both a number and a symbol.'
        : 'Use at least 6 characters.';
  if (password.length > PASSWORD_MAX_LENGTH)
    return `Use at most ${PASSWORD_MAX_LENGTH} characters.`;
  if (new Set(password.toLowerCase()).size < PASSWORD_MIN_DISTINCT)
    return 'Too repetitive: mix in more different characters.';
  if (isSequence(password)) return 'Too easy to guess: avoid runs like 12345678 or abcdefgh.';
  return null;
}

/** 3–30 lowercase letters, digits, "_" or "."; starts and ends with a letter or digit. */
export const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9_.]{1,28}[a-z0-9])$/;
export const normalizeUsername = (u: string) => u.trim().toLowerCase();

/** Why a username is refused (format only; whether it is free is the API's to say). */
export function usernameProblem(username: string): string | null {
  const u = normalizeUsername(username);
  if (u.length < 3) return 'Use at least 3 characters.';
  if (u.length > 30) return 'Use at most 30 characters.';
  if (!USERNAME_PATTERN.test(u))
    return 'Letters, numbers, "_" and "." only, starting and ending with a letter or number.';
  return null;
}

/** A username changes at most once in this period. */
export const USERNAME_COOLDOWN_MS = 30 * 24 * 3_600_000;

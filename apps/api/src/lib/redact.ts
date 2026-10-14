/**
 * Removes credentials from text before it is stored in provider health (public via
 * GET /api/health) or written to logs. Driver errors can embed a whole connection string,
 * e.g. the Neon driver's "not a valid URL (connection string: …)".
 */
const DB_URL = /\b(?:postgres|postgresql):\/\/\S+/gi;
const URL_CREDENTIALS = /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@'"]*@/gi;

export function redactSecrets(text: string): string {
  return text.replace(DB_URL, '[connection string]').replace(URL_CREDENTIALS, '$1[redacted]@');
}

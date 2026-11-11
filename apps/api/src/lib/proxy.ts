/**
 * The free deployment (deploy/free): the backend on Render is reached only through the site's
 * Cloudflare Worker, which forwards /api/* with a shared secret and the visitor's address.
 * Requests without the secret are refused (the host's health check aside), so nobody can call
 * the backend directly — or forge their address to get round the rate limits.
 */
export const PROXY_SECRET_HEADER = 'x-worldlens-proxy';
export const CLIENT_IP_HEADER = 'x-worldlens-client-ip';

/** Equal strings, compared without leaking how much of them matched. */
function sameSecret(given: string, secret: string): boolean {
  let diff = given.length ^ secret.length;
  for (let i = 0; i < secret.length; i++)
    diff |= (given.charCodeAt(i % Math.max(1, given.length)) || 0) ^ secret.charCodeAt(i);
  return diff === 0 && secret.length > 0;
}

/**
 * The request as the API should see it: from the Worker, with the visitor's address as
 * X-Forwarded-For (and nothing a visitor could have set); anything else, refused.
 */
export function viaTrustedProxy(request: Request, secret: string): Request | Response {
  const given = request.headers.get(PROXY_SECRET_HEADER) ?? '';
  if (!sameSecret(given, secret)) {
    if (new URL(request.url).pathname === '/api/health') return request;
    return Response.json(
      { error: 'FORBIDDEN', message: 'Open WorldLens at its own address.' },
      { status: 403 },
    );
  }
  const headers = new Headers(request.headers);
  const ip = headers.get(CLIENT_IP_HEADER)?.trim();
  for (const h of [PROXY_SECRET_HEADER, CLIENT_IP_HEADER, 'cf-connecting-ip', 'x-real-ip'])
    headers.delete(h);
  if (ip) headers.set('x-forwarded-for', ip);
  else headers.delete('x-forwarded-for');
  return new Request(request, { headers });
}

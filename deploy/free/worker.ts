/**
 * The free deployment's front door (Cloudflare Workers Free, no card): Cloudflare serves the
 * website's files itself (free and unlimited), and this Worker only forwards /api/* to the
 * backend on Render, adding a shared secret and the visitor's address. One address for both,
 * so sign-in cookies work. It just passes bytes through — far under the Free plan's 10 ms of
 * CPU per request (waiting for Render does not count).
 */
interface Env {
  /** The backend, e.g. https://worldlens-api.onrender.com (wrangler.toml [vars]). */
  API_ORIGIN: string;
  /** Shared with the backend (wrangler secret put PROXY_SECRET; Render: PROXY_SECRET). */
  PROXY_SECRET: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const target = new URL(url.pathname + url.search, env.API_ORIGIN);
    const headers = new Headers(request.headers);
    headers.delete('host');
    headers.set('x-worldlens-proxy', env.PROXY_SECRET);
    // Set by Cloudflare for every visitor; the backend uses it for its rate limits.
    headers.set('x-worldlens-client-ip', request.headers.get('cf-connecting-ip') ?? '');
    const res = await fetch(target, {
      method: request.method,
      headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? null : request.body,
      // Sign-in redirects (Google) go back to the browser as they are.
      redirect: 'manual',
    });
    return new Response(res.body, res);
  },
};

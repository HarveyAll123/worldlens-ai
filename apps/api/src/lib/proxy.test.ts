import { describe, expect, it } from 'vitest';
import { CLIENT_IP_HEADER, PROXY_SECRET_HEADER, viaTrustedProxy } from './proxy';

const SECRET = 'a-long-shared-secret-0123456789';

describe('the backend behind the site’s Worker (free deployment)', () => {
  it('takes requests from the Worker, with the visitor’s address and nothing forged', async () => {
    const req = new Request('https://api.example/api/me/history', {
      method: 'POST',
      headers: {
        [PROXY_SECRET_HEADER]: SECRET,
        [CLIENT_IP_HEADER]: '203.0.113.7',
        'cf-connecting-ip': '198.51.100.1',
        'x-forwarded-for': '10.0.0.1, 10.0.0.2',
        cookie: 'worldlens.session_token=abc',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ kind: 'search' }),
    });
    const out = viaTrustedProxy(req, SECRET) as Request;
    expect(out).toBeInstanceOf(Request);
    expect(out.headers.get('x-forwarded-for')).toBe('203.0.113.7');
    expect(out.headers.get('cf-connecting-ip')).toBeNull();
    expect(out.headers.get(PROXY_SECRET_HEADER)).toBeNull();
    expect(out.headers.get('cookie')).toBe('worldlens.session_token=abc');
    expect(await out.json()).toEqual({ kind: 'search' });
  });

  it('refuses anyone else (a wrong or missing secret) — but the host’s health check', () => {
    for (const secret of [undefined, '', 'wrong', `${SECRET}x`, SECRET.slice(0, -1)]) {
      const req = new Request('https://api.example/api/ai/chat', {
        headers: secret === undefined ? {} : { [PROXY_SECRET_HEADER]: secret },
      });
      const out = viaTrustedProxy(req, SECRET);
      expect(out).toBeInstanceOf(Response);
      expect((out as Response).status).toBe(403);
    }
    const health = new Request('https://api.example/api/health');
    expect(viaTrustedProxy(health, SECRET)).toBe(health);
  });
});

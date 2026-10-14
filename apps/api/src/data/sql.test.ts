import { afterEach, describe, expect, it } from 'vitest';
import { neonConfig } from '@neondatabase/serverless';
import { classifyDatabaseUrl, neonHttpClient, sqlState } from './sql';

const NEON_URL = 'postgresql://worldlens_app:pw@ep-test-123.us-east-2.aws.neon.tech/neondb';

describe('classifyDatabaseUrl', () => {
  it('rejects URLs whose host the Neon driver would read differently', () => {
    // The driver re-parses as http:, where "\" ends the authority → it would connect to evil.example.
    expect(
      classifyDatabaseUrl('postgresql://u:p@evil.example\\@ep-x.us-east-2.aws.neon.tech/db').kind,
    ).toBe('invalid');
    expect(classifyDatabaseUrl('postgresql://u:a\\b@ep-x.us-east-2.aws.neon.tech/db').kind).toBe(
      'invalid',
    );
    expect(classifyDatabaseUrl(`${NEON_URL}?sslmode=require&channel_binding=require`).kind).toBe(
      'neon',
    );
    expect(classifyDatabaseUrl('postgresql://u:p%2Fq@ep-x.us-east-2.aws.neon.tech/db').kind).toBe(
      'neon',
    );
  });
});

describe('sqlState', () => {
  it('accepts SQLSTATE codes but not errno codes', () => {
    expect(sqlState({ code: '42P01' })).toBe('42P01');
    expect(sqlState({ code: 'XX000' })).toBe('XX000');
    expect(sqlState({ code: 'EPIPE' })).toBeNull();
    expect(sqlState({ code: 'ECONNRESET' })).toBeNull();
    expect(sqlState(new Error('x'))).toBeNull();
  });
});

describe('neonHttpClient retries', () => {
  const original = neonConfig.fetchFunction;
  afterEach(() => {
    neonConfig.fetchFunction = original;
  });
  function stub(respond: (init: RequestInit) => Promise<Response>) {
    let calls = 0;
    neonConfig.fetchFunction = (_url: string, init: RequestInit) => {
      calls++;
      return respond(init);
    };
    return () => calls;
  }
  const ok = () =>
    new Response(
      JSON.stringify({
        fields: [{ name: 'n', dataTypeID: 23 }],
        rows: [['1']], // the driver requests array-mode rows with text values
        command: 'SELECT',
        rowCount: 1,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );

  it('retries an idempotent read once after a network failure', async () => {
    let first = true;
    const calls = stub(async () => {
      if (first) {
        first = false;
        throw new TypeError('fetch failed');
      }
      return ok();
    });
    const rows = await neonHttpClient(NEON_URL).query('select 1 as n', [], { idempotent: true });
    expect(rows).toEqual([{ n: 1 }]);
    expect(calls()).toBe(2);
  });

  it('does not retry SQL errors, writes or timeouts', async () => {
    let calls = stub(
      async () =>
        new Response(JSON.stringify({ message: 'relation "x" does not exist', code: '42P01' }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        }),
    );
    await expect(
      neonHttpClient(NEON_URL).query('select * from x', [], { idempotent: true }),
    ).rejects.toThrow();
    expect(calls()).toBe(1);

    calls = stub(async () => {
      throw new TypeError('fetch failed');
    });
    await expect(neonHttpClient(NEON_URL).query('insert into x values (1)')).rejects.toThrow();
    expect(calls()).toBe(1);

    // Never answers; aborts when the client's timeout signal fires, as fetch does.
    calls = stub(
      (init) =>
        new Promise<Response>((_, reject) =>
          init.signal?.addEventListener('abort', () => reject(init.signal?.reason)),
        ),
    );
    await expect(
      neonHttpClient(NEON_URL, 50).query('select 1', [], { idempotent: true }),
    ).rejects.toThrow();
    expect(calls()).toBe(1);
  });
});

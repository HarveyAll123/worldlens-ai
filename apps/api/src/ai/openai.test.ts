import { describe, expect, it, vi } from 'vitest';
import { OpenAiCompatibleProvider, retryAfterMs } from './openai';
import { AiUnavailableError, type AiTurnRequest } from './provider';

function provider(fetchImpl: typeof fetch): OpenAiCompatibleProvider {
  return new OpenAiCompatibleProvider({
    apiKey: 'test-key',
    baseUrl: 'https://example.test/v1/',
    models: { fast: 'fast-model', strong: 'strong-model' },
    fetchImpl,
    providerName: 'test',
    sessionId: 'session-123',
  });
}

const request: AiTurnRequest = {
  tier: 'strong',
  purpose: 'agent',
  system: 'be helpful',
  messages: [{ role: 'user', content: 'hello' }],
  tools: [
    {
      name: 'search_events',
      description: 'search',
      input_schema: { type: 'object', properties: { q: { type: 'string' } } },
    },
  ],
  maxTokens: 100,
};

describe('OpenAiCompatibleProvider', () => {
  it('sends an OpenAI chat-completions request and parses a text answer', async () => {
    const fetchImpl = vi.fn(async (_url: string | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        model: string;
        messages: Array<{ role: string; content: string }>;
        tools: Array<{ function: { name: string } }>;
        max_tokens: number;
      };
      expect(body.model).toBe('strong-model');
      expect(body.messages[0]).toEqual({ role: 'system', content: 'be helpful' });
      expect(body.messages[1]).toEqual({ role: 'user', content: 'hello' });
      expect(body.tools[0]?.function.name).toBe('search_events');
      expect(body.max_tokens).toBe(100);
      const headers = init?.headers as Record<string, string>;
      expect(headers.authorization).toBe('Bearer test-key');
      expect(headers['x-opencode-session']).toBe('session-123');
      return new Response(
        JSON.stringify({
          model: 'strong-model',
          choices: [{ finish_reason: 'stop', message: { content: 'hi there' } }],
          usage: { prompt_tokens: 5, completion_tokens: 3 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as unknown as typeof fetch;

    const res = await provider(fetchImpl).turn(request);
    expect(res.content).toEqual([{ type: 'text', text: 'hi there' }]);
    expect(res.stopReason).toBe('end_turn');
    expect(res.usage).toEqual({
      input_tokens: 5,
      output_tokens: 3,
      cache_read_input_tokens: null,
    });
  });

  it('maps tool calls to tool_use blocks and keeps round-trip tool results', async () => {
    let sent: unknown;
    const fetchImpl = vi.fn(async (_url: string | Request, init?: RequestInit) => {
      sent = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: 'tool_calls',
              message: {
                content: null,
                tool_calls: [
                  {
                    id: 'call_1',
                    type: 'function',
                    function: { name: 'search_events', arguments: '{"q":"waterloo"}' },
                  },
                ],
              },
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as unknown as typeof fetch;

    const res = await provider(fetchImpl).turn(request);
    expect(res.stopReason).toBe('tool_use');
    expect(res.content).toEqual([
      { type: 'tool_use', id: 'call_1', name: 'search_events', input: { q: 'waterloo' } },
    ]);

    await provider(fetchImpl).turn({
      ...request,
      messages: [
        { role: 'user', content: 'hello' },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Looking it up' },
            { type: 'tool_use', id: 'call_1', name: 'search_events', input: { q: 'waterloo' } },
          ],
        },
        {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'call_1', content: '{"ok":true}' }],
        },
      ],
    });
    const messages = (sent as { messages: Array<Record<string, unknown>> }).messages;
    expect(messages).toContainEqual({
      role: 'assistant',
      content: 'Looking it up',
      tool_calls: [
        {
          id: 'call_1',
          type: 'function',
          function: { name: 'search_events', arguments: '{"q":"waterloo"}' },
        },
      ],
    });
    expect(messages).toContainEqual({
      role: 'tool',
      tool_call_id: 'call_1',
      content: '{"ok":true}',
    });
  });

  it('marks truncated answers as max_tokens', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ finish_reason: 'length', message: { content: 'partial' } }],
            usage: { prompt_tokens: 1, completion_tokens: 1 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    ) as unknown as typeof fetch;
    expect((await provider(fetchImpl).turn(request)).stopReason).toBe('max_tokens');
  });

  it('reports auth failures as AiUnavailableError (no secret leaks)', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('nope', { status: 401 }),
    ) as unknown as typeof fetch;
    await expect(provider(fetchImpl).turn(request)).rejects.toBeInstanceOf(AiUnavailableError);
    await expect(provider(fetchImpl).turn(request)).rejects.toThrow('authentication failed');
  });
});

describe('Gemini through the OpenAI-compatible endpoint', () => {
  const ok = (message: Record<string, unknown>) =>
    new Response(JSON.stringify({ choices: [{ message, finish_reason: 'stop' }] }), {
      status: 200,
    });
  const modelOf = (init?: RequestInit) =>
    (JSON.parse(String(init?.body)) as { model: string }).model;

  it('falls back to the next model when one is busy, and starts there next time', async () => {
    const tried: string[] = [];
    const fetchImpl = vi.fn(async (_url: string | Request, init?: RequestInit) => {
      tried.push(modelOf(init));
      return modelOf(init) === 'busy-model'
        ? new Response('{"error":{"code":503,"status":"UNAVAILABLE"}}', { status: 503 })
        : ok({ content: 'hi' });
    });
    const p = new OpenAiCompatibleProvider({
      apiKey: 'k',
      baseUrl: 'https://example.test/v1',
      models: { fast: 'busy-model', strong: 'busy-model' },
      fallbacks: ['spare-model'],
      fetchImpl,
    });
    expect((await p.turn(request)).model).toBe('spare-model');
    await p.turn(request);
    expect(tried).toEqual(['busy-model', 'spare-model', 'spare-model']);
  });

  it('skips a model whose free daily quota is spent until Google says it resets', () => {
    const body =
      '{"error":{"code":429,"details":[{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"68508s"}]}}';
    expect(retryAfterMs(body)).toBe(68_508_000);
    expect(retryAfterMs('{"error":{"code":429}}')).toBe(60_000);
  });

  it('sends reasoning_effort and echoes thought signatures back with tool calls', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const signature = { google: { thought_signature: 'sig-123' } };
    const fetchImpl = vi.fn(async (_url: string | Request, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return ok({
        content: null,
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'search_events', arguments: '{"q":"Berlin"}' },
            extra_content: signature,
          },
        ],
      });
    });
    const p = new OpenAiCompatibleProvider({
      apiKey: 'k',
      baseUrl: 'https://example.test/v1',
      models: { fast: 'm', strong: 'm' },
      reasoningEffort: { strong: 'low' },
      fetchImpl,
    });
    const first = await p.turn(request);
    expect(bodies[0]!.reasoning_effort).toBe('low');
    // The agent sends the assistant turn back with the tool results.
    await p.turn({
      ...request,
      messages: [
        ...request.messages,
        { role: 'assistant', content: first.content },
        {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'call_1', content: '[]' }],
        },
      ],
    });
    const sent = (bodies[1]!.messages as Array<{ role: string; tool_calls?: unknown[] }>).find(
      (m) => m.role === 'assistant',
    );
    expect(sent?.tool_calls?.[0]).toMatchObject({ id: 'call_1', extra_content: signature });
  });
});

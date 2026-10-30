import { describe, expect, it, vi } from 'vitest';
import { OpenAiCompatibleProvider } from './openai';
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

/**
 * OpenAI-compatible implementation of the AI provider (Chat Completions API).
 *
 * Used for gateways such as OpenCode Go (https://opencode.ai/inference/go/openai/v1) or any
 * other OpenAI-compatible endpoint. The rest of the app speaks the Anthropic message shape, so
 * this adapter translates messages, tools and responses in both directions; the agent loop and
 * the framing code stay provider-agnostic.
 */
import type Anthropic from '@anthropic-ai/sdk';
import type { FetchLike } from '../lib/http';
import {
  AiUnavailableError,
  type AiProvider,
  type AiTurnRequest,
  type AiTurnResponse,
  type ModelTier,
  type ToolDefinition,
} from './provider';

interface OpenAiToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
  /**
   * Provider data to echo back unchanged with the call — Gemini 3 puts its "thought signature"
   * here (`extra_content.google.thought_signature`) and rejects a follow-up turn without it.
   */
  extra_content?: unknown;
}

interface OpenAiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: OpenAiToolCall[];
  tool_call_id?: string;
}

interface OpenAiResponse {
  model?: string;
  choices?: Array<{
    finish_reason?: string | null;
    message?: { content?: string | null; tool_calls?: OpenAiToolCall[] };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
  };
}

type ContentBlock = { type: string; [key: string]: unknown };

/** Flattens Anthropic text blocks (or a plain string) into a single string. */
function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((block) =>
      block && typeof block === 'object' && (block as ContentBlock).type === 'text'
        ? String((block as ContentBlock).text ?? '')
        : '',
    )
    .join('');
}

/** Anthropic-shaped conversation → OpenAI chat messages. */
function toOpenAiMessages(messages: Anthropic.Beta.BetaMessageParam[]): OpenAiMessage[] {
  const out: OpenAiMessage[] = [];
  for (const message of messages) {
    if (typeof message.content === 'string') {
      out.push({ role: message.role, content: message.content });
      continue;
    }
    const blocks = message.content as unknown as ContentBlock[];
    if (message.role === 'assistant') {
      const texts: string[] = [];
      const toolCalls: OpenAiToolCall[] = [];
      for (const block of blocks) {
        if (block.type === 'text') texts.push(String(block.text ?? ''));
        else if (block.type === 'tool_use')
          toolCalls.push({
            id: String(block.id),
            type: 'function',
            function: { name: String(block.name), arguments: JSON.stringify(block.input ?? {}) },
            ...(block.extra_content !== undefined ? { extra_content: block.extra_content } : {}),
          });
      }
      out.push({
        role: 'assistant',
        content: texts.join('\n') || null,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      });
    } else {
      const texts: string[] = [];
      for (const block of blocks) {
        if (block.type === 'text') texts.push(String(block.text ?? ''));
        else if (block.type === 'tool_result')
          out.push({
            role: 'tool',
            tool_call_id: String(block.tool_use_id),
            content: textOf(block.content),
          });
      }
      if (texts.length > 0) out.push({ role: 'user', content: texts.join('\n') });
    }
  }
  return out;
}

function toOpenAiTool(tool: ToolDefinition) {
  return {
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema,
    },
  };
}

function parseArguments(raw: string | undefined): unknown {
  if (!raw || !raw.trim()) return {};
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return {};
  }
}

export interface OpenAiCompatibleOptions {
  apiKey: string;
  /** Base URL *including* the version segment, e.g. `https://opencode.ai/inference/go/openai/v1`. */
  baseUrl: string;
  models: { fast: string; strong: string };
  fetchImpl?: FetchLike;
  /** Provider label shown by `/api/health` (e.g. `opencode`). */
  providerName?: string;
  /** Sent as `x-opencode-session`; OpenCode Go requires it to route requests efficiently. */
  sessionId?: string;
  /**
   * Models tried in order when the tier's model is busy, rate-limited, unknown or too slow
   * (HTTP 429/5xx/404, timeout). A model that failed sits out for COOLDOWN_MS, so the next
   * turns go straight to one that answers.
   */
  fallbacks?: string[];
  /** Sent as `reasoning_effort` (Gemini maps it to its thinking level): less is faster. */
  reasoningEffort?: Partial<Record<ModelTier, 'none' | 'minimal' | 'low' | 'medium' | 'high'>>;
  /** Per-attempt timeout; default 90 s. */
  timeoutMs?: number;
}

const COOLDOWN_MS = 60_000;

/** A failure worth trying another model for (not the caller's fault, not the key's). */
class RetryableError extends Error {
  constructor(
    message: string,
    /** How long the model should sit out; COOLDOWN_MS unless the provider says longer. */
    readonly coolMs = COOLDOWN_MS,
  ) {
    super(message);
  }
}

/**
 * How long a rate-limited model should rest. Gemini answers 429 with a `retryDelay` ("68508s"
 * when a free-tier *daily* quota is spent — 20 requests a day for the Flash models), so a
 * spent model is skipped until its quota resets instead of costing a request every minute.
 */
export function retryAfterMs(body: string): number {
  const m = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(body);
  const seconds = m ? Number(m[1]) : 0;
  return Math.min(24 * 3_600_000, Math.max(COOLDOWN_MS, seconds * 1000));
}

export class OpenAiCompatibleProvider implements AiProvider {
  readonly name: string;
  readonly available = true;

  constructor(private readonly opts: OpenAiCompatibleOptions) {
    this.name = opts.providerName ?? 'openai-compatible';
  }

  modelFor(tier: ModelTier): string {
    return this.opts.models[tier];
  }

  /** Models that recently failed → when they may be tried first again. */
  private readonly coolingUntil = new Map<string, number>();

  /** The tier's model, then the fallbacks; ones cooling down after a failure go last. */
  private candidates(tier: ModelTier): string[] {
    const all = [...new Set([this.modelFor(tier), ...(this.opts.fallbacks ?? [])])];
    const now = Date.now();
    const cool = (m: string) => (this.coolingUntil.get(m) ?? 0) > now;
    return [...all.filter((m) => !cool(m)), ...all.filter(cool)];
  }

  async turn(req: AiTurnRequest): Promise<AiTurnResponse> {
    let last: Error = new AiUnavailableError('AI provider unreachable');
    for (const model of this.candidates(req.tier)) {
      try {
        return await this.turnWith(model, req);
      } catch (err) {
        if (!(err instanceof RetryableError)) throw err;
        this.coolingUntil.set(model, Date.now() + err.coolMs);
        last = new AiUnavailableError(err.message);
      }
    }
    throw last;
  }

  private async turnWith(model: string, req: AiTurnRequest): Promise<AiTurnResponse> {
    const url = `${this.opts.baseUrl.replace(/\/+$/, '')}/chat/completions`;
    const effort = this.opts.reasoningEffort?.[req.tier];
    const body = {
      model,
      messages: [
        { role: 'system' as const, content: req.system },
        ...toOpenAiMessages(req.messages),
      ],
      max_tokens: req.maxTokens,
      ...(effort ? { reasoning_effort: effort } : {}),
      ...(req.tools?.length
        ? { tools: req.tools.map(toOpenAiTool), tool_choice: 'auto' as const }
        : {}),
    };
    const fetchImpl: FetchLike = this.opts.fetchImpl ?? ((input, init) => fetch(input, init));

    let res: Response;
    try {
      res = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.opts.apiKey}`,
          ...(this.opts.sessionId ? { 'x-opencode-session': this.opts.sessionId } : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.opts.timeoutMs ?? 90_000),
      });
    } catch {
      throw new RetryableError('AI provider unreachable or too slow');
    }

    if (res.status === 401 || res.status === 403)
      throw new AiUnavailableError('AI provider authentication failed');
    if (res.status === 429)
      throw new RetryableError(
        'AI provider rate limit reached',
        retryAfterMs(await res.text().catch(() => '')),
      );
    if (res.status === 404 || res.status >= 500)
      throw new RetryableError(`AI provider busy or model unavailable (${res.status})`);
    if (!res.ok) throw new AiUnavailableError(`AI provider error (${res.status})`);

    let data: OpenAiResponse;
    try {
      data = (await res.json()) as OpenAiResponse;
    } catch {
      throw new AiUnavailableError('AI provider returned an invalid response');
    }

    const choice = data.choices?.[0];
    if (!choice) throw new RetryableError('AI provider returned no answer');
    const message = choice?.message;
    const content: Anthropic.Beta.BetaContentBlock[] = [];
    const text = message?.content?.trim();
    if (text) content.push({ type: 'text', text } as Anthropic.Beta.BetaContentBlock);
    for (const [i, call] of (message?.tool_calls ?? []).entries()) {
      content.push({
        type: 'tool_use',
        // Some compatible endpoints omit ids; tool results must still pair with their call.
        id: call.id || `call_${Date.now().toString(36)}_${i}`,
        name: call.function.name,
        input: parseArguments(call.function.arguments),
        ...(call.extra_content !== undefined ? { extra_content: call.extra_content } : {}),
      } as Anthropic.Beta.BetaContentBlock);
    }

    const hasToolCalls = (message?.tool_calls?.length ?? 0) > 0;
    const stopReason = hasToolCalls
      ? 'tool_use'
      : choice?.finish_reason === 'length'
        ? 'max_tokens'
        : 'end_turn';

    const usage = data.usage ?? {};
    return {
      model: data.model ?? model,
      content,
      stopReason,
      usage: {
        input_tokens: usage.prompt_tokens ?? 0,
        output_tokens: usage.completion_tokens ?? 0,
        cache_read_input_tokens: usage.prompt_tokens_details?.cached_tokens ?? null,
      },
    };
  }
}

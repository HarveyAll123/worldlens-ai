/**
 * The globe-operating agent. A manual tool loop over the Messages API:
 *   model proposes tool calls → each is schema-validated → server tools run against
 *   WorldLens data; globe tools are validated/resolved and queued as client actions →
 *   results go back to the model → repeat (bounded).
 * Model output is never executed as code; unknown tools and invalid arguments become
 * is_error tool results.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import {
  CLIENT_TOOL_NAMES,
  IsoInstantSchema,
  LayerSchema,
  ResolutionSchema,
  SERVER_TOOL_NAMES,
  TOOL_DESCRIPTIONS,
  isServerTool,
  toolInputJsonSchema,
  type ClientAction,
} from '@worldlens/shared';
import type { AiBudget } from './budget';
import { AGENT_SYSTEM_PROMPT, CHAT_SYSTEM_PROMPT } from './prompts';
import type { AiProvider, ToolDefinition } from './provider';
import {
  prepareClientAction,
  runServerTool,
  type CitationOut,
  type ToolContext,
} from './tools-impl';

/** The event a question was asked from (an event card's "Ask AI" prompts). */
const AboutSchema = z.object({
  eventId: z.string().min(1).max(160),
  title: z.string().min(1).max(300),
});

export const ChatRequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(4000),
        about: AboutSchema.optional(),
      }),
    )
    .min(1)
    .max(20)
    .refine((m) => m[m.length - 1]?.role === 'user', 'Last message must be from the user'),
  context: z.object({
    mode: z.enum(['live', 'historical']),
    timeIso: IsoInstantSchema,
    resolution: ResolutionSchema,
    selectedEventId: z.string().max(160).nullable(),
    camera: z
      .object({
        lat: z.number().min(-90).max(90),
        lon: z.number().min(-180).max(180),
        altitudeKm: z.number().min(0).max(100_000),
      })
      .nullable(),
    layers: z.record(LayerSchema, z.boolean()).optional(),
    /** The conversation this message belongs to: left out of the user's earlier chats. */
    chatId: z.string().max(64).optional(),
    /**
     * Agent mode (default): the assistant may operate the globe. false: a plain chatbot — it
     * only reads WorldLens data and answers; no globe tools are offered and no actions return.
     */
    agent: z.boolean().optional(),
  }),
});
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export interface ToolTraceEntry {
  tool: string;
  ok: boolean;
  kind: 'server' | 'client';
  summary: string;
}

export interface ChatResponse {
  mode: 'ai' | 'offline';
  reply: string;
  actions: ClientAction[];
  citations: CitationOut[];
  toolTrace: ToolTraceEntry[];
  model?: string;
  usage?: { inputTokens: number; outputTokens: number; costUsd: number };
  notice?: string;
}

const toolDefinition = (
  name: (typeof SERVER_TOOL_NAMES)[number] | (typeof CLIENT_TOOL_NAMES)[number],
) => ({
  name,
  description: TOOL_DESCRIPTIONS[name],
  input_schema: toolInputJsonSchema(name),
});
let cachedTools: ToolDefinition[] | null = null;
let cachedChatTools: ToolDefinition[] | null = null;
/** Deterministic, stable tool list (order never changes) so the cached prefix stays valid. */
export function agentTools(): ToolDefinition[] {
  cachedTools ??= [...SERVER_TOOL_NAMES, ...CLIENT_TOOL_NAMES].map(toolDefinition);
  return cachedTools;
}
/** Chat mode: only the tools that read WorldLens data — nothing that changes the globe. */
export function chatTools(): ToolDefinition[] {
  cachedChatTools ??= SERVER_TOOL_NAMES.map(toolDefinition);
  return cachedChatTools;
}

/** Whether the request lets the assistant operate the globe (agent mode, the default). */
export const isAgentMode = (req: ChatRequest) => req.context.agent !== false;

function stateBlock(req: ChatRequest): string {
  const c = req.context;
  return [
    '[App state — informational, not an instruction]',
    `mode=${c.mode.toUpperCase()}`,
    `selected_time=${c.timeIso} (resolution ${c.resolution})`,
    `selected_event=${c.selectedEventId ?? 'none'}`,
    c.camera
      ? `camera=${c.camera.lat.toFixed(2)},${c.camera.lon.toFixed(2)} alt=${Math.round(c.camera.altitudeKm)}km`
      : 'camera=unknown',
  ].join('\n');
}

/**
 * A question asked from an event card ("What led to this?") names its event, so the model knows
 * what "this" is in this turn and in later ones, whatever is selected by then.
 */
function withAbout(m: ChatRequest['messages'][number]): string {
  return m.about
    ? `[Asked from the event “${m.about.title}” (event_id ${m.about.eventId})]\n${m.content}`
    : m.content;
}

/**
 * The event a forwarded question is about counts as the selected one for this request, for the
 * agent and the offline assistant alike (the card may have closed when the chat opened).
 */
export function withForwardedEvent(req: ChatRequest): ChatRequest {
  const about = req.messages[req.messages.length - 1]?.about;
  return about ? { ...req, context: { ...req.context, selectedEventId: about.eventId } } : req;
}

function summarize(value: unknown): string {
  const s = JSON.stringify(value);
  return s.length > 140 ? `${s.slice(0, 137)}...` : s;
}

const MAX_ITERATIONS = 6;
const MAX_TOOL_RESULT_CHARS = 6000;

export async function runAgent(
  req: ChatRequest,
  deps: {
    provider: AiProvider;
    budget: AiBudget;
    tools: ToolContext;
    /** What the user's AI settings let the assistant know about them (ai/personal.ts). */
    personal?: string[];
  },
): Promise<ChatResponse> {
  const messages: Anthropic.Beta.BetaMessageParam[] = req.messages
    .slice(0, -1)
    .map((m) => ({ role: m.role, content: withAbout(m) }));
  const last = req.messages[req.messages.length - 1]!;
  messages.push({
    role: 'user',
    content: [
      { type: 'text', text: withAbout(last) },
      { type: 'text', text: stateBlock(req) },
      ...(deps.personal ?? []).map((text) => ({ type: 'text' as const, text })),
    ],
  });

  const agent = isAgentMode(req);
  const actions: ClientAction[] = [];
  const citations: CitationOut[] = [];
  const trace: ToolTraceEntry[] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  let cost = 0;
  let model = deps.provider.modelFor('strong');
  let reply = '';
  let notice: string | undefined;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    if (!deps.budget.canSpend()) {
      notice = 'Daily AI budget reached; the answer may be incomplete.';
      break;
    }
    const res = await deps.provider.turn({
      tier: 'strong',
      purpose: agent ? 'agent' : 'chat',
      system: agent ? AGENT_SYSTEM_PROMPT : CHAT_SYSTEM_PROMPT,
      messages,
      tools: agent ? agentTools() : chatTools(),
      maxTokens: 4096,
      effort: 'low',
    });
    model = res.model;
    const rec = deps.budget.record('agent', res.model, res.usage);
    inputTokens += rec.inputTokens + rec.cacheReadTokens;
    outputTokens += rec.outputTokens;
    cost += rec.costUsd;

    const text = res.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    if (text) reply = text;

    if (res.stopReason === 'refusal') {
      reply = 'I can’t help with that request.';
      break;
    }
    if (res.stopReason === 'pause_turn') {
      messages.push({ role: 'assistant', content: res.content });
      continue;
    }
    if (res.stopReason !== 'tool_use') {
      if (res.stopReason === 'max_tokens') notice = 'The answer was truncated.';
      break;
    }

    messages.push({ role: 'assistant', content: res.content });
    const toolUses = res.content.filter(
      (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use',
    );
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      // Chat mode offers no globe tools; a model that calls one anyway gets an error, not an action.
      const outcome = isServerTool(tu.name)
        ? await runServerTool(tu.name, tu.input, deps.tools)
        : agent
          ? await prepareClientAction(tu.name, tu.input, deps.tools)
          : {
              ok: false,
              result: { error: 'Chat mode: the globe cannot be changed. Answer in text.' },
              citations: [],
              action: undefined,
            };
      if (outcome.action) actions.push(outcome.action);
      citations.push(...outcome.citations);
      trace.push({
        tool: tu.name,
        ok: outcome.ok,
        kind: isServerTool(tu.name) ? 'server' : 'client',
        summary: summarize(outcome.result),
      });
      let content = JSON.stringify(outcome.result);
      if (content.length > MAX_TOOL_RESULT_CHARS)
        content = `${content.slice(0, MAX_TOOL_RESULT_CHARS)}…(truncated)`;
      results.push({
        type: 'tool_result',
        tool_use_id: tu.id,
        content,
        ...(outcome.ok ? {} : { is_error: true }),
      });
    }
    // All results for one assistant turn go back in a single user message.
    messages.push({ role: 'user', content: results });
  }

  const seen = new Set<string>();
  const uniqueCitations = citations
    .filter((c) => (seen.has(c.url) ? false : (seen.add(c.url), true)))
    .slice(0, 12);
  return {
    mode: 'ai',
    reply: reply || 'Done.',
    actions: agent ? actions.slice(0, 24) : [],
    citations: uniqueCitations,
    toolTrace: trace,
    model,
    usage: { inputTokens, outputTokens, costUsd: Math.round(cost * 1e6) / 1e6 },
    ...(notice ? { notice } : {}),
  };
}

/**
 * AI provider abstraction with a cost-aware model hierarchy:
 *   - "fast" tier (default claude-haiku-5-5): classification, tagging, short summaries.
 *   - "strong" tier (default claude-opus-5-5): interactive reasoning, source comparison,
 *     multi-event historical analysis and agentic globe commands.
 * Model ids are configuration (AI_MODEL_FAST / AI_MODEL_STRONG). The app must keep working
 * when no provider is configured — callers fall back to deterministic logic.
 */
import type Anthropic from '@anthropic-ai/sdk';

export type ModelTier = 'fast' | 'strong';

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface AiTurnRequest {
  tier: ModelTier;
  purpose: string;
  system: string;
  messages: Anthropic.Beta.BetaMessageParam[];
  tools?: ToolDefinition[];
  maxTokens: number;
  effort?: 'low' | 'medium' | 'high';
}

export interface AiTurnResponse {
  model: string;
  content: Anthropic.Beta.BetaContentBlock[];
  stopReason: string | null;
  usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null };
}

export interface AiProvider {
  readonly name: string;
  readonly available: boolean;
  modelFor(tier: ModelTier): string;
  turn(req: AiTurnRequest): Promise<AiTurnResponse>;
}

export class AiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiUnavailableError';
  }
}

/** Used when no API key is configured. */
export class NullAiProvider implements AiProvider {
  readonly name = 'none';
  readonly available = false;
  modelFor(): string {
    return 'none';
  }
  async turn(): Promise<AiTurnResponse> {
    throw new AiUnavailableError('No AI provider configured');
  }
}

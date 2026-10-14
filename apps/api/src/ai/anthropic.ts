/**
 * Anthropic implementation of the AI provider (official @anthropic-ai/sdk, Messages API).
 *
 *  - Thinking: Claude Opus 5.5 always thinks adaptively; depth is set with output_config.effort.
 *  - Refusals: strong-tier requests opt into server-side fallbacks ("default" routing,
 *    beta server-side-fallback-2026-07-01). Haiku has no server-side fallback, so none is sent.
 *  - Caching: top-level automatic prompt caching on the stable prefix (tools + system prompt).
 */
import Anthropic from '@anthropic-ai/sdk';
import { AiUnavailableError, type AiProvider, type AiTurnRequest, type AiTurnResponse, type ModelTier } from './provider';

const FALLBACK_CAPABLE = /^claude-(opus-5|opus-5-5|fable-5-1|sonnet-5-5)$/;

export class AnthropicProvider implements AiProvider {
  readonly name = 'anthropic';
  readonly available = true;
  private client: Anthropic;

  constructor(
    apiKey: string,
    private readonly models: { fast: string; strong: string },
  ) {
    this.client = new Anthropic({ apiKey, maxRetries: 1, timeout: 90_000 });
  }

  modelFor(tier: ModelTier): string {
    return this.models[tier];
  }

  async turn(req: AiTurnRequest): Promise<AiTurnResponse> {
    const model = this.modelFor(req.tier);
    const useFallbacks = FALLBACK_CAPABLE.test(model);
    try {
      const res = await this.client.beta.messages.create({
        model,
        max_tokens: req.maxTokens,
        system: req.system,
        messages: req.messages,
        cache_control: { type: 'ephemeral' },
        output_config: { effort: req.effort ?? (req.tier === 'strong' ? 'medium' : 'low') },
        ...(req.tools?.length ? { tools: req.tools as Anthropic.Beta.BetaToolUnion[], tool_choice: { type: 'auto' } } : {}),
        ...(useFallbacks ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {}),
      });
      return {
        model: res.model,
        content: res.content,
        stopReason: res.stop_reason,
        usage: res.usage,
      };
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) throw new AiUnavailableError('AI provider authentication failed');
      if (err instanceof Anthropic.RateLimitError) throw new AiUnavailableError('AI provider rate limit reached');
      if (err instanceof Anthropic.APIConnectionError) throw new AiUnavailableError('AI provider unreachable');
      if (err instanceof Anthropic.APIError) throw new AiUnavailableError(`AI provider error (${err.status ?? 'unknown'})`);
      throw err;
    }
  }
}

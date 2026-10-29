/**
 * AI cost control: per-model pricing, usage accounting, a daily spend cap and an output cache.
 * Prices are USD per million tokens (Anthropic first-party list prices, Oct 2026). Unknown
 * models are charged at the most expensive known rate so the budget errs on the safe side.
 */
import { TtlCache } from '../lib/cache';

interface Price {
  input: number;
  output: number;
  cacheRead: number;
}

const PRICES: Record<string, Price> = {
  'claude-fable-5-1': { input: 10, output: 50, cacheRead: 1 },
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-opus-5': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-sonnet-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01 },
  // OpenCode Go / OpenCode console list price (Oct 2026).
  'deepseek-v4.1-flash': { input: 0.15, output: 0.6, cacheRead: 0.003 },
};
const FALLBACK_PRICE: Price = { input: 10, output: 50, cacheRead: 1 };

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

export function costUsd(model: string, u: Usage): number {
  const p = PRICES[model] ?? FALLBACK_PRICE;
  const cacheRead = u.cache_read_input_tokens ?? 0;
  const cacheWrite = u.cache_creation_input_tokens ?? 0;
  return (
    (u.input_tokens * p.input +
      cacheWrite * p.input * 1.25 +
      cacheRead * p.cacheRead +
      u.output_tokens * p.output) /
    1_000_000
  );
}

export interface UsageRecord {
  at: string;
  purpose: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  costUsd: number;
}

export class AiBudget {
  private day = '';
  private spent = 0;
  private calls = 0;
  readonly recent: UsageRecord[] = [];
  readonly outputs = new TtlCache<unknown>(300);

  constructor(
    private readonly dailyBudgetUsd: number,
    private readonly now: () => number = Date.now,
  ) {}

  private roll(): void {
    const d = new Date(this.now()).toISOString().slice(0, 10);
    if (d !== this.day) {
      this.day = d;
      this.spent = 0;
      this.calls = 0;
    }
  }

  /** True if there is budget left for another call today. */
  canSpend(): boolean {
    this.roll();
    return this.spent < this.dailyBudgetUsd;
  }

  record(purpose: string, model: string, u: Usage): UsageRecord {
    this.roll();
    const rec: UsageRecord = {
      at: new Date(this.now()).toISOString(),
      purpose,
      model,
      inputTokens: u.input_tokens,
      outputTokens: u.output_tokens,
      cacheReadTokens: u.cache_read_input_tokens ?? 0,
      costUsd: Math.round(costUsd(model, u) * 1e6) / 1e6,
    };
    this.spent += rec.costUsd;
    this.calls += 1;
    this.recent.push(rec);
    if (this.recent.length > 200) this.recent.shift();
    return rec;
  }

  status() {
    this.roll();
    return {
      day: this.day,
      spentUsd: Math.round(this.spent * 10_000) / 10_000,
      budgetUsd: this.dailyBudgetUsd,
      calls: this.calls,
      exhausted: this.spent >= this.dailyBudgetUsd,
    };
  }
}

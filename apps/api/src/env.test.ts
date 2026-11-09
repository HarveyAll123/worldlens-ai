import { describe, expect, it } from 'vitest';
import { DEFAULT_MODELS, GEMINI_OPENAI_BASE_URL, loadConfig } from './env';

describe('AI provider configuration', () => {
  it('uses Gemini when its key is set, with free fast models by default', () => {
    const ai = loadConfig({ GEMINI_API_KEY: 'g-key' }).ai;
    expect(ai).toMatchObject({
      provider: 'gemini',
      apiKey: 'g-key',
      baseUrl: GEMINI_OPENAI_BASE_URL,
      strongModel: DEFAULT_MODELS.gemini.strong,
      fastModel: DEFAULT_MODELS.gemini.fast,
    });
  });

  it('ignores model names left over from another provider', () => {
    const ai = loadConfig({
      GEMINI_API_KEY: 'g-key',
      AI_MODEL_STRONG: 'claude-opus-5-5',
      AI_MODEL_FAST: 'gemini-3.6-flash',
    }).ai;
    expect(ai.strongModel).toBe(DEFAULT_MODELS.gemini.strong);
    expect(ai.fastModel).toBe('gemini-3.6-flash');
  });

  it('keeps an explicit provider choice and the old defaults', () => {
    expect(
      loadConfig({ GEMINI_API_KEY: 'g', ANTHROPIC_API_KEY: 'a', AI_PROVIDER: 'anthropic' }).ai,
    ).toMatchObject({ provider: 'anthropic', apiKey: 'a', strongModel: 'claude-opus-5-5' });
    expect(loadConfig({ ANTHROPIC_API_KEY: 'a' }).ai.provider).toBe('anthropic');
    expect(loadConfig({}).ai.apiKey).toBeNull();
  });
});

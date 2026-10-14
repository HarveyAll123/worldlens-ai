import { describe, expect, it } from 'vitest';
import { PoliticalRatingSchema, SafeUrlSchema, UNRATED } from '../schemas';
import {
  CLIENT_TOOL_NAMES,
  SERVER_TOOL_NAMES,
  parseClientAction,
  toolInputJsonSchema,
} from '../tools';

describe('political ratings', () => {
  it('accepts UNRATED without methodology', () => {
    expect(PoliticalRatingSchema.safeParse(UNRATED).success).toBe(true);
  });
  it('rejects a rating without methodology, source, confidence and review date', () => {
    const r = PoliticalRatingSchema.safeParse({ ...UNRATED, value: 'LEFT' });
    expect(r.success).toBe(false);
  });
});

describe('safe URLs', () => {
  it('accepts https and rejects javascript:/data:/http', () => {
    expect(SafeUrlSchema.safeParse('https://en.wikipedia.org/wiki/X').success).toBe(true);
    expect(SafeUrlSchema.safeParse('javascript:alert(1)').success).toBe(false);
    expect(SafeUrlSchema.safeParse('data:text/html,hi').success).toBe(false);
    expect(SafeUrlSchema.safeParse('http://example.com').success).toBe(false);
  });
});

describe('AI tool layer', () => {
  it('validates client actions strictly', () => {
    expect(parseClientAction({ tool: 'fly_to', args: { lat: 10, lon: 20 } }).ok).toBe(true);
    expect(parseClientAction({ tool: 'fly_to', args: { lat: 100, lon: 20 } }).ok).toBe(false);
    expect(parseClientAction({ tool: 'fly_to', args: {} }).ok).toBe(false);
    expect(parseClientAction({ tool: 'set_time', args: { date: '1815-06-18' } }).ok).toBe(true);
    expect(parseClientAction({ tool: 'set_time', args: { date: 'yesterday' } }).ok).toBe(false);
    expect(parseClientAction({ tool: 'eval', args: { code: '1' } }).ok).toBe(false);
    expect(parseClientAction({ tool: 'capture_payment', args: {} }).ok).toBe(false);
    expect(parseClientAction('nonsense').ok).toBe(false);
  });

  it('exposes no tool that can move money', () => {
    const all = [...SERVER_TOOL_NAMES, ...CLIENT_TOOL_NAMES].join(' ');
    expect(all).not.toMatch(/capture|pay_order|create_order|approve/);
  });

  it('produces JSON Schema for every tool', () => {
    for (const name of [...SERVER_TOOL_NAMES, ...CLIENT_TOOL_NAMES]) {
      const s = toolInputJsonSchema(name);
      expect(s.type).toBe('object');
    }
  });
});

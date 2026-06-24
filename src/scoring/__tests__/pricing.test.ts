import { describe, it, expect } from 'vitest';
import { resolvePricing, estimateCostUsd, DEFAULT_PRICING } from '../models/pricing';
import { estimateTokens } from '../models/tokenizer';

describe('resolvePricing', () => {
  it('matches a family by substring', () => {
    expect(resolvePricing('claude-opus-4.6').family).toBe('claude-opus');
    expect(resolvePricing('claude-sonnet-4.6').family).toBe('claude-sonnet');
    expect(resolvePricing('gpt-5.3-codex').family).toBe('gpt');
  });

  it('falls back to default for unknown / missing models', () => {
    expect(resolvePricing('mystery-model')).toEqual(DEFAULT_PRICING);
    expect(resolvePricing(undefined)).toEqual(DEFAULT_PRICING);
  });
});

describe('estimateCostUsd', () => {
  it('uses the real per-million prices from models.json', () => {
    // 1M input + 1M output on claude-opus = $0.50 + $2.50 = $3.00
    expect(estimateCostUsd(1_000_000, 1_000_000, 'claude-opus-4.6')).toBeCloseTo(3.0, 6);
    // sonnet is cheaper
    expect(estimateCostUsd(1_000_000, 0, 'claude-sonnet-4.6')).toBeCloseTo(0.3, 6);
  });

  it('is zero for zero tokens', () => {
    expect(estimateCostUsd(0, 0, 'claude-opus')).toBe(0);
  });
});

describe('estimateTokens', () => {
  it('approximates ~4 chars per token and handles empties', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens(undefined)).toBe(0);
    expect(estimateTokens(null)).toBe(0);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('a'.repeat(400))).toBe(100);
  });
});

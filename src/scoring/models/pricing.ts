/**
 * Per-model pricing derived from the rates Copilot ships in `models.json` under
 * `billing.token_prices.default`. Those values are AI CREDITS (AICs) per 1M tokens
 * with `batch_size: 1000000` — e.g. Opus is 500 in / 2500 out AICs/1M. The built-in
 * table below is a FALLBACK for unknown models; real turns use the model's own
 * on-disk rates (ModelInfo.inputPer1M/outputPer1M), which is the objective basis.
 *
 * NOTE: the legacy `*UsdPerMillion` fields are kept for the health intensity signal
 * only; they are a relative proxy, not real dollars. Credits are the real unit.
 */
import type { ModelInfo } from '@tokentama/shared-types';

export interface ModelPricing {
  family: string;
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
  cachedUsdPerMillion?: number;
}

/** Keyed by a lowercase family prefix matched as a substring of the model name. */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  'claude-opus': {
    family: 'claude-opus',
    inputUsdPerMillion: 0.5,
    outputUsdPerMillion: 2.5,
    cachedUsdPerMillion: 0.05,
  },
  'claude-sonnet': {
    family: 'claude-sonnet',
    inputUsdPerMillion: 0.3,
    outputUsdPerMillion: 1.5,
    cachedUsdPerMillion: 0.03,
  },
  gpt: {
    family: 'gpt',
    inputUsdPerMillion: 0.4,
    outputUsdPerMillion: 1.6,
  },
};

export const DEFAULT_PRICING: ModelPricing = {
  family: 'default',
  inputUsdPerMillion: 0.5,
  outputUsdPerMillion: 2.5,
  cachedUsdPerMillion: 0.05,
};

export function resolvePricing(modelFamily?: string): ModelPricing {
  if (!modelFamily) return DEFAULT_PRICING;
  const key = modelFamily.toLowerCase();
  for (const prefix of Object.keys(MODEL_PRICING)) {
    if (key.includes(prefix)) return MODEL_PRICING[prefix] as ModelPricing;
  }
  return DEFAULT_PRICING;
}

/** USD cost for a turn, rounded to micro-dollars (6 dp). */
export function estimateCostUsd(
  inputTokens: number,
  outputTokens: number,
  modelFamily?: string,
): number {
  const p = resolvePricing(modelFamily);
  const cost =
    (inputTokens * p.inputUsdPerMillion + outputTokens * p.outputUsdPerMillion) / 1_000_000;
  return Math.round(cost * 1e6) / 1e6;
}

/**
 * Estimated Copilot CREDITS (AICs) for a turn — the objective cost unit. Uses the
 * model's REAL per-1M rates from models.json when available, falling back to the
 * built-in table (whose values ≈ credits/1000, so ×1000 recovers the credit rate).
 */
export function estimateCredits(
  inputTokens: number,
  outputTokens: number,
  model?: ModelInfo,
): number {
  const p = resolvePricing(model?.family);
  const inputPerM = model?.inputPer1M ?? p.inputUsdPerMillion * 1000;
  const outputPerM = model?.outputPer1M ?? p.outputUsdPerMillion * 1000;
  const credits = (inputTokens * inputPerM + outputTokens * outputPerM) / 1_000_000;
  return Math.round(credits * 1000) / 1000;
}

/** Convert credits (AICs) to a USD estimate at the given (subjective) rate. */
export function creditsToUsd(credits: number, usdPerCredit: number): number {
  if (!(usdPerCredit > 0)) return 0;
  return Math.round(credits * usdPerCredit * 1e6) / 1e6;
}

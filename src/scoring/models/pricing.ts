/**
 * Per-model pricing derived from the rates Copilot ships in `models.json`.
 * In that file prices are encoded as USD×1000 per 1M tokens (e.g. 500 → $0.50/1M).
 * We store the resolved USD-per-1M values here.
 */
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

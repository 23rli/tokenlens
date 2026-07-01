import type { ScorePromptResponse } from '@tokentama/shared-types';

/**
 * Session health model.
 *
 * Health is a depletable resource for the current Copilot session (reset to full
 * when a new session begins — see TamaStore). Each scored prompt's efficiency then
 * chips away at it:
 *  - Efficient prompts (high overall score) heal a little.
 *  - Wasteful prompts chip hard, and the chip is amplified by the prompt's
 *    cost/carbon intensity — i.e. tokens × model price. The same waste on an
 *    expensive/heavy model hurts the pet far more than on a cheap one.
 *
 * Healing is deliberately much smaller than damage (asymmetric) so that a run of
 * wasteful prompts visibly drains the pet and can't be instantly "averaged out".
 */
export interface HealthModelConfig {
  /** HP a fully-wasteful prompt removes at baseline (intensity = 1) before scaling. */
  maxDamage: number;
  /** HP restored by an efficient prompt. Kept small (heal << damage). */
  healRate: number;
  /** Overall score at/above which a prompt heals instead of damaging. */
  healThreshold: number;
  /** Cost (USD) treated as "normal" for a single prompt; intensity scales vs this. */
  baselineCostUsd: number;
  /** Upper bound on the cost/carbon intensity multiplier. */
  maxIntensity: number;
}

export const DEFAULT_HEALTH_CONFIG: HealthModelConfig = {
  maxDamage: 22,
  healRate: 2,
  healThreshold: 80,
  baselineCostUsd: 0.01,
  maxIntensity: 3,
};

export interface HealthUpdate {
  /** Next health value, clamped to 0..100. */
  health: number;
  /** Change applied to health this prompt (positive heal / negative chip). */
  delta: number;
  /** Per-prompt efficiency (0..100): waste, scaled down by cost/carbon intensity. */
  efficiency: number;
  /** Cost/carbon intensity multiplier (1..maxIntensity) used to amplify damage. */
  intensity: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Cost/carbon intensity multiplier for a prompt. Cheap prompts sit near 1;
 * expensive prompts (many tokens and/or a pricey model) climb toward maxIntensity.
 */
export function intensityFromCost(
  estimatedCostUsd: number,
  cfg: HealthModelConfig = DEFAULT_HEALTH_CONFIG,
): number {
  if (!(estimatedCostUsd > 0) || !(cfg.baselineCostUsd > 0)) return 1;
  const ratio = estimatedCostUsd / cfg.baselineCostUsd;
  return clamp(ratio, 1, cfg.maxIntensity);
}

/**
 * Compute the next session health from the previous value and a scored prompt.
 * Pure and deterministic.
 */
export function computeHealthUpdate(
  prevHealth: number,
  resp: Pick<ScorePromptResponse, 'overallScore' | 'tokens'>,
  cfg: HealthModelConfig = DEFAULT_HEALTH_CONFIG,
): HealthUpdate {
  const overall = clamp(resp.overallScore, 0, 100);
  const inefficiency = (100 - overall) / 100; // 0..1
  const intensity = intensityFromCost(resp.tokens?.estimatedCostUsd ?? 0, cfg);

  // A single "one number" that folds prompt quality, token volume and model choice
  // together — the wasteful part of the prompt is amplified by its intensity.
  const efficiency = clamp(100 - inefficiency * 100 * intensity, 0, 100);

  const delta =
    overall >= cfg.healThreshold ? cfg.healRate : -(cfg.maxDamage * inefficiency * intensity);

  const health = clamp(prevHealth + delta, 0, 100);
  return { health, delta, efficiency, intensity };
}

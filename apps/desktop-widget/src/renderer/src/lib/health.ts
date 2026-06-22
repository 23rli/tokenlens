import { scoreToState } from '@ecoprompt/scoring-engine';

/** Weight on the newest score; `health = (1 - α)·prev + α·score` with α = 0.7. */
export const HEALTH_ALPHA = 0.7;

/** Exponential moving average so the ecosystem reacts smoothly, then clamps 0..100. */
export function emaHealth(prev: number, score: number): number {
  const next = (1 - HEALTH_ALPHA) * prev + HEALTH_ALPHA * score;
  return Math.max(0, Math.min(100, next));
}

export { scoreToState };

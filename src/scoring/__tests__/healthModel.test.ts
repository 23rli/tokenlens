import { describe, it, expect } from 'vitest';
import {
  computeHealthUpdate,
  intensityFromCost,
  DEFAULT_HEALTH_CONFIG,
} from '../transitions/healthModel';

const cfg = DEFAULT_HEALTH_CONFIG;

function resp(overallScore: number, estimatedCostUsd = 0) {
  return { overallScore, tokens: { inputTokens: 0, outputTokens: 0, estimatedCostUsd, estimated: true } };
}

describe('healthModel — intensityFromCost', () => {
  it('is 1 for a cheap/baseline prompt and clamps at maxIntensity for expensive ones', () => {
    expect(intensityFromCost(0)).toBe(1);
    expect(intensityFromCost(cfg.baselineCostUsd)).toBe(1);
    expect(intensityFromCost(cfg.baselineCostUsd * 1000)).toBe(cfg.maxIntensity);
  });
});

describe('healthModel — computeHealthUpdate', () => {
  it('heals only a little for an efficient prompt', () => {
    const u = computeHealthUpdate(50, resp(95));
    expect(u.delta).toBe(cfg.healRate);
    expect(u.health).toBe(50 + cfg.healRate);
  });

  it('chips hard for a wasteful prompt (heal << damage)', () => {
    const heal = computeHealthUpdate(50, resp(95));
    const damage = computeHealthUpdate(50, resp(10));
    expect(damage.delta).toBeLessThan(0);
    expect(Math.abs(damage.delta)).toBeGreaterThan(Math.abs(heal.delta) * 3);
  });

  it('amplifies damage on an expensive/heavy model vs a cheap one', () => {
    const cheap = computeHealthUpdate(80, resp(20, cfg.baselineCostUsd));
    const pricey = computeHealthUpdate(80, resp(20, cfg.baselineCostUsd * 5));
    expect(Math.abs(pricey.delta)).toBeGreaterThan(Math.abs(cheap.delta));
    expect(pricey.health).toBeLessThan(cheap.health);
  });

  it('folds cost/carbon intensity into the per-prompt efficiency number', () => {
    const cheap = computeHealthUpdate(100, resp(40, cfg.baselineCostUsd));
    const pricey = computeHealthUpdate(100, resp(40, cfg.baselineCostUsd * 4));
    expect(pricey.efficiency).toBeLessThan(cheap.efficiency);
  });

  it('clamps health to the 0..100 range', () => {
    expect(computeHealthUpdate(2, resp(0, cfg.baselineCostUsd * 100)).health).toBe(0);
    expect(computeHealthUpdate(99, resp(100)).health).toBeLessThanOrEqual(100);
  });

  it('is deterministic', () => {
    const a = computeHealthUpdate(60, resp(30, 0.02));
    const b = computeHealthUpdate(60, resp(30, 0.02));
    expect(a).toEqual(b);
  });
});

import { describe, it, expect } from 'vitest';
import { emaHealth, scoreToState } from '../health';

describe('health EMA', () => {
  it('blends previous health and new score with a 0.3 / 0.7 split', () => {
    expect(emaHealth(80, 30)).toBeCloseTo(0.3 * 80 + 0.7 * 30, 5);
    expect(emaHealth(50, 50)).toBe(50);
  });

  it('clamps to the 0..100 range', () => {
    expect(emaHealth(0, -50)).toBe(0);
    expect(emaHealth(100, 200)).toBe(100);
  });

  it('reacts toward the new score but does not overshoot it in one step', () => {
    const next = emaHealth(90, 10);
    expect(next).toBeLessThan(90);
    expect(next).toBeGreaterThan(10);
  });

  it('maps low health to a worse pet state than high health', () => {
    expect(scoreToState(90)).toBe('thriving');
    expect(['critical', 'collapse', 'dead']).toContain(scoreToState(15));
  });
});

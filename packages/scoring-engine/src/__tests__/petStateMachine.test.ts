import { describe, it, expect } from 'vitest';
import { scoreToState, transition, stateRank } from '../transitions/petStateMachine';

describe('scoreToState', () => {
  it('maps score bands to world states (design doc §9.2)', () => {
    expect(scoreToState(100)).toBe('thriving');
    expect(scoreToState(80)).toBe('thriving');
    expect(scoreToState(79)).toBe('healthy');
    expect(scoreToState(60)).toBe('healthy');
    expect(scoreToState(59)).toBe('concerned');
    expect(scoreToState(40)).toBe('concerned');
    expect(scoreToState(39)).toBe('critical');
    expect(scoreToState(20)).toBe('critical');
    expect(scoreToState(19)).toBe('collapse');
    expect(scoreToState(1)).toBe('collapse');
    expect(scoreToState(0)).toBe('dead');
  });

  it('clamps out-of-range scores', () => {
    expect(scoreToState(150)).toBe('thriving');
    expect(scoreToState(-10)).toBe('dead');
  });
});

describe('transition', () => {
  it('reports recovery when moving to a healthier state', () => {
    const t = transition(30, 85);
    expect(t.previousState).toBe('critical');
    expect(t.state).toBe('thriving');
    expect(t.direction).toBe('up');
    expect(t.delta).toBe(55);
    expect(t.recovered).toBe(true);
  });

  it('reports decline without recovery', () => {
    const t = transition(90, 50);
    expect(t.direction).toBe('down');
    expect(t.recovered).toBe(false);
    expect(t.delta).toBe(-40);
  });

  it('handles a missing previous score', () => {
    const t = transition(null, 70);
    expect(t.previousState).toBeNull();
    expect(t.delta).toBe(0);
    expect(t.recovered).toBe(false);
  });
});

describe('stateRank', () => {
  it('ranks healthiest lowest and dead highest', () => {
    expect(stateRank('thriving')).toBe(0);
    expect(stateRank('thriving')).toBeLessThan(stateRank('concerned'));
    expect(stateRank('dead')).toBeGreaterThan(stateRank('collapse'));
  });
});

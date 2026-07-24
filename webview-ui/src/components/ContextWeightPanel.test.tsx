import { describe, expect, it } from 'vitest';
import { contextTurnRange } from './ContextWeightPanel';

describe('contextTurnRange', () => {
  it('retains the true range for a bounded context series', () => {
    expect(contextTurnRange(500, 501, 1_000)).toEqual({
      start: 501,
      end: 1_000,
      total: 1_000,
    });
  });

  it('uses ordinary one-based numbering for an unbounded short series', () => {
    expect(contextTurnRange(3)).toEqual({ start: 1, end: 3, total: 3 });
  });

  it('infers the retained tail for older payloads that only provide a total', () => {
    expect(contextTurnRange(8, undefined, 14)).toEqual({
      start: 7,
      end: 14,
      total: 14,
    });
  });
});
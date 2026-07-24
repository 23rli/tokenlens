import { describe, expect, it } from 'vitest';
import type { ForecastView } from '../../../src/webview/contract';
import { buildHistoryRows } from './HistoryView';

describe('buildHistoryRows', () => {
  it('preserves original turn numbers in a bounded history payload', () => {
    const rows = buildHistoryRows({
      allTurns: [
        { turn: 501, prompt: 'First retained', tokens: 1_000, metered: true, status: 'metered' },
        { turn: 502, prompt: 'Second retained', tokens: 1_200, metered: true, status: 'metered' },
      ],
      allTurnsTotal: 1_000,
    } as ForecastView);

    expect(rows.map((row) => row.turn)).toEqual([501, 502]);
    expect(rows[1].delta).toBe(200);
  });

  it('uses the bounded context-series start for legacy fallback rows', () => {
    const rows = buildHistoryRows({
      contextSeries: [2_000, 2_500],
      contextSeriesStartTurn: 99,
      turnPrompts: ['A', 'B'],
    } as ForecastView);

    expect(rows.map((row) => row.turn)).toEqual([99, 100]);
  });

  it('does not compare a measured input against an output-only predecessor', () => {
    const rows = buildHistoryRows({
      allTurns: [
        { turn: 1, prompt: 'Partial', tokens: 200, metered: false, status: 'output-only' },
        { turn: 2, prompt: 'Measured', tokens: 2_000, metered: true, status: 'metered' },
      ],
    } as ForecastView);

    expect(rows[1].delta).toBeUndefined();
  });
});
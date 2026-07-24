import { describe, expect, it } from 'vitest';
import type { PromptEvent } from '@tokentama/shared-types';
import { buildLiveHistory } from '../liveHistory';

function event(index: number, metered = true): PromptEvent {
  return {
    eventId: `event-${index}`,
    sessionId: 'session',
    sourceRequestId: `request-${index}`,
    userId: 'local',
    turnIndex: index,
    source: 'github-copilot-chat',
    timestamp: new Date(Date.parse('2026-07-23T10:00:00.000Z') + index).toISOString(),
    promptText: `Prompt ${index}`,
    toolCalls: [],
    meteringStatus: metered ? 'metered' : 'pending',
    tokens: metered
      ? {
          inputTokens: 1_000 + index,
          outputTokens: 100,
          inputEstimated: false,
          outputEstimated: false,
          estimated: false,
          estimatedCostUsd: 0,
        }
      : undefined,
  };
}

describe('buildLiveHistory', () => {
  it('bounds webview history while retaining real turn numbers and totals', () => {
    const events = Array.from({ length: 1_000 }, (_, index) => event(index));

    const view = buildLiveHistory(events, events, 500);

    expect(view.allTurns).toHaveLength(500);
    expect(view.allTurnsTotal).toBe(1_000);
    expect(view.allTurns[0].turn).toBe(501);
    expect(view.allTurns.at(-1)?.turn).toBe(1_000);
    expect(view.contextSeries).toHaveLength(500);
    expect(view.contextSeriesStartTurn).toBe(501);
    expect(view.contextSeries[0]).toBe(1_500);
  });

  it('keeps a pending tail row without adding it to the metered context series', () => {
    const metered = [event(0), event(1)];
    const events = [...metered, event(2, false)];

    const view = buildLiveHistory(events, metered);

    expect(view.allTurnsTotal).toBe(3);
    expect(view.allTurns.at(-1)).toMatchObject({
      turn: 3,
      status: 'pending',
      metered: false,
    });
    expect(view.contextSeries).toEqual([1_000, 1_001]);
  });
});

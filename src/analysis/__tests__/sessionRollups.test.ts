import { describe, expect, it, vi } from 'vitest';
import type { PromptEvent } from '@tokentama/shared-types';
import type { CopilotSessionPaths } from '../../capture/copilotPaths';
import { createBusinessToolRegistry } from '../businessToolGroups';
import { SessionRollupCache } from '../sessionRollups';

const session = (id: string, sourceSignature = id): CopilotSessionPaths => ({
  sessionId: id,
  workspaceHash: 'workspace',
  modifiedMs: 1,
  sourceBytes: 100,
  sourceSignature,
});

const event = (id: string, input = 1_000): PromptEvent => ({
  eventId: id,
  sessionId: id,
  sourceRequestId: `request-${id}`,
  userId: 'local',
  turnIndex: 0,
  source: 'github-copilot-chat',
  timestamp: '2026-07-23T12:00:00.000Z',
  promptText: `Prompt ${id}`,
  toolCalls: [],
  meteringStatus: 'metered',
  tokens: {
    inputTokens: input,
    outputTokens: 100,
    inputEstimated: false,
    outputEstimated: false,
    estimated: false,
    estimatedCostUsd: 0,
  },
});

const options = (
  sessions: CopilotSessionPaths[],
  active: CopilotSessionPaths,
  activeEvents: PromptEvent[],
) => ({
  sessions,
  active,
  activeEvents,
  activeComplete: true,
  dayKey: 'Thu Jul 23 2026',
  todayMs: Date.parse('2026-07-23T00:00:00.000Z'),
  tomorrowMs: Date.parse('2026-07-24T00:00:00.000Z'),
  businessConfigSignature: 'business-config',
  rates: {},
  costs: { usdPerMillionTokens: 0.58, usdPerCredit: 0 },
  registry: createBusinessToolRegistry(false, [], {}),
  budgetMs: 25,
});

describe('SessionRollupCache', () => {
  it('publishes active-first partial totals and completes on a later host turn', () => {
    const sessions = [session('active'), session('history-1'), session('history-2')];
    let now = 0;
    const read = vi.fn((source: CopilotSessionPaths) => {
      now += 30;
      return { events: [event(source.sessionId)], complete: true };
    });
    const cache = new SessionRollupCache(read, () => now);

    const first = cache.refresh(options(sessions, sessions[0], [event('active')]));
    expect(first).toMatchObject({
      complete: false,
      processedSessionCount: 2,
      totalSessionCount: 3,
    });
    expect(first.rollups.reduce((sum, rollup) => sum + rollup.input, 0)).toBe(2_000);

    const second = cache.refresh(options(sessions, sessions[0], [event('active')]));
    expect(second).toMatchObject({
      complete: true,
      processedSessionCount: 3,
      totalSessionCount: 3,
    });
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('does not cache an incomplete historical source', () => {
    const active = session('active');
    const history = session('history');
    let complete = false;
    let now = 0;
    const read = vi.fn(() => ({ events: [event('history')], complete }));
    const cache = new SessionRollupCache(read, () => now);

    const first = cache.refresh(options([active, history], active, [event('active')]));
    expect(first).toMatchObject({ complete: false, processedSessionCount: 1 });
    expect(first.continuationDelayMs).toBe(1_000);

    complete = true;
    now = 999;
    const backedOff = cache.refresh(options([active, history], active, [event('active')]));
    expect(backedOff).toMatchObject({ complete: false, processedSessionCount: 1 });
    expect(read).toHaveBeenCalledTimes(1);

    now = 1_000;
    const second = cache.refresh(options([active, history], active, [event('active')]));
    expect(second).toMatchObject({ complete: true, processedSessionCount: 2 });
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('uses a slow continuation when the active source is incomplete', () => {
    const active = session('active');
    const cache = new SessionRollupCache(vi.fn(), () => 0);
    const input = options([active], active, [event('active')]);

    const update = cache.refresh({ ...input, activeComplete: false });

    expect(update).toMatchObject({
      complete: false,
      processedSessionCount: 0,
      continuationDelayMs: 1_000,
    });
  });

  it('uses a slow continuation when a previously cached active source becomes unreadable', () => {
    const active = session('active');
    const cache = new SessionRollupCache(vi.fn(), () => 0);
    const input = options([active], active, [event('active')]);
    expect(cache.refresh(input).complete).toBe(true);

    const update = cache.refresh({ ...input, activeComplete: false });

    expect(update).toMatchObject({
      complete: false,
      processedSessionCount: 1,
      continuationDelayMs: 1_000,
    });
  });

  it('invalidates only the session whose per-file source signature changed', () => {
    const active = session('active');
    const history = session('history', 'source-v1');
    const read = vi.fn((source: CopilotSessionPaths) => ({
      events: [event(source.sessionId, source.sourceSignature === 'source-v2' ? 2_000 : 1_000)],
      complete: true,
    }));
    const cache = new SessionRollupCache(read, () => 0);
    cache.refresh(options([active, history], active, [event('active')]));
    const revised = session('history', 'source-v2');
    const update = cache.refresh(options([active, revised], active, [event('active')]));

    expect(update.complete).toBe(true);
    expect(update.rollups.reduce((sum, rollup) => sum + rollup.input, 0)).toBe(3_000);
    expect(read).toHaveBeenCalledTimes(2);
  });
});

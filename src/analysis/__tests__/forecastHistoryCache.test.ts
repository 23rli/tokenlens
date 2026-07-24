import { describe, expect, it } from 'vitest';
import {
  ForecastHistoryCache,
  type ForecastHistoryEntry,
} from '../forecastHistoryCache';

const entries = (count: number, start = 0): ForecastHistoryEntry[] =>
  Array.from({ length: count }, (_, offset) => {
    const index = start + offset;
    return {
      id: `request-${index}`,
      promptTokens: 20_000 + index * 1_250,
      completionTokens: 400 + (index % 3) * 25,
      promptText: `implement change ${index}`,
      toolCalls: index % 5,
      model: { contextMaxTokens: 1_000_000 },
    };
  });

describe('ForecastHistoryCache', () => {
  it('reuses an unchanged service and appends only a newly metered turn', () => {
    const cache = new ForecastHistoryCache({ historyLimit: 200 });
    const first = entries(100);
    const initial = cache.update('workspace/chat', first);
    const unchanged = cache.update('workspace/chat', first);
    const appended = cache.update('workspace/chat', [...first, ...entries(1, 100)]);

    expect(initial.change).toBe('rebuild');
    expect(unchanged).toMatchObject({ change: 'unchanged', appended: 0 });
    expect(unchanged.service).toBe(initial.service);
    expect(appended).toMatchObject({ change: 'append', appended: 1 });
    expect(appended.service).toBe(initial.service);
    expect(appended.service.turnCount).toBe(101);
  });

  it('keeps appending when the 200-turn window slides', () => {
    const cache = new ForecastHistoryCache({ historyLimit: 200 });
    const first = entries(200);
    const initial = cache.update('workspace/chat', first);
    const update = cache.update('workspace/chat', [...first, ...entries(1, 200)]);

    expect(update).toMatchObject({ change: 'append', appended: 1 });
    expect(update.service).toBe(initial.service);
    expect(update.service.turnCount).toBe(200);
  });

  it('rebuilds when compaction removes retained history', () => {
    const cache = new ForecastHistoryCache({ historyLimit: 200 });
    cache.update('workspace/chat', entries(100));

    // The source retained requests 40..99 and added request 100. Existing state
    // cannot become this shorter history through a bounded append alone.
    const update = cache.update('workspace/chat', [
      ...entries(60, 40),
      ...entries(1, 100),
    ]);

    expect(update.change).toBe('rebuild');
    expect(update.service.turnCount).toBe(61);
  });

  it('rebuilds when an earlier metered value is revised', () => {
    const cache = new ForecastHistoryCache();
    const original = entries(20);
    const initial = cache.update('workspace/chat', original);
    const revised = original.map((entry, index) =>
      index === 10 ? { ...entry, promptTokens: entry.promptTokens + 999 } : entry,
    );
    const update = cache.update('workspace/chat', revised);

    expect(update.change).toBe('rebuild');
    expect(update.service).not.toBe(initial.service);
  });

  it('produces the same next forecast as a clean rebuild after appending', () => {
    const all = entries(75);
    const incremental = new ForecastHistoryCache();
    incremental.update('workspace/chat', all.slice(0, 74));
    const appended = incremental.update('workspace/chat', all);
    const rebuilt = new ForecastHistoryCache().update('workspace/chat', all);

    expect(appended.service.forecastNext('write tests')).toEqual(
      rebuilt.service.forecastNext('write tests'),
    );
  });
});

import { performance } from 'node:perf_hooks';
import {
  ForecastHistoryCache,
  type ForecastHistoryEntry,
} from '../src/analysis/forecastHistoryCache';

const HISTORY_LIMIT = 200;
const COLD_BUDGET_MS = 1_000;
const APPEND_BUDGET_MS = 100;
const UNCHANGED_BUDGET_MS = 5;

function turns(count: number): ForecastHistoryEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `request-${index}`,
    promptTokens: 18_000 + index * 1_375 + (index % 7) * 211,
    completionTokens: 350 + (index % 5) * 47,
    promptText: `Implement long-chat benchmark turn ${index} with tests and diagnostics.`,
    toolCalls: index % 9,
    model: { contextMaxTokens: 1_000_000 },
  }));
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function timed(run: () => void, samples = 7): number {
  run(); // JIT warmup
  const durations: number[] = [];
  for (let index = 0; index < samples; index++) {
    const started = performance.now();
    run();
    durations.push(performance.now() - started);
  }
  return median(durations);
}

function timedPrepared<T>(prepare: () => T, run: (prepared: T) => void, samples = 7): number {
  run(prepare()); // JIT warmup
  const durations: number[] = [];
  for (let index = 0; index < samples; index++) {
    const prepared = prepare();
    const started = performance.now();
    run(prepared);
    durations.push(performance.now() - started);
  }
  return median(durations);
}

console.log('Token Lens live forecast-history benchmark (median wall time)');
console.log('turns | cold rebuild | unchanged tick | append one');
console.log('------|--------------|----------------|-----------');

let failed = false;
for (const count of [10, 50, 100, 200]) {
  const history = turns(count);
  const next = turns(count + 1);
  const coldMs = timed(() => {
    const cache = new ForecastHistoryCache({ historyLimit: HISTORY_LIMIT });
    const update = cache.update('workspace/chat', history);
    if (update.change !== 'rebuild') throw new Error('cold update did not rebuild');
  });

  const stableCache = new ForecastHistoryCache({ historyLimit: HISTORY_LIMIT });
  stableCache.update('workspace/chat', history);
  const unchangedMs = timed(() => {
    const update = stableCache.update('workspace/chat', history);
    if (update.change !== 'unchanged') throw new Error('stable update replayed history');
  }, 50);

  const appendMs = timedPrepared(() => {
    const prepared = new ForecastHistoryCache({ historyLimit: HISTORY_LIMIT });
    prepared.update('workspace/chat', history);
    return prepared;
  }, (cache) => {
    const update = cache.update('workspace/chat', next);
    if (update.change !== 'append' || update.appended !== 1) {
      throw new Error('one-turn update did not append incrementally');
    }
  });

  console.log(
    `${String(count).padStart(5)} | ${coldMs.toFixed(2).padStart(10)} ms | ${unchangedMs.toFixed(3).padStart(12)} ms | ${appendMs.toFixed(2).padStart(7)} ms`,
  );

  if (
    (count === HISTORY_LIMIT && coldMs > COLD_BUDGET_MS) ||
    unchangedMs > UNCHANGED_BUDGET_MS ||
    appendMs > APPEND_BUDGET_MS
  ) {
    failed = true;
  }
}

if (failed) {
  throw new Error(
    `Live refresh exceeded a regression budget (cold ${COLD_BUDGET_MS}ms, unchanged ${UNCHANGED_BUDGET_MS}ms, append ${APPEND_BUDGET_MS}ms).`,
  );
}

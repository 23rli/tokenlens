import { performance } from 'node:perf_hooks';
import { listCopilotSessions } from '../src/capture/copilotPaths';
import { readSessionSnapshot } from '../src/capture/copilotReader';
import { copilotEventIdentity } from '../src/capture/copilotEventIdentity';
import { meteredTokenParts } from '../src/analysis/meteredUsage';
import { ForecastHistoryCache } from '../src/analysis/forecastHistoryCache';

const allSessions = listCopilotSessions()
  .filter((session) => (session.sourceBytes ?? 0) > 0)
  .sort((left, right) => (right.sourceBytes ?? 0) - (left.sourceBytes ?? 0));
const candidates = allSessions
  .slice(0, 10);

if (candidates.length === 0) {
  console.log('No local Copilot source sessions found.');
  process.exit(0);
}

console.log('Token Lens real-source cold-read benchmark');
console.log('source MB | turns | metered | parse+reconcile | cached read | forecast rebuild');
console.log('----------|-------|---------|-----------------|-------------|-----------------');

for (const session of candidates) {
  const readStarted = performance.now();
  const snapshot = readSessionSnapshot(session);
  const readMs = performance.now() - readStarted;

  const cachedStarted = performance.now();
  const cached = readSessionSnapshot(session);
  const cachedMs = performance.now() - cachedStarted;
  if (cached.events !== snapshot.events) {
    throw new Error('An unchanged source did not reuse its parsed snapshot.');
  }
  if (!snapshot.complete || !cached.complete) {
    throw new Error('A discovered source could not be read completely.');
  }

  const metered = snapshot.events.filter((event) => {
    const parts = meteredTokenParts(event.tokens);
    return parts.fullyMetered && parts.input > 0;
  });
  const forecastStarted = performance.now();
  new ForecastHistoryCache({ historyLimit: 200 }).update(
    `${session.workspaceHash}/${session.sessionId}`,
    metered.map((event) => ({
      id: copilotEventIdentity(event, session.workspaceHash).primary,
      promptTokens: event.tokens!.inputTokens,
      completionTokens: event.tokens!.outputTokens,
      promptText: event.promptText,
      toolCalls: event.toolCalls.length,
      model: {
        maxInputTokens: event.model?.maxInputTokens,
        contextMaxTokens: event.model?.contextMaxTokens,
      },
    })),
  );
  const forecastMs = performance.now() - forecastStarted;

  console.log(
    `${((session.sourceBytes ?? 0) / 1_000_000).toFixed(2).padStart(9)} | ` +
      `${String(snapshot.events.length).padStart(5)} | ` +
      `${String(metered.length).padStart(7)} | ` +
      `${`${readMs.toFixed(1)} ms`.padStart(15)} | ` +
      `${`${cachedMs.toFixed(3)} ms`.padStart(11)} | ` +
      `${`${forecastMs.toFixed(2)} ms`.padStart(15)}`,
  );
}

const cacheProbe = allSessions.slice(0, 200);
const firstPass = cacheProbe.map((session) => readSessionSnapshot(session));
const warmStarted = performance.now();
let cacheMisses = 0;
for (let index = 0; index < cacheProbe.length; index++) {
  if (readSessionSnapshot(cacheProbe[index]).events !== firstPass[index].events) {
    cacheMisses += 1;
  }
}
const warmAllMs = performance.now() - warmStarted;
console.log('');
console.log(
  `Sequential cache probe: ${cacheProbe.length} sessions, ${cacheMisses} misses, ` +
  `${warmAllMs.toFixed(2)} ms warm pass.`,
);
if (cacheMisses > 0) {
  throw new Error('Sequential source scans thrashed the parsed-snapshot key cache.');
}

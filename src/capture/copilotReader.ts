import { readFileSync } from 'node:fs';
import type { PromptEvent } from '@tokentama/shared-types';
import { parseTranscript } from './parsers/transcriptParser';
import { parseChatSessionTokens } from './parsers/chatSessionTokens';
import { parseChatSession } from './parsers/chatSessionParser';
import { parseChatSessionLines } from './parsers/chatSessionLines';
import { parseModelCatalog, resolveModel } from './parsers/modelCatalog';
import { buildPromptEvent } from './parsers/promptEventFactory';
import { reconcileSessionRequests } from './parsers/requestReconciler';
import {
  copilotSessionSourceSignature,
  type CopilotSessionPaths,
} from './copilotPaths';

interface SourceRead {
  content: string;
  ok: boolean;
}

function safeRead(path: string | undefined): SourceRead {
  if (!path) return { content: '', ok: true };
  try {
    return { content: readFileSync(path, 'utf8'), ok: true };
  } catch {
    return { content: '', ok: false };
  }
}

export interface CopilotSessionSnapshot {
  events: PromptEvent[];
  title?: string;
  /** False when an expected source path could not be read this attempt. */
  complete: boolean;
}

interface CachedSessionSnapshot {
  sourceSignature: string;
  events: WeakRef<PromptEvent[]>;
  title?: string;
}

// Weak values let the watcher and its synchronous dashboard callback share one
// parse without pinning several tool-heavy chat histories in extension memory.
const snapshotCache = new Map<string, CachedSessionSnapshot>();
// Values are weak, so retaining enough keys for a large local history does not
// retain the corresponding prompt/response payloads. The wider key window
// prevents cyclic full-scan thrashing (e.g. 91 sessions scanned by watcher,
// Live, then ledger with a 16-key cache produced effectively zero hits).
const MAX_SNAPSHOT_CACHE_KEYS = 256;
const STRONG_SNAPSHOT_TTL_MS = 30_000;
const MAX_STRONG_SNAPSHOT_KEYS = 2;
const strongSnapshotCache = new Map<
  string,
  { sourceSignature: string; events: PromptEvent[]; expiresAt: number }
>();

/**
 * Read one Copilot session into one PromptEvent per user turn.
 *
 * The transcript is append-only and reliable for the user's prompts EXCEPT the
 * very first/older compacted turns. chatSessions is authoritative for logical
 * user requests, stable request IDs, completion state, and metering. Transcript
 * turns are matched by prompt text then timestamp to attach response/tool data.
 * Old transcript-only continuation artifacts are ignored; at most the newest
 * recent transcript-only request is exposed as genuinely pending.
 */
export function readSessionSnapshot(
  paths: CopilotSessionPaths,
  userId = 'local-user',
): CopilotSessionSnapshot {
  const cacheKey = sessionCacheKey(paths, userId);
  const sourceSignature = copilotSessionSourceSignature(paths);
  const cached = snapshotCache.get(cacheKey);
  if (cached?.sourceSignature === sourceSignature) {
    const strong = strongSnapshotCache.get(cacheKey);
    const events =
      strong?.sourceSignature === sourceSignature && strong.expiresAt > Date.now()
        ? strong.events
        : cached.events.deref();
    if (events) {
      // Refresh insertion order so active sessions survive the bounded key map.
      snapshotCache.delete(cacheKey);
      snapshotCache.set(cacheKey, cached);
      rememberStrongSnapshot(cacheKey, sourceSignature, events);
      return { events, title: cached.title, complete: true };
    }
  }
  strongSnapshotCache.delete(cacheKey);

  const chatRead = safeRead(paths.chatSessionPath);
  const transcriptRead = safeRead(paths.transcriptPath);
  const modelsRead = safeRead(paths.modelsJsonPath);
  const chatContent = chatRead.content;
  const parsed = parseTranscript(transcriptRead.content);
  const chatLines = parseChatSessionLines(chatContent);
  const tokensByTurn = parseChatSessionTokens(chatContent, chatLines);
  const chatSession = parseChatSession(chatContent, chatLines);
  const catalog = parseModelCatalog(modelsRead.content);
  const model = resolveModel(chatSession.model, catalog);
  const sessionId = parsed.sessionId || paths.sessionId;

  // Transcript turns that carry a real user prompt, in order. One user request
  // can contain hundreds of assistant/tool subturns; the transcript parser has
  // already aggregated those under this user turn.
  const transcriptTurns = parsed.turns.filter((t) => (t.promptText ?? '').trim().length > 0);
  const firstPromptTurn = parsed.turns.findIndex(
    (t) => (t.promptText ?? '').trim().length > 0,
  );
  // Copilot's response to the omitted first prompt appears as a leading turn with
  // no promptText. Keep its response/tools instead of discarding useful history.
  const leadingTurns = parsed.turns.slice(
    0,
    firstPromptTurn < 0 ? parsed.turns.length : firstPromptTurn,
  );
  const reconciled = reconcileSessionRequests(chatSession.requests, transcriptTurns, {
    sourceModifiedMs: paths.modifiedMs,
  });
  // Copilot's response to the omitted first prompt appears as a leading turn.
  // Attach it to the earliest source request that did not match a user.message.
  const firstUnmatched = reconciled.requests.find((entry) => !entry.turn);
  if (firstUnmatched && leadingTurns[0]) firstUnmatched.turn = leadingTurns[0];

  const events: PromptEvent[] = [];
  for (const { request, turn } of reconciled.requests) {
    const real = tokensByTurn.get(request.turnIndex);
    const promptTokens = request.promptTokens ?? real?.promptTokens;
    const completionTokens = request.completionTokens ?? real?.completionTokens;
    const copilotCredits = request.copilotCredits ?? real?.copilotCredits;
    const tokenDetails = request.promptTokenDetails ?? real?.promptTokenDetails;
    const contextBreakdown =
      tokenDetails && promptTokens
        ? tokenDetails.map((d) => ({
            category: d.category,
            label: d.label,
            pct: d.percentageOfPrompt,
            tokens: Math.round((promptTokens * d.percentageOfPrompt) / 100),
          }))
        : undefined;
    events.push(
      buildPromptEvent({
        source: 'github-copilot-chat',
        sessionId,
        sourceRequestId: request.requestId,
        userId,
        turnIndex: request.turnIndex,
        promptText: request.promptText,
        responseText: turn?.responseText || undefined,
        toolCalls: turn?.toolCalls ?? [],
        timestamp:
          request.timestamp ??
          (turn?.promptText ? turn.startTime : parsed.startTime) ??
          new Date(0).toISOString(),
        model,
        inputTokensOverride: promptTokens,
        outputTokensOverride: completionTokens,
        copilotCredits,
        sourceCompleted: request.completed,
        contextBreakdown,
      }),
    );
  }

  if (reconciled.pendingTurn?.promptText) {
    const turnIndex = Math.max(-1, ...chatSession.requests.map((request) => request.turnIndex)) + 1;
    events.push(
      buildPromptEvent({
        source: 'github-copilot-chat',
        sessionId,
        userId,
        turnIndex,
        promptText: reconciled.pendingTurn.promptText,
        responseText: reconciled.pendingTurn.responseText || undefined,
        toolCalls: reconciled.pendingTurn.toolCalls,
        timestamp: reconciled.pendingTurn.startTime ?? new Date().toISOString(),
        model,
        sourceCompleted: false,
      }),
    );
  }
  const complete = chatRead.ok && transcriptRead.ok && modelsRead.ok;
  const snapshot = { events, title: chatSession.title, complete };
  // A supplied source path that failed to read can recover without its stale
  // stat signature changing (sharing violation, transient network/remote-host
  // error). Return the best partial view now, but never poison the cache with it.
  if (complete) {
    snapshotCache.set(cacheKey, {
      sourceSignature,
      events: new WeakRef(events),
      title: snapshot.title,
    });
    rememberStrongSnapshot(cacheKey, sourceSignature, events);
    while (snapshotCache.size > MAX_SNAPSHOT_CACHE_KEYS) {
      const oldest = snapshotCache.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      snapshotCache.delete(oldest);
      strongSnapshotCache.delete(oldest);
    }
  }
  return snapshot;
}

function rememberStrongSnapshot(
  cacheKey: string,
  sourceSignature: string,
  events: PromptEvent[],
): void {
  const now = Date.now();
  for (const [key, entry] of strongSnapshotCache) {
    if (entry.expiresAt <= now) strongSnapshotCache.delete(key);
  }
  strongSnapshotCache.delete(cacheKey);
  strongSnapshotCache.set(cacheKey, {
    sourceSignature,
    events,
    expiresAt: now + STRONG_SNAPSHOT_TTL_MS,
  });
  while (strongSnapshotCache.size > MAX_STRONG_SNAPSHOT_KEYS) {
    const oldest = strongSnapshotCache.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    strongSnapshotCache.delete(oldest);
  }
}

export function readSessionEvents(paths: CopilotSessionPaths, userId = 'local-user'): PromptEvent[] {
  return readSessionSnapshot(paths, userId).events;
}

function sessionCacheKey(paths: CopilotSessionPaths, userId: string): string {
  return JSON.stringify([
    paths.workspaceHash,
    paths.sessionId,
    paths.transcriptPath ?? '',
    paths.chatSessionPath ?? '',
    paths.modelsJsonPath ?? '',
    userId,
  ]);
}

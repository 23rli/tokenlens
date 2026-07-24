import type {
  BusinessActivitySummary,
  BusinessToolRates,
  ContextSlice,
  PromptEvent,
} from '@tokentama/shared-types';
import {
  copilotSessionSourceSignature,
  type CopilotSessionPaths,
} from '../capture/copilotPaths';
import {
  readSessionSnapshot,
  type CopilotSessionSnapshot,
} from '../capture/copilotReader';
import {
  mergeBusinessActivitySummaries,
  summarizeBusinessActivity,
  type BusinessActivityCostOptions,
} from './businessActivity';
import type { BusinessToolRegistry } from './businessToolGroups';
import { creditAmountForMeteredUsage } from './cost';
import { meteredTokenParts } from './meteredUsage';

export interface SessionRollup {
  signature: string;
  breakdown: ContextSlice[];
  input: number;
  output: number;
  tokensPartial: boolean;
  credits: number;
  creditsEstimated: boolean;
  todayInput: number;
  todayOutput: number;
  todayTokensPartial: boolean;
  todayCredits: number;
  todayCreditsEstimated: boolean;
  businessWorkspace: BusinessActivitySummary;
  businessToday: BusinessActivitySummary;
}

export interface SessionRollupRefreshOptions {
  sessions: readonly CopilotSessionPaths[];
  active: CopilotSessionPaths;
  activeEvents: readonly PromptEvent[];
  activeComplete: boolean;
  dayKey: string;
  todayMs: number;
  tomorrowMs: number;
  businessConfigSignature: string;
  rates: BusinessToolRates;
  costs: BusinessActivityCostOptions;
  registry: BusinessToolRegistry;
  budgetMs: number;
  /** Host-refresh start, so active-source parsing also consumes the budget. */
  startedAt?: number;
}

export interface SessionRollupRefresh {
  rollups: SessionRollup[];
  complete: boolean;
  processedSessionCount: number;
  totalSessionCount: number;
  continuationDelayMs: number;
}

const SOURCE_RETRY_DELAY_MS = 1_000;
const FAST_CONTINUATION_DELAY_MS = 16;

/**
 * Content-free per-session rollups with bounded cold-fill work. The active chat
 * is always represented first; historical sources fill over later host turns.
 */
export class SessionRollupCache {
  private readonly cache = new Map<string, SessionRollup>();
  private readonly retryAfter = new Map<
    string,
    { signature: string; at: number }
  >();

  constructor(
    private readonly readSnapshot: (
      session: CopilotSessionPaths,
    ) => CopilotSessionSnapshot = readSessionSnapshot,
    private readonly now: () => number = Date.now,
  ) {}

  refresh(options: SessionRollupRefreshOptions): SessionRollupRefresh {
    const startedAt = options.startedAt ?? this.now();
    const activeKey = sessionKey(options.active);
    const liveSessionKeys = new Set(options.sessions.map(sessionKey));
    const orderedSessions = [
      options.active,
      ...options.sessions.filter((session) => sessionKey(session) !== activeKey),
    ];
    const rollups: SessionRollup[] = [];
    let complete = options.activeComplete;
    let uncachedLoads = 0;
    let deferredForBudget = false;
    let nextRetryDelayMs = options.activeComplete
      ? Number.POSITIVE_INFINITY
      : SOURCE_RETRY_DELAY_MS;

    for (const session of orderedSessions) {
      const key = sessionKey(session);
      const signature = rollupSignature(session, options);
      let rollup = this.cache.get(key);
      if (!rollup || rollup.signature !== signature) {
        const retry = this.retryAfter.get(key);
        const now = this.now();
        if (retry?.signature === signature && retry.at > now) {
          complete = false;
          nextRetryDelayMs = Math.min(nextRetryDelayMs, retry.at - now);
          continue;
        }
        this.retryAfter.delete(key);
        const isActive = key === activeKey;
        if (
          !isActive &&
          uncachedLoads > 0 &&
          now - startedAt >= options.budgetMs
        ) {
          this.cache.delete(key);
          complete = false;
          deferredForBudget = true;
          continue;
        }
        uncachedLoads += 1;
        const snapshot = isActive
          ? { events: [...options.activeEvents], complete: options.activeComplete }
          : this.readSnapshot(session);
        if (!snapshot.complete) {
          this.cache.delete(key);
          const retryAt = this.now() + SOURCE_RETRY_DELAY_MS;
          this.retryAfter.set(key, { signature, at: retryAt });
          nextRetryDelayMs = Math.min(
            nextRetryDelayMs,
            SOURCE_RETRY_DELAY_MS,
          );
          complete = false;
          continue;
        }
        rollup = buildSessionRollup(signature, snapshot.events, options);
        this.cache.set(key, rollup);
      }
      rollups.push(rollup);
    }

    for (const key of this.cache.keys()) {
      if (!liveSessionKeys.has(key)) this.cache.delete(key);
    }
    for (const key of this.retryAfter.keys()) {
      if (!liveSessionKeys.has(key)) this.retryAfter.delete(key);
    }

    return {
      rollups,
      complete,
      processedSessionCount: rollups.length,
      totalSessionCount: options.sessions.length,
      continuationDelayMs:
        !options.activeComplete || !deferredForBudget
          ? Number.isFinite(nextRetryDelayMs)
            ? Math.max(FAST_CONTINUATION_DELAY_MS, nextRetryDelayMs)
            : FAST_CONTINUATION_DELAY_MS
          : FAST_CONTINUATION_DELAY_MS,
    };
  }

  get(session: Pick<CopilotSessionPaths, 'workspaceHash' | 'sessionId'>): SessionRollup | undefined {
    return this.cache.get(sessionKey(session));
  }

  clear(): void {
    this.cache.clear();
    this.retryAfter.clear();
  }
}

export function mergeSessionRollupBusiness(
  rollups: readonly SessionRollup[],
): { workspace: BusinessActivitySummary; today: BusinessActivitySummary } {
  return {
    workspace: mergeBusinessActivitySummaries(
      rollups.map((rollup) => rollup.businessWorkspace),
    ),
    today: mergeBusinessActivitySummaries(
      rollups.map((rollup) => rollup.businessToday),
    ),
  };
}

function rollupSignature(
  session: CopilotSessionPaths,
  options: SessionRollupRefreshOptions,
): string {
  return JSON.stringify({
    source: copilotSessionSourceSignature(session),
    day: options.dayKey,
    business: options.businessConfigSignature,
    usdPerMillionTokens: options.costs.usdPerMillionTokens,
    usdPerCredit: options.costs.usdPerCredit,
  });
}

function buildSessionRollup(
  signature: string,
  events: readonly PromptEvent[],
  options: Pick<
    SessionRollupRefreshOptions,
    'todayMs' | 'tomorrowMs' | 'rates' | 'costs' | 'registry'
  >,
): SessionRollup {
  const breakdown = new Map<string, { category: string; label: string; tokens: number }>();
  const todayEvents: PromptEvent[] = [];
  let input = 0;
  let output = 0;
  let tokensPartial = false;
  let credits = 0;
  let creditsEstimated = false;
  let todayInput = 0;
  let todayOutput = 0;
  let todayTokensPartial = false;
  let todayCredits = 0;
  let todayCreditsEstimated = false;

  for (const event of events) {
    const eventMs = event.timestamp ? Date.parse(event.timestamp) : NaN;
    const isToday =
      !Number.isNaN(eventMs) &&
      eventMs >= options.todayMs &&
      eventMs < options.tomorrowMs;
    if (isToday) todayEvents.push(event);

    const parts = meteredTokenParts(event.tokens);
    if (!parts.anyMetered) continue;
    input += parts.input;
    output += parts.output;
    tokensPartial ||= parts.partial;
    const credit = creditAmountForMeteredUsage(event.tokens);
    credits += credit.value;
    creditsEstimated ||= credit.estimated;
    if (isToday) {
      todayInput += parts.input;
      todayOutput += parts.output;
      todayTokensPartial ||= parts.partial;
      todayCredits += credit.value;
      todayCreditsEstimated ||= credit.estimated;
    }
    for (const slice of parts.inputMetered ? event.tokens?.contextBreakdown ?? [] : []) {
      const current = breakdown.get(slice.label) ?? {
        category: slice.category,
        label: slice.label,
        tokens: 0,
      };
      current.tokens += slice.tokens;
      breakdown.set(slice.label, current);
    }
  }

  return {
    signature,
    input,
    output,
    tokensPartial,
    credits,
    creditsEstimated,
    todayInput,
    todayOutput,
    todayTokensPartial,
    todayCredits,
    todayCreditsEstimated,
    breakdown: [...breakdown.values()].map((slice) => ({
      ...slice,
      pct: input > 0 ? Math.round((slice.tokens / input) * 100) : 0,
    })),
    businessWorkspace: summarizeBusinessActivity(
      events,
      options.rates,
      options.costs,
      options.registry,
    ),
    businessToday: summarizeBusinessActivity(
      todayEvents,
      options.rates,
      options.costs,
      options.registry,
    ),
  };
}

function sessionKey(
  session: Pick<CopilotSessionPaths, 'workspaceHash' | 'sessionId'>,
): string {
  return `${session.workspaceHash}/${session.sessionId}`;
}

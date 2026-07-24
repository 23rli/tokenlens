import type { PromptEvent, UsageMeteringStatus } from '@tokentama/shared-types';
import { meteredTokenParts } from './meteredUsage';

export const LIVE_HISTORY_DISPLAY_LIMIT = 500;

export interface LiveHistoryTurn {
  turn: number;
  prompt: string;
  tokens: number;
  metered: boolean;
  partial: boolean;
  status: UsageMeteringStatus;
}

export interface LiveHistoryView {
  allTurns: LiveHistoryTurn[];
  allTurnsTotal: number;
  contextSeries: number[];
  turnPrompts: string[];
  contextSeriesStartTurn: number;
}

/** Bound host→webview payload and DOM/SVG work without changing source totals. */
export function buildLiveHistory(
  events: readonly PromptEvent[],
  meteredEvents: readonly PromptEvent[],
  limit = LIVE_HISTORY_DISPLAY_LIMIT,
): LiveHistoryView {
  const boundedLimit = Math.max(1, Math.floor(limit));
  const promptEvents = events.filter((event) => event.promptText.trim());
  const allStart = Math.max(0, promptEvents.length - boundedLimit);
  const allTurns = promptEvents.slice(allStart).map((event, index) => {
    const parts = meteredTokenParts(event.tokens);
    return {
      turn: allStart + index + 1,
      prompt: event.promptText.replace(/\s+/g, ' ').trim().slice(0, 70),
      tokens: parts.inputMetered ? parts.input : parts.output,
      metered: parts.fullyMetered,
      partial: parts.partial,
      status:
        event.meteringStatus ??
        (parts.fullyMetered
          ? 'metered'
          : parts.inputMetered
            ? 'input-only'
            : parts.outputMetered
              ? 'output-only'
              : 'unavailable'),
    } satisfies LiveHistoryTurn;
  });

  const contextStart = Math.max(0, meteredEvents.length - boundedLimit);
  const contextEvents = meteredEvents.slice(contextStart);
  return {
    allTurns,
    allTurnsTotal: promptEvents.length,
    contextSeries: contextEvents.map((event) => event.tokens!.inputTokens),
    turnPrompts: contextEvents.map((event) =>
      event.promptText.replace(/\s+/g, ' ').trim().slice(0, 70),
    ),
    contextSeriesStartTurn: contextEvents.length > 0 ? contextStart + 1 : 0,
  };
}

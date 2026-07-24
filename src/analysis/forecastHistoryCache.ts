import {
  ForecastService,
  type ModelLimits,
  type RecordedTurn,
} from './forecastService';

export interface ForecastHistoryEntry extends RecordedTurn {
  /** Stable source identity; must not depend on a mutable Copilot turn index. */
  id: string;
  model?: ModelLimits;
}

export interface ForecastHistoryUpdate {
  service: ForecastService;
  change: 'unchanged' | 'append' | 'rebuild';
  appended: number;
}

/**
 * Keeps the active session's ForecastService alive between timer ticks. It can
 * append when the source is a continuation (including a sliding bounded window)
 * and rebuilds when an earlier metered turn is revised or compaction removes
 * history that is still inside the retained window.
 */
export class ForecastHistoryCache {
  private readonly historyLimit: number;
  private readonly maxSamples: number;
  private sessionKey?: string;
  private entries: ForecastHistoryEntry[] = [];
  private service: ForecastService;

  constructor(options: { historyLimit?: number; maxSamples?: number } = {}) {
    this.historyLimit = Math.max(1, options.historyLimit ?? 200);
    this.maxSamples = Math.max(1, options.maxSamples ?? 200);
    this.service = this.createService();
  }

  update(
    sessionKey: string,
    sourceEntries: readonly ForecastHistoryEntry[],
  ): ForecastHistoryUpdate {
    const current = sourceEntries.slice(-this.historyLimit).map(cloneEntry);

    if (this.sessionKey === sessionKey && sameEntries(this.entries, current)) {
      return { service: this.service, change: 'unchanged', appended: 0 };
    }

    if (this.sessionKey === sessionKey) {
      const overlap = largestOverlap(this.entries, current);
      if (this.entries.length === 0 || overlap > 0) {
        const additions = current.slice(overlap);
        const projected = [...this.entries, ...additions].slice(-this.historyLimit);
        if (sameEntries(projected, current)) {
          for (const entry of additions) this.record(entry);
          this.entries = current;
          return {
            service: this.service,
            change: additions.length ? 'append' : 'unchanged',
            appended: additions.length,
          };
        }
      }
    }

    this.sessionKey = sessionKey;
    this.entries = [];
    this.service = this.createService();
    for (const entry of current) this.record(entry);
    this.entries = current;
    return { service: this.service, change: 'rebuild', appended: current.length };
  }

  clear(): void {
    this.sessionKey = undefined;
    this.entries = [];
    this.service = this.createService();
  }

  private createService(): ForecastService {
    return new ForecastService({
      maxHistory: this.historyLimit,
      maxSamples: this.maxSamples,
    });
  }

  private record(entry: ForecastHistoryEntry): void {
    this.service.recordTurn(
      {
        promptTokens: entry.promptTokens,
        completionTokens: entry.completionTokens,
        promptText: entry.promptText,
        toolCalls: entry.toolCalls,
      },
      entry.model,
    );
  }
}

function largestOverlap(
  previous: readonly ForecastHistoryEntry[],
  current: readonly ForecastHistoryEntry[],
): number {
  for (let length = Math.min(previous.length, current.length); length > 0; length--) {
    let matches = true;
    const previousStart = previous.length - length;
    for (let index = 0; index < length; index++) {
      if (!sameEntry(previous[previousStart + index], current[index])) {
        matches = false;
        break;
      }
    }
    if (matches) return length;
  }
  return 0;
}

function sameEntries(
  left: readonly ForecastHistoryEntry[],
  right: readonly ForecastHistoryEntry[],
): boolean {
  return left.length === right.length && left.every((entry, index) => sameEntry(entry, right[index]));
}

function sameEntry(left: ForecastHistoryEntry, right: ForecastHistoryEntry): boolean {
  return (
    left.id === right.id &&
    left.promptTokens === right.promptTokens &&
    left.completionTokens === right.completionTokens &&
    left.promptText === right.promptText &&
    left.toolCalls === right.toolCalls &&
    left.model?.maxInputTokens === right.model?.maxInputTokens &&
    left.model?.contextMaxTokens === right.model?.contextMaxTokens
  );
}

function cloneEntry(entry: ForecastHistoryEntry): ForecastHistoryEntry {
  return {
    id: entry.id,
    promptTokens: entry.promptTokens,
    completionTokens: entry.completionTokens,
    promptText: entry.promptText,
    toolCalls: entry.toolCalls,
    model: entry.model ? { ...entry.model } : undefined,
  };
}

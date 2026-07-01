import * as vscode from 'vscode';
import type { TelemetryEvent, TelemetryEventName } from '../types/Telemetry';
import { hashText } from './hash';

export interface PromptScoredInput {
  sessionId: string;
  source: string;
  promptText: string;
  overallScore: number;
  wasteScore: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  retryCount?: number;
  dominantCategory?: string;
  model?: string;
  reasoningEffort?: string;
  preliminary?: boolean;
  co2Grams?: number;
  waterMl?: number;
}

export interface SuggestionShownInput {
  sessionId: string;
  source: string;
  promptText: string;
  category?: string;
  estimatedTokenReductionPct?: number;
  model?: string;
}

export interface SuggestionAdoptedInput {
  sessionId: string;
  source: string;
  promptText: string;
  adopted: boolean;
  model?: string;
}

/** Minimal surface ScoreService depends on (keeps the engine free of vscode). */
export interface ScoreTelemetry {
  promptScored(input: PromptScoredInput): void;
  suggestionShown(input: SuggestionShownInput): void;
  suggestionAdopted(input: SuggestionAdoptedInput): void;
}

const MAX_BUFFER = 2000;

/**
 * Local-first, consent-gated telemetry for the team pilot.
 *
 * Nothing leaves the machine by default. Collection is OFF unless the developer
 * opts in via `tokentama.telemetry.enabled`, and prompt text is hashed by default
 * (`tokentama.telemetry.hashPrompts`). Events are buffered locally so the
 * `exportPilotData` command can produce an explicit, consented handoff file. A
 * `vscode.TelemetryLogger` is used for the standard pipeline (which additionally
 * respects the user's global telemetry setting), but our sender is local-only.
 */
export class TelemetryService implements ScoreTelemetry, vscode.Disposable {
  private readonly logger: vscode.TelemetryLogger;
  private readonly buffer: TelemetryEvent[] = [];

  constructor(private readonly userId: string) {
    this.logger = vscode.env.createTelemetryLogger({
      // Local-only sender: the pilot never egresses. Data is surfaced solely via
      // the explicit exportPilotData command.
      sendEventData: () => {
        /* intentionally local-only */
      },
      sendErrorData: () => {
        /* intentionally local-only */
      },
    });
  }

  private get enabled(): boolean {
    return vscode.workspace
      .getConfiguration('tokentama.telemetry')
      .get<boolean>('enabled', false);
  }

  private get hashPrompts(): boolean {
    return vscode.workspace
      .getConfiguration('tokentama.telemetry')
      .get<boolean>('hashPrompts', true);
  }

  /** Attach prompt identity as a hash by default; raw text only with explicit opt-out. */
  private promptProps(promptText: string): Record<string, string> {
    return this.hashPrompts
      ? { promptHash: hashText(promptText) }
      : { promptHash: hashText(promptText), promptText };
  }

  private emit(
    name: TelemetryEventName,
    sessionId: string,
    properties: Record<string, string | undefined>,
    measurements: Record<string, number | undefined>,
  ): void {
    if (!this.enabled) return;
    const clean = <T>(obj: Record<string, T | undefined>): Record<string, T> => {
      const out: Record<string, T> = {};
      for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v as T;
      return out;
    };
    const event: TelemetryEvent = {
      name,
      sessionId,
      userId: this.userId,
      timestamp: new Date().toISOString(),
      properties: clean(properties),
      measurements: clean(measurements),
    };
    this.buffer.push(event);
    if (this.buffer.length > MAX_BUFFER) this.buffer.shift();
    this.logger.logUsage(name, { ...event.properties, ...event.measurements });
  }

  promptScored(i: PromptScoredInput): void {
    this.emit(
      'prompt_scored',
      i.sessionId,
      {
        source: i.source,
        model: i.model,
        reasoningEffort: i.reasoningEffort,
        dominantCategory: i.dominantCategory,
        preliminary: String(i.preliminary === true),
        ...this.promptProps(i.promptText),
      },
      {
        overallScore: Math.round(i.overallScore),
        wasteScore: Math.round(i.wasteScore),
        inputTokens: i.inputTokens,
        outputTokens: i.outputTokens,
        estimatedCostUsd: i.estimatedCostUsd,
        retryCount: i.retryCount ?? 0,
        co2Grams: i.co2Grams ?? 0,
        waterMl: i.waterMl ?? 0,
      },
    );
  }

  suggestionShown(i: SuggestionShownInput): void {
    this.emit(
      'suggestion_shown',
      i.sessionId,
      { source: i.source, model: i.model, category: i.category, ...this.promptProps(i.promptText) },
      { estimatedTokenReductionPct: i.estimatedTokenReductionPct ?? 0 },
    );
  }

  suggestionAdopted(i: SuggestionAdoptedInput): void {
    this.emit(
      'suggestion_adopted',
      i.sessionId,
      {
        source: i.source,
        model: i.model,
        adopted: String(i.adopted),
        ...this.promptProps(i.promptText),
      },
      { adopted: i.adopted ? 1 : 0 },
    );
  }

  /** Snapshot of locally-buffered events for explicit export. */
  snapshot(): TelemetryEvent[] {
    return this.buffer.map((e) => ({ ...e }));
  }

  dispose(): void {
    this.logger.dispose();
  }
}

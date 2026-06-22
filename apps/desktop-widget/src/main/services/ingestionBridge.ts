import type { PromptEvent, WasteCategory } from '@ecoprompt/shared-types';
import {
  ManualEntryAdapter,
  ScriptedScenarioAdapter,
  TranscriptTailAdapter,
  SessionTracker,
  DEMO_SCRIPT,
  type IngestionAdapter,
} from '@ecoprompt/ingestion';
import { dominantWasteCategories } from '@ecoprompt/scoring-engine';
import type { ApiClient } from './apiClient';
import type { IngestionMode, ScoreEvent, SessionMetrics } from '../../shared/contracts';

interface TurnRecord {
  score: number;
  wasteScore: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  toolCalls: number;
  retry: boolean;
  wasteByCategory: Partial<Record<WasteCategory, number>>;
}

export type ScoreListener = (e: ScoreEvent) => void;

/**
 * Owns the active ingestion adapter, normalizes events into score requests,
 * scores + coaches them (via ApiClient), and emits ScoreEvents to the renderer.
 * All Node-only work (file watching, disk reads) stays in the main process.
 */
export class IngestionBridge {
  private readonly api: ApiClient;
  private readonly manual = new ManualEntryAdapter();
  private readonly scripted = new ScriptedScenarioAdapter();
  private transcript?: TranscriptTailAdapter;
  private readonly tracker = new SessionTracker();

  private mode: IngestionMode = 'scripted';
  private unsub?: () => void;
  private listener?: ScoreListener;

  private prevScore: number | null = null;
  private hadTip = false;
  private pendingAdopt = false;
  private records: TurnRecord[] = [];
  private sessionId = '';

  constructor(api: ApiClient) {
    this.api = api;
  }

  onScore(listener: ScoreListener): void {
    this.listener = listener;
  }

  getMode(): IngestionMode {
    return this.mode;
  }
  getScriptedPosition(): number {
    return this.scripted.position;
  }
  getScriptedLength(): number {
    return this.scripted.length;
  }

  liveAvailable(): boolean {
    try {
      return new TranscriptTailAdapter().isAvailable();
    } catch {
      return false;
    }
  }

  async setMode(mode: IngestionMode): Promise<void> {
    await this.teardown();
    this.mode = mode;
    this.resetSession();
    if (mode === 'scripted') this.scripted.reset();
    const adapter = this.activeAdapter();
    this.unsub = adapter.onPromptEvent((ev) => void this.handleEvent(ev));
    await adapter.start();
  }

  private activeAdapter(): IngestionAdapter {
    if (this.mode === 'manual') return this.manual;
    if (this.mode === 'live') {
      this.transcript = new TranscriptTailAdapter();
      return this.transcript;
    }
    return this.scripted;
  }

  private async teardown(): Promise<void> {
    this.unsub?.();
    this.unsub = undefined;
    this.scripted.pause();
    if (this.transcript) {
      await Promise.resolve(this.transcript.stop()).catch(() => undefined);
      this.transcript = undefined;
    }
  }

  private resetSession(): void {
    this.tracker.reset();
    this.prevScore = null;
    this.hadTip = false;
    this.pendingAdopt = false;
    this.records = [];
  }

  scriptedNext(): void {
    if (this.mode === 'scripted') this.scripted.next();
  }
  scriptedPlay(): void {
    if (this.mode === 'scripted') this.scripted.play();
  }
  scriptedPause(): void {
    this.scripted.pause();
  }
  async scriptedReset(): Promise<void> {
    if (this.mode === 'scripted') {
      this.scripted.reset();
      this.resetSession();
    }
  }

  submitManual(text: string): void {
    if (this.mode === 'manual' && text.trim()) {
      this.manual.submit({ promptText: text, model: 'claude-opus-4.6' });
    }
  }

  /** Accepting a coached rewrite: re-run it (manual) or mark the next turn adopted. */
  acceptRewrite(rewrite?: string): void {
    if (this.mode === 'manual' && rewrite && rewrite.trim()) {
      this.manual.submit({
        promptText: rewrite,
        model: 'claude-opus-4.6',
        adoptedPreviousTip: true,
      });
    } else {
      this.pendingAdopt = true;
    }
  }

  private async handleEvent(rawEvent: PromptEvent): Promise<void> {
    const ev = this.pendingAdopt ? { ...rawEvent, adoptedPreviousTip: true } : rawEvent;
    this.pendingAdopt = false;
    this.sessionId = ev.sessionId;

    const req = this.tracker.toScoreRequest(ev);
    const { resp, source } = await this.api.scorePrompt(req, this.prevScore, this.hadTip);
    const tip = await this.api.generateTip({
      promptText: req.promptText,
      responseText: req.responseText,
      reasons: resp.reasons,
      improvements: resp.improvements,
      wasteCategories: dominantWasteCategories(resp),
      overallScore: resp.overallScore,
      model: req.metadata?.modelName,
    });

    this.prevScore = resp.overallScore;
    this.hadTip = true;

    const wasteByCategory: Partial<Record<WasteCategory, number>> = {};
    for (const c of resp.wasteBreakdown) wasteByCategory[c.category] = c.weightedPoints;
    this.records.push({
      score: resp.overallScore,
      wasteScore: resp.wasteScore,
      inputTokens: resp.tokens?.inputTokens ?? 0,
      outputTokens: resp.tokens?.outputTokens ?? 0,
      costUsd: resp.tokens?.estimatedCostUsd ?? 0,
      toolCalls: req.toolCalls?.length ?? 0,
      retry: (req.metadata?.retryCountInSession ?? 0) > 0,
      wasteByCategory,
    });

    const step = this.mode === 'scripted' ? DEMO_SCRIPT[ev.turnIndex] : undefined;
    const promptExcerpt =
      req.promptText.length > 160 ? `${req.promptText.slice(0, 157)}…` : req.promptText;

    this.listener?.({
      sessionId: ev.sessionId,
      turnIndex: ev.turnIndex,
      promptText: req.promptText,
      promptExcerpt,
      label: step?.label,
      narration: step?.narration,
      response: resp,
      tip,
      source,
      timestamp: new Date().toISOString(),
    });
  }

  getMetrics(): SessionMetrics {
    const n = this.records.length;
    const sum = (f: (r: TurnRecord) => number): number =>
      this.records.reduce((a, r) => a + f(r), 0);

    const totalInputTokens = sum((r) => r.inputTokens);
    const totalOutputTokens = sum((r) => r.outputTokens);
    const totalCostUsd = sum((r) => r.costUsd);

    const wasteByCategory: Partial<Record<WasteCategory, number>> = {};
    for (const r of this.records) {
      for (const [k, v] of Object.entries(r.wasteByCategory)) {
        const key = k as WasteCategory;
        wasteByCategory[key] = (wasteByCategory[key] ?? 0) + (v ?? 0);
      }
    }

    // Directional: tokens we'd avoid if waste were halved (not a metered figure).
    const estimatedTokensSaved = Math.round(
      this.records.reduce((a, r) => a + r.inputTokens * (r.wasteScore / 100) * 0.5, 0),
    );
    const totalTokens = totalInputTokens + totalOutputTokens;
    const avgCostPerToken = totalTokens > 0 ? totalCostUsd / totalTokens : 0;

    return {
      sessionId: this.sessionId,
      promptCount: n,
      averageScore: n ? Math.round(sum((r) => r.score) / n) : 0,
      currentScore: n ? this.records[n - 1]!.score : 0,
      totalInputTokens,
      totalOutputTokens,
      totalCostUsd: Number(totalCostUsd.toFixed(6)),
      estimatedTokensSaved,
      estimatedCostSavedUsd: Number((estimatedTokensSaved * avgCostPerToken).toFixed(6)),
      retriesDetected: this.records.filter((r) => r.retry).length,
      toolCallsTotal: sum((r) => r.toolCalls),
      wasteByCategory,
    };
  }
}

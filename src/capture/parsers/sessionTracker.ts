import type { PromptEvent, ScorePromptRequest } from '@tokentama/shared-types';
import { similarity } from '@tokentama/scoring-engine';

/**
 * Turns a stream of PromptEvents into ScorePromptRequests, maintaining the
 * rolling session context the detectors need (recent prompts + retry counts).
 */
export class SessionTracker {
  private prompts: string[] = [];
  private readonly maxRecent: number;
  private readonly retryThreshold: number;

  constructor(opts: { maxRecent?: number; retryThreshold?: number } = {}) {
    this.maxRecent = opts.maxRecent ?? 8;
    this.retryThreshold = opts.retryThreshold ?? 0.6;
  }

  toScoreRequest(event: PromptEvent, opts: { record?: boolean } = {}): ScorePromptRequest {
    const recentPrompts = [...this.prompts];
    const retryCountInSession = recentPrompts.filter(
      (p) => similarity(p, event.promptText) > this.retryThreshold,
    ).length;

    const request: ScorePromptRequest = {
      sessionId: event.sessionId,
      userId: event.userId,
      promptText: event.promptText,
      responseText: event.responseText,
      toolCalls: event.toolCalls.map((t) => ({
        toolName: t.toolName,
        durationMs: t.durationMs,
        success: t.success,
      })),
      recentPrompts,
      adoptedPreviousTip: event.adoptedPreviousTip,
      metadata: {
        promptLengthChars: event.promptText.length,
        estimatedInputTokens: event.tokens?.inputTokens,
        estimatedOutputTokens: event.tokens?.outputTokens,
        retryCountInSession,
        modelName: event.model?.family,
      },
    };

    // A preliminary pass (record: false) reads the rolling context but must NOT
    // advance it — otherwise the finalized pass would see this prompt as a recent
    // near-duplicate and falsely flag a retry loop.
    if (opts.record !== false) {
      this.prompts.push(event.promptText);
      if (this.prompts.length > this.maxRecent) this.prompts.shift();
    }
    return request;
  }

  reset(): void {
    this.prompts = [];
  }
}

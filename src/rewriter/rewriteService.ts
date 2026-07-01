import type { CoachConfig } from '@tokentama/llm-adapters';
import { chatComplete, leanRewrite } from '@tokentama/llm-adapters';
import { scorePrompt } from '@tokentama/scoring-engine';
import type { TrainingPair } from '../data/corpusStore';
import { buildRewriteMessages, retrievePairs } from './corpusRetrieval';

/** Minimum score gain for a longer rewrite to count as "clearer" (worth the tokens). */
const CLARITY_MARGIN = 8;

export type RewriterMode = 'off' | 'offline' | 'llm';

export interface RewriteConfig {
  mode: RewriterMode;
  fewShotK: number;
  coach: CoachConfig;
}

export interface RewriteResult {
  rewrittenPrompt?: string;
  estimatedTokenReductionPct?: number;
  /** True when the rewrite is longer but reduces vagueness to avoid retries. */
  clarified?: boolean;
  source: 'offline' | 'llm' | 'none';
  /** How many corpus examples informed the rewrite. */
  examplesUsed: number;
}

export interface CorpusPairs {
  trainingPairs(): TrainingPair[];
}

/** Strip code fences / surrounding quotes an LLM might wrap the rewrite in. */
export function cleanRewrite(raw: string): string {
  return raw
    .replace(/^```[\w-]*\r?\n?/, '')
    .replace(/\r?\n?```$/, '')
    .replace(/^["'`]+|["'`]+$/g, '')
    .trim();
}

/**
 * Automatic prompt rewriter. Savings-first:
 *  - offline (default): deterministic heuristic rewrite, zero token cost.
 *  - llm: corpus few-shot through a (cheap) configured model, style-matched,
 *    falling back to the offline rewrite on any failure.
 *
 * A net-savings guard means we only ever surface a rewrite that is genuinely
 * leaner than the original, so using the rewrite always saves tokens downstream.
 */
export class RewriteService {
  constructor(
    private readonly corpus: CorpusPairs,
    private readonly getConfig: () => Promise<RewriteConfig>,
  ) {}

  async rewrite(input: { promptText: string; model?: string }): Promise<RewriteResult> {
    const prompt = input.promptText;
    if (!prompt.trim()) return { source: 'none', examplesUsed: 0 };

    const cfg = await this.getConfig();
    if (cfg.mode === 'off') return { source: 'none', examplesUsed: 0 };

    const examples = retrievePairs(this.corpus.trainingPairs(), prompt, {
      k: cfg.fewShotK,
      model: input.model,
    });

    if (cfg.mode === 'llm') {
      try {
        const { system, user } = buildRewriteMessages(prompt, examples);
        const maxTokens = Math.min(400, Math.ceil(prompt.length / 3) + 60);
        const raw = await chatComplete(cfg.coach, system, user, { temperature: 0.3, maxTokens });
        const cleaned = cleanRewrite(raw);
        const result = this.finalize(prompt, cleaned, 'llm', examples.length);
        if (result.rewrittenPrompt) return result;
      } catch {
        /* fall back to the offline rewrite below */
      }
    }

    return this.finalize(prompt, this.offlineRewrite(prompt), 'offline', examples.length);
  }

  private offlineRewrite(prompt: string): string {
    // Cleaning-only lean rewrite — never appends guidance, so it's genuinely shorter.
    return leanRewrite(prompt);
  }

  private scoreOf(text: string): number {
    return scorePrompt({
      sessionId: 'rewrite',
      userId: 'local',
      promptText: text,
      metadata: { promptLengthChars: text.length },
    }).overallScore;
  }

  /**
   * Accept a rewrite only when it lowers EXPECTED total tokens: either it's
   * genuinely shorter, or it's meaningfully clearer (less vague) so it avoids a
   * retry. This keeps the rewriter from shortening prompts into vagueness.
   */
  private finalize(
    original: string,
    rewrite: string | undefined,
    source: 'offline' | 'llm',
    examplesUsed: number,
  ): RewriteResult {
    const o = original.trim();
    const r = rewrite?.trim();
    if (!r || r === o) return { source: 'none', examplesUsed };
    const shorter = r.length < o.length;
    const clearer = !shorter && this.scoreOf(r) >= this.scoreOf(o) + CLARITY_MARGIN;
    if (!shorter && !clearer) return { source: 'none', examplesUsed };
    return {
      rewrittenPrompt: r,
      estimatedTokenReductionPct: shorter ? Math.round((1 - r.length / o.length) * 100) : undefined,
      clarified: clearer,
      source,
      examplesUsed,
    };
  }
}

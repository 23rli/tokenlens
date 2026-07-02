import type { CoachConfig } from '@tokentama/llm-adapters';
import { chatComplete, isCoachConfigured, leanRewrite } from '@tokentama/llm-adapters';
import { estimateTokens } from '@tokentama/scoring-engine';
import type { TrainingPair } from '../data/corpusStore';
import { buildRewriteMessages, retrievePairs } from './corpusRetrieval';

/** Below this length, a specific prompt doesn't justify spending an LLM call. */
const MIN_LLM_CHARS = 80;

export type RewriterMode = 'off' | 'offline' | 'auto' | 'llm';

export interface RewriteConfig {
  mode: RewriterMode;
  fewShotK: number;
  coach: CoachConfig;
}

export interface RewriteResult {
  rewrittenPrompt?: string;
  /** Positive % of tokens saved (a rewrite is only ever offered when it's shorter). */
  estimatedTokenReductionPct?: number;
  /** Estimated number of tokens saved vs. the original prompt. */
  estimatedTokensSaved?: number;
  source: 'offline' | 'llm' | 'none';
  /** How many corpus examples informed the rewrite. */
  examplesUsed: number;
  /** Estimated tokens THIS rewrite call itself spent (0 for offline) — for net accounting. */
  llmTokensSpent?: number;
}

export interface CorpusPairs {
  trainingPairs(): TrainingPair[];
}

/**
 * A single-turn completion (system, user) → text. Injected so the service can use
 * VS Code's Language Model API — the user's own Copilot models, no API key.
 */
export type LlmComplete = (system: string, user: string) => Promise<string>;

/** Strip code fences / surrounding quotes an LLM might wrap the rewrite in. */
export function cleanRewrite(raw: string): string {
  return raw
    .replace(/^```[\w-]*\r?\n?/, '')
    .replace(/\r?\n?```$/, '')
    .replace(/^["'`]+|["'`]+$/g, '')
    .trim();
}

/**
 * Automatic prompt rewriter. When asked explicitly it uses a real model to turn a
 * rough/vague ask into a precise, self-contained prompt that gets the SAME result
 * with fewer total tokens — adding the minimal specifics needed to avoid retries,
 * or cutting filler when the prompt is padded.
 *
 * Backends, in order: the injected VS Code Language Model (your own Copilot models,
 * no key), then an external provider if configured, then the offline cleaning
 * rewrite. An explicitly-requested rewrite is always shown.
 */
export class RewriteService {
  constructor(
    private readonly corpus: CorpusPairs,
    private readonly getConfig: () => Promise<RewriteConfig>,
    private readonly llmComplete?: LlmComplete,
    private readonly getPortfolio?: () => string | undefined,
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

    if (cfg.mode === 'llm' || (cfg.mode === 'auto' && this.worthLlm(prompt))) {
      const llm = await this.tryLlm(prompt, examples, cfg);
      if (llm) {
        // Only ever offer something SHORTER than the original: the model rewrite or
        // the free offline clean, whichever is leaner. If neither is shorter, offer
        // NO rewrite (the prompt is already tight) — we never hand back a longer one.
        const o = prompt.trim();
        const lm = cleanRewrite(llm.raw).trim();
        const off = leanRewrite(prompt).trim();
        const best = [lm, off]
          .filter((c) => c && c !== o && c.length < o.length)
          .sort((a, b) => a.length - b.length)[0];
        if (best) {
          const result = this.present(prompt, best, best === lm ? 'llm' : 'offline', examples.length);
          result.llmTokensSpent = llm.tokensSpent;
          return result;
        }
        // Nothing leaner than the original — say so, but still account for the spend.
        return { source: 'none', examplesUsed: examples.length, llmTokensSpent: llm.tokensSpent };
      }
    }

    return this.present(prompt, leanRewrite(prompt), 'offline', examples.length);
  }

  /**
   * Cost gate for `auto`: only spend an LLM call when there's real length to
   * compress. Short prompts have nothing to gain (and we never invent detail to
   * pad them), so they stay offline at zero tokens — spending fewer, not more.
   */
  private worthLlm(prompt: string): boolean {
    return prompt.trim().length >= MIN_LLM_CHARS;
  }

  /** Try the best available model backend; returns raw text + its estimated token spend. */
  private async tryLlm(
    prompt: string,
    examples: TrainingPair[],
    cfg: RewriteConfig,
  ): Promise<{ raw: string; tokensSpent: number } | undefined> {
    const { system, user } = buildRewriteMessages(prompt, examples, this.getPortfolio?.());
    const spend = (out: string): number =>
      estimateTokens(system) + estimateTokens(user) + estimateTokens(out);
    // Prefer the user's own Copilot models via the injected LM (no key required).
    if (this.llmComplete) {
      try {
        const out = await this.llmComplete(system, user);
        if (out && out.trim()) return { raw: out, tokensSpent: spend(out) };
      } catch {
        /* try the next backend */
      }
    }
    // Fall back to an explicitly configured external provider, if any.
    if (isCoachConfigured(cfg.coach)) {
      try {
        const maxTokens = Math.min(500, Math.ceil(prompt.length / 3) + 120);
        const out = await chatComplete(cfg.coach, system, user, { temperature: 0.3, maxTokens });
        return { raw: out, tokensSpent: spend(out) };
      } catch {
        /* fall through to offline */
      }
    }
    return undefined;
  }

  /**
   * Present a produced rewrite. A rewrite is only ever surfaced when it genuinely
   * saves tokens; a longer or equal result is discarded (source 'none'), because
   * the whole point of the app is to spend FEWER tokens, never more.
   */
  private present(
    original: string,
    rewrite: string | undefined,
    source: 'offline' | 'llm',
    examplesUsed: number,
  ): RewriteResult {
    const o = original.trim();
    const r = rewrite?.trim();
    if (!r || r === o || r.length >= o.length) return { source: 'none', examplesUsed };
    const before = estimateTokens(o);
    const after = estimateTokens(r);
    const saved = before - after;
    if (saved <= 0) return { source: 'none', examplesUsed };
    return {
      rewrittenPrompt: r,
      estimatedTokenReductionPct: Math.round((saved / before) * 100),
      estimatedTokensSaved: saved,
      source,
      examplesUsed,
    };
  }
}

import type { TipRequest, TipResponse, WasteCategory } from '@ecoprompt/shared-types';
import { splitSentences } from '@ecoprompt/scoring-engine';

/** Playful one-liners per dominant waste category (design doc §11.3 tone). */
const SHORT_TIPS: Record<WasteCategory, string> = {
  redundantContext: 'Looks like that repeated context from earlier — I can compact it.',
  vagueness: 'Want me to tighten that prompt with a clear task and format?',
  retryLoop: 'Instead of retrying, let’s add the missing detail just once.',
  toolOveruse: 'We can probably get there with fewer tool calls.',
  verbosityMismatch: 'We can likely get the same result with fewer tokens.',
  ignoredCoaching: 'Give the suggested rewrite a try — it usually pays off.',
};

const RETRY_FILLER =
  /\b(still not working|still broken|try again|same as before|just fix it|fix it|please)\b[.,!]?/gi;

function dedupeSentences(text: string): string {
  const seen = new Set<string>();
  return splitSentences(text)
    .filter((s) => {
      const key = s.toLowerCase().replace(/\s+/g, ' ').trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(' ');
}

/** Build a cleaned, structured rewrite of a wasteful prompt — no LLM required. */
export function heuristicRewrite(promptText: string, categories: WasteCategory[]): string {
  let core = dedupeSentences(promptText).replace(RETRY_FILLER, '').replace(/\s+/g, ' ').trim();
  if (!core) core = 'Complete the task';
  if (!/[.!?]$/.test(core)) core += '.';

  const lines = [core];
  if (categories.includes('vagueness') || categories.includes('verbosityMismatch')) {
    lines.push(
      'Output: the smallest format that answers the ask (e.g. 5 bullets, a single function, or a unified diff).',
    );
  }
  if (categories.includes('redundantContext')) {
    lines.push('Reference earlier context by name instead of re-pasting it.');
  }
  if (categories.includes('verbosityMismatch')) {
    lines.push('Keep it concise — no more than is needed.');
  }
  return lines.join(' ');
}

/** Deterministic coach used offline and as the fallback when no LLM is configured. */
export function heuristicGenerateTip(req: TipRequest): TipResponse {
  const categories = req.wasteCategories;
  const dominant = categories[0];

  const shortTip = dominant
    ? SHORT_TIPS[dominant]
    : 'Nice — that was an efficient, well-structured prompt.';
  const detailedTip = req.improvements.length
    ? req.improvements.join(' ')
    : 'Clear task, good structure, minimal waste. Keep it up.';

  const rewrittenPrompt = categories.length
    ? heuristicRewrite(req.promptText, categories)
    : undefined;

  const reductionBase = Math.max(0, 100 - req.overallScore);
  const estimatedSavings = categories.length
    ? {
        estimatedTokenReductionPct: Math.min(60, Math.max(5, Math.round(reductionBase * 0.5))),
        estimatedLatencyReductionPct: Math.min(50, Math.max(3, Math.round(reductionBase * 0.35))),
      }
    : undefined;

  return { shortTip, detailedTip, rewrittenPrompt, estimatedSavings, source: 'heuristic' };
}

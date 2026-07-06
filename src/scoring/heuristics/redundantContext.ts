import type { Detector, DetectorInput, DetectorResult } from './types';
import { splitSentences, similarity, tokenizeWords, clamp01 } from '../text/similarity';

// Explicit “I'm restating myself” markers — a strong re-paste signal even when the
// wording is rephrased (which sentence-level de-dup would miss). Deliberately does
// NOT match a bare “try again” (that's a retry cue, handled by retryLoop).
const RESTATE_RE =
  /\b(?:again[,:]?\s+(?:the|it|this|that|as|to|i)\b|to reiterate|just to (?:repeat|reiterate)|as i (?:said|mentioned)|like i said|repeating myself|to recap|as (?:stated|noted) (?:above|earlier|before))\b/i;

/** Repeated phrases/paragraphs or re-pasted session context. */
export const redundantContextDetector: Detector = {
  category: 'redundantContext',
  detect(input: DetectorInput): DetectorResult {
    const { promptText, recentPrompts } = input;
    const tokens = tokenizeWords(promptText);

    // 1) Internal repetition: EXACT or NEAR-duplicate sentences within the prompt.
    const sentences = splitSentences(promptText).map((s) =>
      s.toLowerCase().replace(/\s+/g, ' ').trim(),
    );
    const substantive = sentences.filter((s) => s.replace(/[^a-z0-9]/g, '').length >= 8);
    const kept: string[] = [];
    let duplicates = 0;
    for (const s of substantive) {
      if (kept.some((k) => k === s || similarity(k, s) >= 0.6)) duplicates++;
      else kept.push(s);
    }
    const internalRepetition = substantive.length > 0 ? duplicates / substantive.length : 0;

    // 1b) Explicit restatement marker (“Again, the component is…”).
    const restated = RESTATE_RE.test(promptText) ? 0.6 : 0;

    // 2) Overlap with recent prompts: re-pasted context across turns.
    let maxOverlap = 0;
    for (const prev of recentPrompts) {
      maxOverlap = Math.max(maxOverlap, similarity(promptText, prev));
    }

    // 3) Large pasted block with little actual ask.
    const hasAsk = /\?|please|summar|explain|write|fix|refactor|generate|review|translate/i.test(
      promptText,
    );
    const bulk = tokens.length > 400 && !hasAsk ? clamp01((tokens.length - 400) / 1200) : 0;

    const severity = clamp01(internalRepetition * 0.8 + restated + maxOverlap * 0.7 + bulk * 0.5);

    const parts: string[] = [];
    if (internalRepetition > 0.1 || restated) parts.push('repeats context it already stated');
    if (maxOverlap > 0.4) parts.push('re-pastes context from an earlier message');
    if (bulk > 0) parts.push('includes a large block of context with no clear ask');

    return {
      category: 'redundantContext',
      severity,
      reason: parts.length ? `This prompt ${parts.join(' and ')}.` : undefined,
      improvement:
        severity > 0.25
          ? 'Reference earlier context by name instead of re-pasting it, and trim duplicated lines.'
          : undefined,
    };
  },
};

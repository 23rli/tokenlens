import type { Detector, DetectorInput, DetectorResult } from './types';
import { splitSentences, similarity, tokenizeWords, clamp01 } from '../text/similarity';

/** Repeated phrases/paragraphs or re-pasted session context. */
export const redundantContextDetector: Detector = {
  category: 'redundantContext',
  detect(input: DetectorInput): DetectorResult {
    const { promptText, recentPrompts } = input;
    const tokens = tokenizeWords(promptText);

    // 1) Internal repetition: duplicated sentences within the prompt.
    const sentences = splitSentences(promptText).map((s) =>
      s.toLowerCase().replace(/\s+/g, ' ').trim(),
    );
    const seen = new Set<string>();
    let duplicateSentences = 0;
    for (const s of sentences) {
      if (s.length < 12) continue;
      if (seen.has(s)) duplicateSentences++;
      else seen.add(s);
    }
    const internalRepetition = sentences.length > 0 ? duplicateSentences / sentences.length : 0;

    // 2) Overlap with recent prompts: re-pasted context.
    let maxOverlap = 0;
    for (const prev of recentPrompts) {
      maxOverlap = Math.max(maxOverlap, similarity(promptText, prev));
    }

    // 3) Large pasted block with little actual ask.
    const hasAsk = /\?|please|summar|explain|write|fix|refactor|generate|review|translate/i.test(
      promptText,
    );
    const bulk = tokens.length > 400 && !hasAsk ? clamp01((tokens.length - 400) / 1200) : 0;

    const severity = clamp01(internalRepetition * 0.6 + maxOverlap * 0.7 + bulk * 0.5);

    const parts: string[] = [];
    if (internalRepetition > 0.1) parts.push('repeats sentences already in the prompt');
    if (maxOverlap > 0.4) parts.push('re-pastes context from an earlier message');
    if (bulk > 0) parts.push('includes a large block of context with no clear ask');

    return {
      category: 'redundantContext',
      severity,
      reason: parts.length ? `This prompt ${parts.join(' and ')}.` : undefined,
      improvement:
        severity > 0.25
          ? 'Reference earlier context instead of re-pasting it, and trim duplicated lines.'
          : undefined,
    };
  },
};

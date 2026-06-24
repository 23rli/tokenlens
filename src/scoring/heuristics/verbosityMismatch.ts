import type { Detector, DetectorInput, DetectorResult } from './types';
import { tokenizeWords, clamp01 } from '../text/similarity';
import { estimateTokens } from '../models/tokenizer';

const VERBOSE_CUES = [
  'in detail',
  'comprehensive',
  'exhaustive',
  'as much as possible',
  'everything you',
  'thorough',
  'very long',
  'extensive',
  'deep dive',
  'leave nothing out',
  'all the details',
];

/** Requests far more output than the task likely needs. */
export const verbosityMismatchDetector: Detector = {
  category: 'verbosityMismatch',
  detect(input: DetectorInput): DetectorResult {
    const { promptText, responseText } = input;
    const lower = promptText.toLowerCase();
    const promptLen = tokenizeWords(promptText).length;

    const cueHits = VERBOSE_CUES.filter((c) => lower.includes(c)).length;

    const respTokens = estimateTokens(responseText);
    const mismatch = promptLen <= 25 && respTokens > 600 ? clamp01((respTokens - 600) / 1500) : 0;

    const constrained =
      /\b\d+\s*(words|bullets|sentences|lines|points|items)\b/i.test(promptText) ||
      /\b(brief|concise|short|tl;dr|one line|one sentence)\b/i.test(lower);

    let severity = clamp01(Math.min(0.5, cueHits * 0.25) + mismatch * 0.6);
    if (constrained) severity *= 0.4;

    return {
      category: 'verbosityMismatch',
      severity,
      reason:
        severity > 0.3
          ? 'The request invites a much larger answer than the task likely needs.'
          : undefined,
      improvement:
        severity > 0.3
          ? 'Bound the output (e.g. "answer in 5 bullets" or "max 150 words") to avoid over-generation.'
          : undefined,
    };
  },
};

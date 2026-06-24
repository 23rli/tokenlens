import type { Detector, DetectorInput, DetectorResult } from './types';
import { similarity, clamp01 } from '../text/similarity';

const RETRY_CUES = [
  'still not',
  'still broken',
  'still does',
  'try again',
  'that did',
  "didn't work",
  'did not work',
  'does not work',
  "doesn't work",
  'not working',
  'same error',
  'again please',
  'one more time',
  'redo',
  'as i said',
  'like i said',
];

/** Near-duplicate retries / iteration churn without added specificity. */
export const retryLoopDetector: Detector = {
  category: 'retryLoop',
  detect(input: DetectorInput): DetectorResult {
    const { promptText, recentPrompts, metadata } = input;
    const lower = promptText.toLowerCase();

    let maxSim = 0;
    for (const prev of recentPrompts) {
      maxSim = Math.max(maxSim, similarity(promptText, prev));
    }

    const cueHits = RETRY_CUES.filter((c) => lower.includes(c)).length;
    const retryCount = metadata?.retryCountInSession ?? 0;

    const severity = clamp01(
      maxSim * 0.6 + Math.min(0.4, cueHits * 0.2) + Math.min(0.4, retryCount * 0.15),
    );

    return {
      category: 'retryLoop',
      severity,
      reason:
        severity > 0.3
          ? 'This looks like a near-duplicate retry of an earlier prompt without added specificity.'
          : undefined,
      improvement:
        severity > 0.3
          ? 'Instead of resending, add the missing detail: what was wrong and the exact change you want.'
          : undefined,
    };
  },
};

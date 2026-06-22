import type { Detector, DetectorInput, DetectorResult } from './types';
import { clamp01 } from '../text/similarity';

/** Penalizes ignoring a previous coaching suggestion (design doc §10.4, 5%). */
export const coachingAdoptionDetector: Detector = {
  category: 'ignoredCoaching',
  detect(input: DetectorInput): DetectorResult {
    if (!input.hadPreviousTip) {
      return { category: 'ignoredCoaching', severity: 0 };
    }
    const ignored = input.adoptedPreviousTip === false;
    return {
      category: 'ignoredCoaching',
      severity: clamp01(ignored ? 0.8 : 0),
      reason: ignored ? 'A previous efficiency tip was offered but not applied.' : undefined,
      improvement: ignored
        ? 'Try the suggested rewrite — it usually achieves the same result with less waste.'
        : undefined,
    };
  },
};

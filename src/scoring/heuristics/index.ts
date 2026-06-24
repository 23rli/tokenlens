import type { Detector } from './types';
import { redundantContextDetector } from './redundantContext';
import { vaguenessDetector } from './vagueness';
import { retryLoopDetector } from './retryLoop';
import { toolOveruseDetector } from './toolOveruse';
import { verbosityMismatchDetector } from './verbosityMismatch';
import { coachingAdoptionDetector } from './coachingAdoption';

export * from './types';
export { redundantContextDetector } from './redundantContext';
export { vaguenessDetector } from './vagueness';
export { retryLoopDetector } from './retryLoop';
export { toolOveruseDetector } from './toolOveruse';
export { verbosityMismatchDetector } from './verbosityMismatch';
export { coachingAdoptionDetector } from './coachingAdoption';
export { detectStructuredPrompt } from './structuredPrompt';

/** All weighted waste detectors (excludes the positive structure signal). */
export const WASTE_DETECTORS: readonly Detector[] = [
  redundantContextDetector,
  vaguenessDetector,
  retryLoopDetector,
  toolOveruseDetector,
  verbosityMismatchDetector,
  coachingAdoptionDetector,
];

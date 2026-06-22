import type { DetectorInput, StructureSignal } from './types';
import { clamp01 } from '../text/similarity';

/**
 * Positive signal: rewards task / format / constraints structure. Feeds the
 * promptQuality subscore and mitigates the vagueness penalty. Not a waste
 * category, so it is computed separately from the weighted detectors.
 */
export function detectStructuredPrompt(input: DetectorInput): StructureSignal {
  const text = input.promptText;
  const lower = text.toLowerCase();
  const reasons: string[] = [];
  let score = 0;

  if (/\b(json|csv|table|bullets?|numbered list|markdown|diff|function|class)\b/i.test(text)) {
    score += 0.3;
    reasons.push('specifies an output format');
  }
  if (
    /\b\d+\s*(words|bullets|sentences|lines|points|items|steps)\b/i.test(text) ||
    /\b(brief|concise|short|one line|one sentence|tl;dr)\b/i.test(lower)
  ) {
    score += 0.25;
    reasons.push('bounds the output size');
  }
  if (
    /^\s*(write|create|summar|explain|fix|refactor|generate|list|build|design|analyze|review|compare|translate|implement)\w*/i.test(
      text,
    )
  ) {
    score += 0.2;
    reasons.push('opens with a clear task verb');
  }
  if (/(^|\n)\s*([-*]|\d+\.)\s+/.test(text)) {
    score += 0.15;
    reasons.push('uses a structured layout');
  }
  if (
    /\b(constraint|must|should|only|avoid|do not|don't|require|format:|context:)\b/i.test(lower)
  ) {
    score += 0.1;
    reasons.push('states constraints');
  }

  return { structureScore: clamp01(score), reasons };
}

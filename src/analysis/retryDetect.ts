import { similarity } from '@tokentama/scoring-engine';

/**
 * Detect whether a turn is a RE-ASK (retry) of the immediately previous one.
 *
 * Retries are the dominant real cost: a re-ask re-sends the entire turn, so
 * counting them accurately is what makes the savings number trustworthy. Two
 * signals: (1) the turn closely echoes the previous prompt (near-duplicate
 * re-paste), or (2) it's a short correction/frustration ("still broken", "that
 * didn't work", "same error"). Shared by the history benchmark and validated by
 * a labelled precision/recall test.
 */

/** Openers that mark a short correction / re-ask rather than a fresh instruction. */
const REASK_RE =
  /^(?:it'?s |it |that |this |still|nope|no[,.\s]|hmm|wait|actually|that (?:didn'?t|did not)|(?:doesn'?t|does not) work|not working|broken|same (?:as|error|issue)|try again|again[,.\s]|error|failed|fix it|didn'?t work)/i;

export interface ReaskOptions {
  /** Jaccard (3-gram) similarity above which a turn counts as a near-duplicate re-ask. */
  similarityThreshold?: number;
  /** Max length for the short-correction heuristic to apply. */
  shortLen?: number;
}

export function isReask(cur: string, prev: string | undefined, opts: ReaskOptions = {}): boolean {
  if (!prev) return false;
  const c = cur.trim();
  if (!c) return false;
  if (similarity(c, prev) >= (opts.similarityThreshold ?? 0.45)) return true;
  return c.length < (opts.shortLen ?? 90) && REASK_RE.test(c);
}

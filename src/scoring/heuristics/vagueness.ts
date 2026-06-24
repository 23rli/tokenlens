import type { Detector, DetectorInput, DetectorResult } from './types';
import { tokenizeWords, clamp01 } from '../text/similarity';

const VAGUE_PHRASES = [
  'do this',
  'do that',
  'fix it',
  'fix this',
  'make it better',
  'make it work',
  'help me with this',
  'as you see fit',
  'you know what i mean',
  'the thing',
  'and so on',
  'whatever',
  'something like that',
];

const DELIVERABLE_WORDS = [
  'list',
  'bullet',
  'bullets',
  'table',
  'summary',
  'summarize',
  'json',
  'csv',
  'function',
  'class',
  'diff',
  'patch',
  'steps',
  'outline',
  'paragraph',
  'sentence',
  'words',
  'format',
  'example',
];

const TASK_VERB =
  /\b(write|create|summar|explain|fix|refactor|generate|list|build|design|analyze|review|compare|translate|implement|add|remove|update|debug|optimize|document|test)\w*/i;

/** Underspecified prompts likely to trigger clarification loops. */
export const vaguenessDetector: Detector = {
  category: 'vagueness',
  detect(input: DetectorInput): DetectorResult {
    const text = input.promptText;
    const lower = text.toLowerCase();
    const tokens = tokenizeWords(text);
    const length = tokens.length;

    let score = 0;
    if (length <= 6) score += 0.5;
    else if (length <= 12) score += 0.25;

    const vagueHits = VAGUE_PHRASES.filter((p) => lower.includes(p)).length;
    score += Math.min(0.4, vagueHits * 0.2);

    if (!DELIVERABLE_WORDS.some((w) => lower.includes(w))) score += 0.2;

    const pronouns = (lower.match(/\b(it|this|that|those|these|them)\b/g) ?? []).length;
    if (length > 0 && pronouns / length > 0.15) score += 0.2;

    if (!TASK_VERB.test(text)) score += 0.2;

    const severity = clamp01(score);
    return {
      category: 'vagueness',
      severity,
      reason:
        severity > 0.3
          ? 'The request is underspecified — it lacks a clear task, target, or output format.'
          : undefined,
      improvement:
        severity > 0.3
          ? 'State the task, the target, and the desired output format (e.g. "summarize X in 5 bullets").'
          : undefined,
    };
  },
};

import type { Detector, DetectorInput, DetectorResult } from './types';
import { tokenizeWords, clamp01 } from '../text/similarity';

/** Too many tools / retried tools for a small task. */
export const toolOveruseDetector: Detector = {
  category: 'toolOveruse',
  detect(input: DetectorInput): DetectorResult {
    const { toolCalls, promptText } = input;
    const count = toolCalls.length;
    if (count === 0) return { category: 'toolOveruse', severity: 0 };

    const promptLen = tokenizeWords(promptText).length;
    // Loosely scale an expected tool budget with task size.
    const expected = Math.max(2, Math.ceil(promptLen / 40));
    const excess = Math.max(0, count - expected);

    const failures = toolCalls.filter((t) => t.success === false).length;
    const failureRatio = failures / count;

    const uniqueNames = new Set(toolCalls.map((t) => t.toolName)).size;
    const repetition = 1 - uniqueNames / count;

    const severity = clamp01(Math.min(0.6, excess * 0.12) + failureRatio * 0.4 + repetition * 0.3);

    return {
      category: 'toolOveruse',
      severity,
      reason:
        severity > 0.3
          ? `This turn used ${count} tool calls${failures ? ` (${failures} failed)` : ''} for a relatively small task.`
          : undefined,
      improvement:
        severity > 0.3
          ? 'Batch related lookups and avoid retrying the same tool; pick the smallest tool that answers the question.'
          : undefined,
    };
  },
};

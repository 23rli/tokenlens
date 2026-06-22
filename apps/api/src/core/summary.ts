import type { SessionSummary, WasteCategory } from '@ecoprompt/shared-types';
import { scoreToState, estimateCostUsd } from '@ecoprompt/scoring-engine';
import type { ScoreRecord } from '../lib/storage';

const WASTE_CATEGORIES: WasteCategory[] = [
  'redundantContext',
  'vagueness',
  'retryLoop',
  'toolOveruse',
  'verbosityMismatch',
  'ignoredCoaching',
];

function emptyCategories(): Record<WasteCategory, number> {
  return {
    redundantContext: 0,
    vagueness: 0,
    retryLoop: 0,
    toolOveruse: 0,
    verbosityMismatch: 0,
    ignoredCoaching: 0,
  };
}

/**
 * Aggregate a session's score records into the metrics-tab summary. Savings are
 * directional (design doc §25.5): we model the recoverable fraction of input
 * tokens attributable to waste, priced with real per-model rates.
 */
export function buildSessionSummary(
  sessionId: string,
  userId: string,
  records: ScoreRecord[],
): SessionSummary {
  const promptCount = records.length;
  const now = new Date().toISOString();

  if (promptCount === 0) {
    return {
      sessionId,
      userId,
      promptCount: 0,
      averageScore: 100,
      currentScore: 100,
      petState: 'thriving',
      totalEstimatedInputTokens: 0,
      totalEstimatedOutputTokens: 0,
      totalEstimatedCostUsd: 0,
      estimatedTokensSaved: 0,
      estimatedCostSavedUsd: 0,
      retriesDetected: 0,
      toolCallsTotal: 0,
      wasteByCategory: emptyCategories(),
      startedAt: now,
      updatedAt: now,
    };
  }

  let inputTokens = 0;
  let outputTokens = 0;
  let cost = 0;
  let toolCallsTotal = 0;
  let retriesDetected = 0;
  let tokensSaved = 0;
  let scoreSum = 0;
  const wasteByCategory = emptyCategories();

  for (const r of records) {
    inputTokens += r.inputTokens;
    outputTokens += r.outputTokens;
    cost += r.estimatedCostUsd;
    toolCallsTotal += r.toolCalls;
    if (r.retry) retriesDetected += 1;
    scoreSum += r.overallScore;
    tokensSaved += r.inputTokens * (r.wasteScore / 100) * 0.5;
    for (const c of WASTE_CATEGORIES) {
      wasteByCategory[c] += r.wasteByCategory[c] ?? 0;
    }
  }

  const currentScore = records[records.length - 1]!.overallScore;
  const roundedTokensSaved = Math.round(tokensSaved);

  return {
    sessionId,
    userId,
    promptCount,
    averageScore: Math.round(scoreSum / promptCount),
    currentScore,
    petState: scoreToState(currentScore),
    totalEstimatedInputTokens: inputTokens,
    totalEstimatedOutputTokens: outputTokens,
    totalEstimatedCostUsd: Math.round(cost * 1e6) / 1e6,
    estimatedTokensSaved: roundedTokensSaved,
    estimatedCostSavedUsd: estimateCostUsd(roundedTokensSaved, 0),
    retriesDetected,
    toolCallsTotal,
    wasteByCategory,
    startedAt: records[0]!.timestamp,
    updatedAt: now,
  };
}

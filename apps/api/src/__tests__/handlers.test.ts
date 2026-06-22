import { describe, it, expect } from 'vitest';
import {
  handleScorePrompt,
  handleSessionSummary,
  handleGenerateTip,
  handleHealth,
} from '../core/handlers';

describe('api handlers', () => {
  it('scores, persists, and aggregates a session', async () => {
    const sessionId = `test-${Date.now()}`;
    const r1 = await handleScorePrompt({
      sessionId,
      userId: 'u',
      promptText: 'Summarize the design doc in 5 bullets covering cost, risk, and next steps.',
      metadata: { promptLengthChars: 70, modelName: 'claude-opus-4.6' },
    });
    expect(r1.overallScore).toBeGreaterThanOrEqual(70);
    expect(r1.delta).toBe(0);

    const r2 = await handleScorePrompt({
      sessionId,
      userId: 'u',
      promptText: 'fix it',
      metadata: { promptLengthChars: 6 },
    });
    expect(r2.delta).toBe(r2.overallScore - r1.overallScore);

    const summary = await handleSessionSummary({ sessionId, userId: 'u' });
    expect(summary.promptCount).toBe(2);
    expect(summary.currentScore).toBe(r2.overallScore);
    expect(summary.totalEstimatedInputTokens).toBeGreaterThan(0);
    expect(summary.estimatedCostSavedUsd).toBeGreaterThanOrEqual(0);
  });

  it('generates a heuristic tip when no LLM is configured', async () => {
    const tip = await handleGenerateTip({
      promptText: 'fix it',
      reasons: [],
      improvements: ['Be specific about the target and format.'],
      wasteCategories: ['vagueness'],
      overallScore: 40,
    });
    expect(tip.source).toBe('heuristic');
    expect(tip.shortTip.length).toBeGreaterThan(0);
  });

  it('reports health with the in-memory store', async () => {
    const health = await handleHealth();
    expect(health.status).toBe('ok');
    expect(health.storage).toBe('memory');
  });
});

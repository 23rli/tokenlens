import { describe, it, expect } from 'vitest';
import { buildCorpusRecord, toTrainingPair, type CorpusRecordInput } from '../corpusStore';

const base: CorpusRecordInput = {
  sessionId: 's1',
  turnIndex: 0,
  source: 'copilot',
  promptText: 'Could you please kindly help me make the thing work better, you know what I mean.',
  model: 'claude-opus',
  reasoningEffort: 'high',
  overallScore: 40,
  wasteScore: 60,
  wasteCategories: ['vagueness', 'verbosityMismatch'],
  inputTokens: 1200,
  outputTokens: 300,
  tokensReal: true,
  retryCount: 1,
  rewrittenPrompt: 'Make the thing work better.',
  estimatedTokenReductionPct: 30,
  adopted: false,
};

describe('buildCorpusRecord', () => {
  it('always stores a hash + metadata, and raw text when enabled', () => {
    const rec = buildCorpusRecord(base, true);
    expect(rec.promptHash).toMatch(/^[0-9a-f]{16}$/);
    expect(rec.promptText).toBe(base.promptText);
    expect(rec.rewrittenPrompt).toBe(base.rewrittenPrompt);
    expect(rec.model).toBe('claude-opus');
    expect(rec.reasoningEffort).toBe('high');
    expect(rec.wasteCategories).toEqual(['vagueness', 'verbosityMismatch']);
  });

  it('omits raw prompt + rewrite text when storeRawText is off', () => {
    const rec = buildCorpusRecord(base, false);
    expect(rec.promptHash).toMatch(/^[0-9a-f]{16}$/);
    expect(rec.promptText).toBeUndefined();
    expect(rec.rewrittenPrompt).toBeUndefined();
    expect(rec.inputTokens).toBe(1200);
  });
});

describe('toTrainingPair', () => {
  it('produces an input→output pair for a leaner rewrite', () => {
    const pair = toTrainingPair(buildCorpusRecord(base, true));
    expect(pair).not.toBeNull();
    expect(pair!.input).toContain('Could you please');
    expect(pair!.output).toBe('Make the thing work better.');
    expect(pair!.estimatedTokenReductionPct).toBe(30);
  });

  it('returns null when raw text is unavailable (hash-only corpus)', () => {
    expect(toTrainingPair(buildCorpusRecord(base, false))).toBeNull();
  });

  it('returns null when the rewrite is not actually leaner', () => {
    const rec = buildCorpusRecord({ ...base, rewrittenPrompt: base.promptText + ' extra words' }, true);
    expect(toTrainingPair(rec)).toBeNull();
  });
});

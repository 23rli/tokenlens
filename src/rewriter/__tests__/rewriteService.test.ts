import { describe, it, expect } from 'vitest';
import { RewriteService, cleanRewrite, type RewriteConfig } from '../rewriteService';
import type { CoachConfig } from '@tokentama/llm-adapters';

const coach: CoachConfig = { provider: 'none', apiVersion: '2024-10-21', timeoutMs: 12000 };
const emptyCorpus = { trainingPairs: () => [] };

function service(mode: RewriteConfig['mode']): RewriteService {
  return new RewriteService(emptyCorpus, async () => ({ mode, fewShotK: 3, coach }));
}

describe('cleanRewrite', () => {
  it('strips code fences and surrounding quotes', () => {
    expect(cleanRewrite('```\nFix the bug.\n```')).toBe('Fix the bug.');
    expect(cleanRewrite('"Fix the bug."')).toBe('Fix the bug.');
  });
});

describe('RewriteService (offline)', () => {
  it('returns a leaner rewrite for a padded, vague prompt', async () => {
    const promptText =
      'Could you please, if it is not too much trouble, kindly help me make the thing work better, you know what I mean.';
    const r = await service('offline').rewrite({ promptText });
    expect(r.source).toBe('offline');
    expect(r.rewrittenPrompt).toBeTruthy();
    expect(r.rewrittenPrompt!.length).toBeLessThan(promptText.length);
  });

  it('net-savings guard: no rewrite for an already-lean prompt', async () => {
    const r = await service('offline').rewrite({
      promptText: 'Add a unit test for parseEmail covering empty, valid, and malformed input.',
    });
    expect(r.rewrittenPrompt).toBeUndefined();
    expect(r.source).toBe('none');
  });

  it('mode=off yields nothing', async () => {
    const r = await service('off').rewrite({ promptText: 'anything at all here' });
    expect(r.source).toBe('none');
  });

  it('empty input yields nothing', async () => {
    const r = await service('offline').rewrite({ promptText: '   ' });
    expect(r.source).toBe('none');
  });
});

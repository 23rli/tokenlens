import { describe, it, expect } from 'vitest';
import { scorePrompt } from '@ecoprompt/scoring-engine';
import { ScriptedScenarioAdapter } from '../adapters/ScriptedScenarioAdapter';
import { ManualEntryAdapter } from '../adapters/ManualEntryAdapter';
import { SessionTracker } from '../sessionTracker';
import { DEMO_SCRIPT } from '../demoScript';

/** Run the scripted demo through the full scoring pipeline. */
function runDemo(): { scores: number[]; states: string[] } {
  const adapter = new ScriptedScenarioAdapter();
  const tracker = new SessionTracker();
  const scores: number[] = [];
  const states: string[] = [];
  let prev: number | null = null;
  let hadTip = false;

  adapter.onPromptEvent((event) => {
    const req = tracker.toScoreRequest(event);
    const resp = scorePrompt(req, { previousScore: prev, hadPreviousTip: hadTip });
    scores.push(resp.overallScore);
    states.push(resp.petState);
    prev = resp.overallScore;
    hadTip = true;
  });

  while (adapter.hasNext()) adapter.next();
  return { scores, states };
}

describe('demo arc (scripted adapter → tracker → scoring engine)', () => {
  it('emits one score per scripted step', () => {
    const { scores } = runDemo();
    expect(scores).toHaveLength(DEMO_SCRIPT.length);
  });

  it('starts healthy, collapses, then recovers', () => {
    const { scores } = runDemo();
    expect(scores[0]!).toBeGreaterThanOrEqual(75);

    const min = Math.min(...scores);
    const minIndex = scores.indexOf(min);
    expect(min).toBeLessThanOrEqual(40);
    expect(minIndex).toBeLessThan(scores.length - 1); // trough before the end
    expect(scores[scores.length - 1]!).toBeGreaterThanOrEqual(70); // recovery
  });
});

describe('ManualEntryAdapter', () => {
  it('emits a scored-shaped event on submit', () => {
    const adapter = new ManualEntryAdapter();
    const received: string[] = [];
    adapter.onPromptEvent((e) => received.push(e.promptText));
    const event = adapter.submit({
      promptText: 'Summarize X in 3 bullets',
      model: 'claude-opus-4.6',
    });
    expect(received).toEqual(['Summarize X in 3 bullets']);
    expect(event.source).toBe('manual');
    expect(event.tokens?.inputTokens).toBeGreaterThan(0);
  });
});

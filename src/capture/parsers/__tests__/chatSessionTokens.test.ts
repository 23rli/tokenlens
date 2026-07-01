import { describe, it, expect } from 'vitest';
import { parseChatSessionTokens } from '../chatSessionTokens';

describe('parseChatSessionTokens — promptTokenDetails', () => {
  it('captures the per-category input breakdown from a snapshot', () => {
    const line = JSON.stringify({
      kind: 0,
      v: {
        requests: [
          {
            promptTokens: 1000,
            completionTokens: 200,
            promptTokenDetails: [
              { category: 'System', label: 'System Instructions', percentageOfPrompt: 50 },
              { category: 'User Context', label: 'Messages', percentageOfPrompt: 50 },
            ],
          },
        ],
      },
    });
    const map = parseChatSessionTokens(line);
    const t = map.get(0)!;
    expect(t.promptTokens).toBe(1000);
    expect(t.promptTokenDetails).toHaveLength(2);
    expect(t.promptTokenDetails![0].label).toBe('System Instructions');
  });

  it('captures the breakdown from a kind:2 patch', () => {
    const line = JSON.stringify({
      kind: 2,
      k: ['requests', 1, 'promptTokenDetails'],
      v: [{ category: 'System', label: 'Tool Definitions', percentageOfPrompt: 100 }],
    });
    const map = parseChatSessionTokens(line);
    expect(map.get(1)!.promptTokenDetails![0].label).toBe('Tool Definitions');
  });

  it('ignores malformed detail entries', () => {
    const line = JSON.stringify({
      kind: 2,
      k: ['requests', 0, 'promptTokenDetails'],
      v: [{ category: 'System' }, 42, null],
    });
    expect(parseChatSessionTokens(line).get(0)?.promptTokenDetails).toBeUndefined();
  });
});

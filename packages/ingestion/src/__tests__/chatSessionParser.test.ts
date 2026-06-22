import { describe, it, expect } from 'vitest';
import { parseChatSession, extractUserText } from '../chatSessionParser';

describe('extractUserText', () => {
  it('extracts content within userRequest tags', () => {
    expect(extractUserText('<context>noise</context><userRequest>do the thing</userRequest>')).toBe(
      'do the thing',
    );
  });

  it('returns raw text when no tags are present', () => {
    expect(extractUserText('plain prompt')).toBe('plain prompt');
    expect(extractUserText(undefined)).toBe('');
  });
});

describe('parseChatSession', () => {
  it('reconstructs requests + model from a snapshot and kind:2 patch', () => {
    const snapshot = {
      kind: 0,
      v: {
        sessionId: 'cs-1',
        requests: [],
        inputState: {
          selectedModel: {
            metadata: {
              id: 'claude-opus-4.6',
              family: 'claude-opus-4.6',
              vendor: 'copilot',
              maxInputTokens: 900000,
              maxOutputTokens: 64000,
            },
          },
        },
      },
    };
    const addReq = {
      kind: 2,
      k: ['requests'],
      v: [
        {
          requestId: 'r0',
          completionTokens: 1200,
          elapsedMs: 3400,
          result: {
            metadata: {
              renderedUserMessage: [
                {
                  type: 1,
                  text: '<context>x</context><userRequest>Summarize the doc in 5 bullets</userRequest>',
                },
              ],
            },
          },
        },
      ],
    };
    const content = [JSON.stringify(snapshot), JSON.stringify(addReq)].join('\n');

    const parsed = parseChatSession(content);
    expect(parsed.sessionId).toBe('cs-1');
    expect(parsed.model?.family).toBe('claude-opus-4.6');
    expect(parsed.model?.maxInputTokens).toBe(900000);
    expect(parsed.requests).toHaveLength(1);
    expect(parsed.requests[0]!.promptText).toBe('Summarize the doc in 5 bullets');
    expect(parsed.requests[0]!.completionTokens).toBe(1200);
  });

  it('applies kind:1 property patches by path', () => {
    const snapshot = {
      kind: 0,
      v: {
        sessionId: 'cs-2',
        requests: [
          {
            requestId: 'r0',
            result: {
              metadata: { renderedUserMessage: [{ text: '<userRequest>first</userRequest>' }] },
            },
          },
        ],
        inputState: {},
      },
    };
    const patch = { kind: 1, k: ['requests', 0, 'completionTokens'], v: 999 };
    const content = [JSON.stringify(snapshot), JSON.stringify(patch)].join('\n');

    const parsed = parseChatSession(content);
    expect(parsed.requests[0]!.completionTokens).toBe(999);
    expect(parsed.requests[0]!.promptText).toBe('first');
  });
});

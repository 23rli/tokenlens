import { describe, it, expect } from 'vitest';
import type { CopilotSessionPaths } from '../copilotPaths';
import { normalizeCaptureScope, scopeHash, selectSessionsInScope } from '../sessionScope';

/** Minimal session factory — only the fields the scope logic reads. */
function session(
  sessionId: string,
  workspaceHash: string,
  modifiedMs: number,
): CopilotSessionPaths {
  return {
    sessionId,
    workspaceHash,
    transcriptPath: `/${workspaceHash}/${sessionId}.jsonl`,
    modifiedMs,
  };
}

describe('scopeHash', () => {
  it('normalizes unknown settings to the window-scoped privacy default', () => {
    expect(normalizeCaptureScope('all')).toBe('all');
    expect(normalizeCaptureScope('event')).toBe('window');
    expect(normalizeCaptureScope(undefined)).toBe('window');
  });

  it('reads only this window hash for a folder window', () => {
    expect(scopeHash('window', 'abc')).toBe('abc');
  });

  it('reads everything for scope=all even with a hash', () => {
    expect(scopeHash('all', 'abc')).toBeUndefined();
  });

  it('reads everything for an empty window (no hash)', () => {
    expect(scopeHash('window', undefined)).toBeUndefined();
  });
});

describe('selectSessionsInScope', () => {
  const opts = { scope: 'window' as const, activatedAt: 1000 };

  it('folder window keeps its already-hash-scoped list and picks the newest', () => {
    const list = [session('b', 'h1', 30), session('a', 'h1', 20)]; // newest-first
    const { sessions, active } = selectSessionsInScope(list, {
      ...opts,
      workspaceHash: 'h1',
    });
    expect(sessions).toHaveLength(2);
    expect(active?.sessionId).toBe('b');
  });

  it("empty window ignores chats not touched since the window opened", () => {
    const list = [
      session('new', 'h9', 1500), // after activation
      session('old', 'h9', 500), // before activation — another window's
    ];
    const { sessions, active } = selectSessionsInScope(list, {
      ...opts,
      workspaceHash: undefined,
    });
    expect(sessions.map((s) => s.sessionId)).toEqual(['new']);
    expect(active?.sessionId).toBe('new');
  });

  it('empty window shows nothing until a chat is started here', () => {
    const list = [session('old', 'h9', 500)];
    const { sessions, active } = selectSessionsInScope(list, {
      ...opts,
      workspaceHash: undefined,
    });
    expect(sessions).toHaveLength(0);
    expect(active).toBeUndefined();
  });

  it('scope=all keeps every session and picks the globally newest', () => {
    const list = [session('x', 'h2', 40), session('y', 'h1', 35)];
    const { sessions, active } = selectSessionsInScope(list, {
      scope: 'all',
      activatedAt: 1000,
      workspaceHash: 'h1',
    });
    expect(sessions).toHaveLength(2);
    expect(active?.sessionId).toBe('x');
  });

  it('a pinned session in scope overrides newest-wins', () => {
    const list = [session('b', 'h1', 30), session('a', 'h1', 20)];
    const { active } = selectSessionsInScope(list, {
      ...opts,
      workspaceHash: 'h1',
      pinnedSessionId: 'a',
    });
    expect(active?.sessionId).toBe('a');
  });

  it('falls back to newest when the pinned session is no longer in scope', () => {
    const list = [session('b', 'h1', 30), session('a', 'h1', 20)];
    const { active } = selectSessionsInScope(list, {
      ...opts,
      workspaceHash: 'h1',
      pinnedSessionId: 'gone',
    });
    expect(active?.sessionId).toBe('b');
  });
});

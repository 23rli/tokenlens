import type { CopilotSessionPaths } from './copilotPaths';

export type CaptureScope = 'window' | 'all';

/** Treat manually corrupted/legacy settings as the privacy-preserving default. */
export function normalizeCaptureScope(value: unknown): CaptureScope {
  return value === 'all' ? 'all' : 'window';
}

export interface ScopeOptions {
  /** `tokenlens.capture.scope` — 'window' (isolated) or 'all' (newest anywhere). */
  scope: CaptureScope;
  /** This window's workspace hash, or undefined for an empty (no-folder) window. */
  workspaceHash?: string;
  /** When this window's extension activated (ms) — scopes empty windows. */
  activatedAt: number;
  /** A user-pinned session id that should stay active while it exists in scope. */
  pinnedSessionId?: string;
}

export interface ScopedSelection {
  /** In-scope sessions, newest-first (same order as the input). */
  sessions: CopilotSessionPaths[];
  /** The active session: the pinned one if still in scope, else the newest. */
  active: CopilotSessionPaths | undefined;
}

/**
 * Which workspace hash to read from disk for a given scope. A folder window reads
 * only its own hash (fully isolated); 'all' and empty windows read everything and
 * then post-filter in {@link selectSessionsInScope}.
 */
export function scopeHash(scope: CaptureScope, workspaceHash?: string): string | undefined {
  return scope !== 'all' && workspaceHash ? workspaceHash : undefined;
}

/**
 * Decide which Copilot sessions belong to THIS window and which one is active.
 *
 * Pure and vscode-free so it can be unit-tested. Mirrors the three cases:
 *  - folder window (scope!='all', has hash): the input is already hash-scoped → keep as-is.
 *  - scope='all': every session, newest-first.
 *  - empty window (scope!='all', no hash): only sessions touched since the window
 *    opened, so it tracks the chat you start here instead of inheriting another
 *    window's.
 *
 * A pinned session, when present in scope, overrides the newest-wins choice — this
 * lets the user break the same-folder / two-empty-window tie manually.
 */
export function selectSessionsInScope(
  sessions: CopilotSessionPaths[],
  opts: ScopeOptions,
): ScopedSelection {
  const { scope, workspaceHash, activatedAt, pinnedSessionId } = opts;
  const scoped =
    scope !== 'all' && !workspaceHash
      ? sessions.filter((s) => s.modifiedMs >= activatedAt)
      : sessions;
  const pinned = pinnedSessionId
    ? scoped.find((s) => s.sessionId === pinnedSessionId)
    : undefined;
  return { sessions: scoped, active: pinned ?? scoped[0] };
}

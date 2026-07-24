import * as vscode from 'vscode';
import { join } from 'node:path';
import type { PromptEvent } from '@tokentama/shared-types';
import {
  copilotSessionSourceSignature,
  getWorkspaceStorageRoot,
  listCopilotSessions,
} from './copilotPaths';
import { readSessionSnapshot } from './copilotReader';
import { copilotEventIdentity } from './copilotEventIdentity';

interface PendingEvent {
  since: number;
  sessionKey: string;
  turnIndex: number;
  timestamp?: string;
  occurredAt?: string;
}

const MISSING_SESSION_RETENTION_MS = 60 * 60 * 1000;

/**
 * Best-effort, read-only live capture of GitHub Copilot Chat. Reads the
 * append-only transcript `.jsonl` files under VS Code's per-workspace storage
 * and emits a PromptEvent for each newly completed user turn.
 *
 * When `onlyHash` is provided (this window's workspace-storage hash), capture is
 * scoped to THIS window's Copilot sessions — so it never picks up chats from
 * other VS Code windows that share the same user-data directory.
 *
 * Watching files outside the workspace can be unreliable, so a lightweight
 * mtime-guarded poll backs up the file-system watcher. Everything degrades
 * gracefully — if nothing is found, the manual command still works.
 */
export class CopilotWatcher implements vscode.Disposable {
  private watcher?: vscode.FileSystemWatcher;
  private readonly seen = new Set<string>();
  private readonly seenBySession = new Map<string, Set<string>>();
  /** Finalized timestamp fallbacks let a row migrate when its request ID appears. */
  private readonly seenTimestamps = new Set<string>();
  private readonly seenTimestampsBySession = new Map<string, Set<string>>();
  private readonly seenIndexes = new Set<string>();
  private readonly seenIndexesBySession = new Map<string, Set<string>>();
  private readonly pendingSince = new Map<string, PendingEvent>();
  /** Last-seen source signature, so we only re-read a chat that actually changed. */
  private readonly sessionSignatures = new Map<string, string>();
  /** Existing-at-start sessions are lazily baselined on their first later change. */
  private readonly baselineOnlySessions = new Set<string>();
  private readonly sessionLastPresent = new Map<string, number>();
  private readonly root: string;
  private debounce?: ReturnType<typeof setTimeout>;
  private poll?: ReturnType<typeof setInterval>;

  constructor(
    private readonly onEvent: (event: PromptEvent, meta?: { preliminary?: boolean }) => void,
    private readonly onlyHash?: string,
    root = getWorkspaceStorageRoot(),
  ) {
    this.root = root;
  }

  isAvailable(): boolean {
    try {
      return listCopilotSessions(this.root, this.onlyHash).length > 0;
    } catch {
      return false;
    }
  }

  start(): void {
    // Baseline source metadata without synchronously parsing every historical
    // chat. With 70–100 chats, the old eager seed monopolized activation and was
    // immediately followed by Live + ledger scans of the same sources.
    try {
      for (const session of listCopilotSessions(this.root, this.onlyHash)) {
        const sessionKey = this.sessionKey(session.workspaceHash, session.sessionId);
        this.sessionSignatures.set(sessionKey, copilotSessionSourceSignature(session));
        this.baselineOnlySessions.add(sessionKey);
        this.sessionLastPresent.set(sessionKey, Date.now());
      }
    } catch {
      /* ignore */
    }

    try {
      const base = this.onlyHash ? join(this.root, this.onlyHash) : this.root;
      const pattern = new vscode.RelativePattern(vscode.Uri.file(base), '**/*.jsonl');
      this.watcher = vscode.workspace.createFileSystemWatcher(pattern);
      const onChange = (): void => this.scheduleRefresh();
      this.watcher.onDidCreate(onChange);
      this.watcher.onDidChange(onChange);
    } catch {
      /* watcher unavailable — polling still covers us */
    }

    // The external file watcher is not reliable on every VS Code host. Keep the
    // polling fallback quick enough to surface a just-sent first prompt before
    // the user is already writing the second one.
    this.poll = setInterval(() => this.refresh(), 750);
  }

  private scheduleRefresh(): void {
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(() => this.refresh(), 400);
  }

  private refresh(): void {
    let sessions;
    try {
      sessions = listCopilotSessions(this.root, this.onlyHash);
    } catch {
      return;
    }
    const now = Date.now();
    const liveSessionKeys = new Set(
      sessions.map((session) => this.sessionKey(session.workspaceHash, session.sessionId)),
    );
    for (const sessionKey of liveSessionKeys) this.sessionLastPresent.set(sessionKey, now);
    this.pruneMissingSessions(liveSessionKeys, now);
    // Scan EVERY in-scope chat for new turns — not just the newest-mtime one — so
    // we capture the chat the user actually typed in, even if another was touched.
    for (const session of sessions) {
      const sessionKey = this.sessionKey(session.workspaceHash, session.sessionId);
      const sourceSignature = copilotSessionSourceSignature(session);
      const changed = sourceSignature !== this.sessionSignatures.get(sessionKey);
      const hasPending = [...this.pendingSince.values()].some(
        (pending) => pending.sessionKey === sessionKey,
      );
      if (!changed && !hasPending) continue;

      let snapshot;
      try {
        snapshot = readSessionSnapshot(session);
      } catch {
        continue;
      }
      if (!snapshot.complete) continue;
      this.sessionSignatures.set(sessionKey, sourceSignature);
      const events = snapshot.events;
      // Existing-at-start history is intentionally not replayed. On that
      // session's first later source change, seed all prior rows and process only
      // the newest row as the change trigger. Durable ledger sync and Live both
      // rescan the full source, so multiple turns arriving between polls are not
      // lost even though only one callback is needed to wake them.
      let candidateEvents = events;
      if (events.length > 0 && this.baselineOnlySessions.delete(sessionKey)) {
        for (const existing of events.slice(0, -1)) {
          if (existing.promptText.trim()) this.markSeen(existing, session.workspaceHash);
        }
        candidateEvents = events.slice(-1);
      }
      for (const ev of candidateEvents) {
        if (!ev.promptText.trim()) continue;
        const identity = copilotEventIdentity(ev, session.workspaceHash);
        const alreadySeen =
          this.seen.has(identity.primary) ||
          (identity.timestamp !== undefined && this.seenTimestamps.has(identity.timestamp));
        if (alreadySeen) {
          // A source request ID can arrive after a timestamp-keyed preliminary or
          // grace-expired event. Remember the stronger key without emitting twice.
          this.markSeen(ev, session.workspaceHash);
          this.deletePending(identity, sessionKey, ev.turnIndex);
          continue;
        }

        const pending = this.findPending(identity, sessionKey, ev.turnIndex);

        // Wait only for a genuinely in-flight source request. A completed
        // output-only/input-only/unavailable record is final source evidence,
        // not a request that will necessarily gain another meter later.
        if (ev.meteringStatus === 'pending') {
          if (!pending) {
            // First sight without final tokens: show a preliminary score immediately,
            // then keep waiting for the real metered tokens to finalize it.
            this.pendingSince.set(identity.primary, {
              since: now,
              sessionKey,
              turnIndex: ev.turnIndex,
              timestamp: identity.timestamp,
              occurredAt: identity.occurredAt,
            });
            this.onEvent(ev, { preliminary: true });
            continue;
          }
          if (pending.key !== identity.primary) {
            this.pendingSince.delete(pending.key);
            this.pendingSince.set(identity.primary, {
              ...pending.value,
              turnIndex: ev.turnIndex,
              timestamp: identity.timestamp ?? pending.value.timestamp,
              occurredAt: identity.occurredAt ?? pending.value.occurredAt,
            });
          }
          if (now - pending.value.since < 3000) continue;
          // Grace expired — fall through and finalize with estimated tokens.
        }

        this.markSeen(ev, session.workspaceHash);
        this.deletePending(identity, sessionKey, ev.turnIndex);
        this.onEvent(ev, { preliminary: false });
      }
    }
  }

  private sessionKey(workspaceHash: string, sessionId: string): string {
    return `${workspaceHash}/${sessionId}`;
  }

  private markSeen(event: PromptEvent, workspaceHash: string): void {
    const identity = copilotEventIdentity(event, workspaceHash);
    const sessionKey = this.sessionKey(workspaceHash, event.sessionId);
    this.seen.add(identity.primary);
    this.rememberForSession(this.seenBySession, sessionKey, identity.primary);
    // Stable request IDs remain independent even if Copilot assigns two turns
    // the same timestamp. Only a finalized fallback needs this migration alias.
    if (!event.sourceRequestId && identity.timestamp) {
      this.seenTimestamps.add(identity.timestamp);
      this.rememberForSession(
        this.seenTimestampsBySession,
        sessionKey,
        identity.timestamp,
      );
    }
    const indexKey = `${event.sessionId}:${event.turnIndex}`;
    this.seenIndexes.add(indexKey);
    this.rememberForSession(this.seenIndexesBySession, sessionKey, indexKey);
  }

  private rememberForSession(
    map: Map<string, Set<string>>,
    sessionKey: string,
    value: string,
  ): void {
    const values = map.get(sessionKey) ?? new Set<string>();
    values.add(value);
    map.set(sessionKey, values);
  }

  private pruneMissingSessions(liveSessionKeys: ReadonlySet<string>, now: number): void {
    for (const [sessionKey, lastPresent] of this.sessionLastPresent) {
      if (liveSessionKeys.has(sessionKey) || now - lastPresent < MISSING_SESSION_RETENTION_MS) {
        continue;
      }
      for (const key of this.seenBySession.get(sessionKey) ?? []) this.seen.delete(key);
      for (const key of this.seenTimestampsBySession.get(sessionKey) ?? []) {
        this.seenTimestamps.delete(key);
      }
      for (const key of this.seenIndexesBySession.get(sessionKey) ?? []) {
        this.seenIndexes.delete(key);
      }
      this.seenBySession.delete(sessionKey);
      this.seenTimestampsBySession.delete(sessionKey);
      this.seenIndexesBySession.delete(sessionKey);
      this.sessionSignatures.delete(sessionKey);
      this.baselineOnlySessions.delete(sessionKey);
      this.sessionLastPresent.delete(sessionKey);
      for (const [key, pending] of this.pendingSince) {
        if (pending.sessionKey === sessionKey) this.pendingSince.delete(key);
      }
    }
  }

  private findPending(
    identity: ReturnType<typeof copilotEventIdentity>,
    sessionKey: string,
    turnIndex: number,
  ): { key: string; value: PendingEvent } | undefined {
    const exact = this.pendingSince.get(identity.primary);
    if (exact) return { key: identity.primary, value: exact };
    for (const [key, value] of this.pendingSince) {
      if (value.sessionKey !== sessionKey) continue;
      const sameTimestamp =
        identity.timestamp !== undefined && value.timestamp === identity.timestamp;
      const sameOccurrenceAndIndex =
        identity.occurredAt !== undefined &&
        value.occurredAt === identity.occurredAt &&
        value.turnIndex === turnIndex;
      const indexIsOnlyEvidence =
        identity.timestamp === undefined || value.timestamp === undefined;
      if (
        sameTimestamp ||
        sameOccurrenceAndIndex ||
        (indexIsOnlyEvidence && value.turnIndex === turnIndex)
      ) {
        return { key, value };
      }
    }
    return undefined;
  }

  private deletePending(
    identity: ReturnType<typeof copilotEventIdentity>,
    sessionKey: string,
    turnIndex: number,
  ): void {
    const pending = this.findPending(identity, sessionKey, turnIndex);
    if (pending) this.pendingSince.delete(pending.key);
  }

  /** Whether a specific turn has already been captured (for the self-test). */
  isSeen(sessionId: string, turnIndex: number): boolean {
    return this.seenIndexes.has(`${sessionId}:${turnIndex}`);
  }

  /** Live capture state, for the self-test diagnostics command. */
  diagnostics(): { seen: number; pending: number; trackedSessions: number } {
    return {
      seen: this.seen.size,
      pending: this.pendingSince.size,
      trackedSessions: this.sessionSignatures.size,
    };
  }

  dispose(): void {
    if (this.debounce) clearTimeout(this.debounce);
    if (this.poll) clearInterval(this.poll);
    this.watcher?.dispose();
  }
}

import * as vscode from 'vscode';
import type { PromptEvent } from '@ecoprompt/shared-types';
import { findActiveSession, getWorkspaceStorageRoot, listCopilotSessions } from './copilotPaths';
import { readSessionEvents } from './copilotReader';

/**
 * Best-effort, read-only live capture of GitHub Copilot Chat. Reads the
 * append-only transcript `.jsonl` files under VS Code's per-workspace storage
 * and emits a PromptEvent for each newly completed user turn.
 *
 * Watching files outside the workspace can be unreliable, so a lightweight
 * mtime-guarded poll backs up the file-system watcher. Everything degrades
 * gracefully — if nothing is found, the manual command still works.
 */
export class CopilotWatcher implements vscode.Disposable {
  private watcher?: vscode.FileSystemWatcher;
  private readonly seen = new Set<string>();
  private readonly root = getWorkspaceStorageRoot();
  private debounce?: ReturnType<typeof setTimeout>;
  private poll?: ReturnType<typeof setInterval>;
  private lastMtime = 0;

  constructor(private readonly onEvent: (event: PromptEvent) => void) {}

  isAvailable(): boolean {
    try {
      return listCopilotSessions(this.root).length > 0;
    } catch {
      return false;
    }
  }

  start(): void {
    // Mark every existing turn across all sessions as seen, so only turns that
    // happen AFTER capture starts are emitted (no history replay).
    try {
      for (const session of listCopilotSessions(this.root)) {
        for (const ev of readSessionEvents(session)) {
          this.seen.add(`${ev.sessionId}:${ev.turnIndex}`);
        }
        this.lastMtime = Math.max(this.lastMtime, session.modifiedMs);
      }
    } catch {
      /* ignore */
    }

    try {
      const pattern = new vscode.RelativePattern(vscode.Uri.file(this.root), '**/*.jsonl');
      this.watcher = vscode.workspace.createFileSystemWatcher(pattern);
      const onChange = (): void => this.scheduleRefresh();
      this.watcher.onDidCreate(onChange);
      this.watcher.onDidChange(onChange);
    } catch {
      /* watcher unavailable — polling still covers us */
    }

    this.poll = setInterval(() => this.refresh(), 4000);
  }

  private scheduleRefresh(): void {
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(() => this.refresh(), 400);
  }

  private refresh(): void {
    let active;
    try {
      active = findActiveSession(this.root);
    } catch {
      return;
    }
    if (!active || active.modifiedMs <= this.lastMtime) return;
    this.lastMtime = active.modifiedMs;

    for (const ev of readSessionEvents(active)) {
      if (!ev.promptText.trim()) continue;
      const key = `${ev.sessionId}:${ev.turnIndex}`;
      if (this.seen.has(key)) continue;
      this.seen.add(key);
      this.onEvent(ev);
    }
  }

  dispose(): void {
    if (this.debounce) clearTimeout(this.debounce);
    if (this.poll) clearInterval(this.poll);
    this.watcher?.dispose();
  }
}

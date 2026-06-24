import * as vscode from 'vscode';
import type { PromptEvent } from '@ecoprompt/shared-types';
import { findActiveSession, getWorkspaceStorageRoot, listCopilotSessions } from './copilotPaths';
import { readSessionEvents } from './copilotReader';

/**
 * Best-effort, read-only live capture of GitHub Copilot Chat. Watches the
 * on-disk transcript + chatSession `.jsonl` files (under VS Code's per-workspace
 * storage) and emits a PromptEvent for each newly completed turn.
 *
 * The session files are undocumented, so every step degrades gracefully — if
 * the layout changes or nothing is found, capture simply goes quiet and the
 * manual "Score this prompt" command still works.
 */
export class CopilotWatcher implements vscode.Disposable {
  private watcher?: vscode.FileSystemWatcher;
  private readonly seen = new Set<string>();
  private readonly root = getWorkspaceStorageRoot();
  private timer?: ReturnType<typeof setTimeout>;

  constructor(private readonly onEvent: (event: PromptEvent) => void) {}

  isAvailable(): boolean {
    try {
      return listCopilotSessions(this.root).length > 0;
    } catch {
      return false;
    }
  }

  start(): void {
    // Mark existing turns as already seen so only NEW turns emit (live-only).
    try {
      const active = findActiveSession(this.root);
      if (active) {
        for (const ev of readSessionEvents(active)) {
          this.seen.add(`${ev.sessionId}:${ev.turnIndex}`);
        }
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
      /* watcher unavailable — capture stays quiet */
    }
  }

  private scheduleRefresh(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.refresh(), 450);
  }

  private refresh(): void {
    let active;
    try {
      active = findActiveSession(this.root);
    } catch {
      return;
    }
    if (!active) return;

    for (const ev of readSessionEvents(active)) {
      if (!ev.promptText.trim()) continue;
      const key = `${ev.sessionId}:${ev.turnIndex}`;
      if (this.seen.has(key)) continue;
      this.seen.add(key);
      this.onEvent(ev);
    }
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.watcher?.dispose();
  }
}

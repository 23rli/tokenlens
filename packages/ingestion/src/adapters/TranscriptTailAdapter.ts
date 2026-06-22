import { EventEmitter } from 'node:events';
import chokidar, { type FSWatcher } from 'chokidar';
import type { IngestionAdapter, PromptEventHandler } from '../types';
import { findActiveSession, listCopilotSessions, getWorkspaceStorageRoot } from '../copilotPaths';
import { readSessionEvents } from '../copilotReader';

export interface TranscriptTailOptions {
  workspaceStorageRoot?: string;
  userId?: string;
  /** If true, replays existing turns on start; default false (live only). */
  replayExisting?: boolean;
}

/**
 * The headline feature: live interception of GitHub Copilot Chat. Watches the
 * on-disk transcript + chatSession files for the active session and emits a
 * PromptEvent for each new completed turn.
 */
export class TranscriptTailAdapter implements IngestionAdapter {
  readonly source = 'transcript' as const;
  private readonly emitter = new EventEmitter();
  private readonly emittedKeys = new Set<string>();
  private readonly root: string;
  private readonly userId: string;
  private readonly replayExisting: boolean;
  private watcher?: FSWatcher;

  constructor(opts: TranscriptTailOptions = {}) {
    this.root = opts.workspaceStorageRoot ?? getWorkspaceStorageRoot();
    this.userId = opts.userId ?? 'local-user';
    this.replayExisting = opts.replayExisting ?? false;
  }

  /** Whether any Copilot session was found on disk. */
  isAvailable(): boolean {
    return listCopilotSessions(this.root).length > 0;
  }

  start(): void {
    const sessions = listCopilotSessions(this.root);
    if (sessions.length === 0) return;

    // Unless replaying, mark existing turns as already seen so only NEW turns emit.
    if (!this.replayExisting) {
      const active = findActiveSession(this.root);
      if (active) {
        for (const ev of readSessionEvents(active, this.userId)) {
          this.emittedKeys.add(`${ev.sessionId}:${ev.turnIndex}`);
        }
      }
    }

    const watchPaths = sessions.flatMap((s) =>
      [s.transcriptPath, s.chatSessionPath].filter((p): p is string => Boolean(p)),
    );
    this.watcher = chokidar.watch(watchPaths, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 350, pollInterval: 100 },
    });
    const onChange = (): void => this.refresh();
    this.watcher.on('add', onChange).on('change', onChange);

    if (this.replayExisting) this.refresh();
  }

  private refresh(): void {
    const active = findActiveSession(this.root);
    if (!active) return;
    for (const ev of readSessionEvents(active, this.userId)) {
      if (!ev.promptText.trim()) continue; // wait until the turn has a user prompt
      const key = `${ev.sessionId}:${ev.turnIndex}`;
      if (this.emittedKeys.has(key)) continue;
      this.emittedKeys.add(key);
      this.emitter.emit('event', ev);
    }
  }

  async stop(): Promise<void> {
    await this.watcher?.close();
    this.emitter.removeAllListeners();
  }

  onPromptEvent(handler: PromptEventHandler): () => void {
    this.emitter.on('event', handler);
    return () => this.emitter.off('event', handler);
  }
}

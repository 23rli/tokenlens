import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PromptEvent } from '@tokentama/shared-types';
import type { CopilotSessionPaths } from '../copilotPaths';

const mocks = vi.hoisted(() => ({
  listCopilotSessions: vi.fn<() => CopilotSessionPaths[]>(),
  readSessionSnapshot: vi.fn<(session: CopilotSessionPaths) => {
    events: PromptEvent[];
    complete: boolean;
  }>(),
}));

vi.mock('vscode', () => ({
  Uri: { file: (fsPath: string) => ({ fsPath }) },
  RelativePattern: class {
    constructor(
      readonly base: unknown,
      readonly pattern: string,
    ) {}
  },
  workspace: {
    createFileSystemWatcher: () => ({
      onDidCreate: vi.fn(),
      onDidChange: vi.fn(),
      dispose: vi.fn(),
    }),
  },
}));

vi.mock('../copilotPaths', () => ({
  copilotSessionSourceSignature: (session: CopilotSessionPaths) =>
    session.sourceSignature ?? `${session.modifiedMs}:${session.sourceBytes ?? 'unknown'}`,
  getWorkspaceStorageRoot: () => 'storage-root',
  listCopilotSessions: mocks.listCopilotSessions,
}));

vi.mock('../copilotReader', () => ({
  readSessionSnapshot: mocks.readSessionSnapshot,
}));

import { CopilotWatcher } from '../CopilotWatcher';
import { copilotEventIdentity } from '../copilotEventIdentity';

const session = (modifiedMs: number, sourceBytes = modifiedMs): CopilotSessionPaths => ({
  sessionId: 'chat-1',
  workspaceHash: 'workspace-1',
  modifiedMs,
  sourceBytes,
});

const event = (
  sourceRequestId: string | undefined,
  turnIndex: number,
  timestamp: string,
  meteringStatus: PromptEvent['meteringStatus'] = 'metered',
): PromptEvent => ({
  eventId: `${sourceRequestId ?? 'pending'}-${turnIndex}`,
  sessionId: 'chat-1',
  sourceRequestId,
  userId: 'local-user',
  turnIndex,
  source: 'github-copilot-chat',
  timestamp,
  promptText: `prompt ${sourceRequestId ?? turnIndex}`,
  toolCalls: [],
  meteringStatus,
});

describe('CopilotWatcher', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.listCopilotSessions.mockReset();
    mocks.readSessionSnapshot.mockReset();
    mocks.readSessionSnapshot.mockImplementation(() => ({ events: [], complete: true }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits a new request after compaction reuses an old turn index', () => {
    let currentSession = session(1);
    let currentEvents = [
      event('request-a', 0, '2026-07-23T10:00:00.000Z'),
      event('request-b', 1, '2026-07-23T10:01:00.000Z'),
    ];
    mocks.listCopilotSessions.mockImplementation(() => [currentSession]);
    mocks.readSessionSnapshot.mockImplementation(() => ({ events: currentEvents, complete: true }));
    const onEvent = vi.fn();
    const watcher = new CopilotWatcher(onEvent, 'workspace-1', 'storage-root');

    watcher.start();

    // Copilot compacts request A away, renumbers B from 1 to 0, then gives the
    // genuinely new request C the old index 1. Index-based dedup skipped C.
    currentSession = session(2);
    currentEvents = [
      event('request-b', 0, '2026-07-23T10:01:00.000Z'),
      event('request-c', 1, '2026-07-23T10:02:00.000Z'),
    ];
    (watcher as unknown as { refresh(): void }).refresh();

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent.mock.calls[0][0]).toMatchObject({
      sourceRequestId: 'request-c',
      turnIndex: 1,
    });
    expect(onEvent.mock.calls[0][1]).toEqual({ preliminary: false });
    watcher.dispose();
  });

  it('uses timestamp identity when a stable request ID is unavailable', () => {
    const original = event(undefined, 9, '2026-07-23T11:00:00.000Z');
    const compacted = { ...original, turnIndex: 2 };
    const first = copilotEventIdentity(original, 'workspace-1');
    const second = copilotEventIdentity(compacted, 'workspace-1');

    expect(first.primary).toBe(second.primary);
    expect(first.primary).toContain('timestamp');
  });

  it('does not collapse distinct stable requests that share a timestamp', () => {
    let currentSession = session(1);
    let currentEvents = [event('request-a', 0, '2026-07-23T11:30:00.000Z')];
    mocks.listCopilotSessions.mockImplementation(() => [currentSession]);
    mocks.readSessionSnapshot.mockImplementation(() => ({ events: currentEvents, complete: true }));
    const onEvent = vi.fn();
    const watcher = new CopilotWatcher(onEvent, 'workspace-1', 'storage-root');
    watcher.start();

    currentSession = session(2);
    currentEvents = [
      ...currentEvents,
      event('request-b', 1, '2026-07-23T11:30:00.000Z'),
    ];
    (watcher as unknown as { refresh(): void }).refresh();

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent.mock.calls[0][0].sourceRequestId).toBe('request-b');
    watcher.dispose();
  });

  it('does not collapse request-ID-less turns that share a timestamp', () => {
    let currentSession = session(1);
    let currentEvents = [event(undefined, 0, '2026-07-23T11:35:00.000Z')];
    mocks.listCopilotSessions.mockImplementation(() => [currentSession]);
    mocks.readSessionSnapshot.mockImplementation(() => ({ events: currentEvents, complete: true }));
    const onEvent = vi.fn();
    const watcher = new CopilotWatcher(onEvent, 'workspace-1', 'storage-root');
    watcher.start();

    currentSession = session(2);
    currentEvents = [
      ...currentEvents,
      event(undefined, 1, '2026-07-23T11:35:00.000Z'),
    ];
    (watcher as unknown as { refresh(): void }).refresh();

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent.mock.calls[0][0].turnIndex).toBe(1);
    watcher.dispose();
  });

  it('detects source growth even when the filesystem mtime is unchanged', () => {
    let currentSession = session(1, 100);
    let currentEvents = [event('request-a', 0, '2026-07-23T11:45:00.000Z')];
    mocks.listCopilotSessions.mockImplementation(() => [currentSession]);
    mocks.readSessionSnapshot.mockImplementation(() => ({ events: currentEvents, complete: true }));
    const onEvent = vi.fn();
    const watcher = new CopilotWatcher(onEvent, 'workspace-1', 'storage-root');
    watcher.start();

    currentSession = session(1, 150);
    currentEvents = [
      ...currentEvents,
      event('request-b', 1, '2026-07-23T11:46:00.000Z'),
    ];
    (watcher as unknown as { refresh(): void }).refresh();

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent.mock.calls[0][0].sourceRequestId).toBe('request-b');
    watcher.dispose();
  });

  it('prunes identity bookkeeping after a session stays absent for an hour', () => {
    vi.setSystemTime(new Date('2026-07-23T11:50:00.000Z'));
    let sessions = [session(1)];
    mocks.listCopilotSessions.mockImplementation(() => sessions);
    mocks.readSessionSnapshot.mockReturnValue({
      events: [event('request-a', 0, '2026-07-23T11:49:00.000Z')],
      complete: true,
    });
    const watcher = new CopilotWatcher(vi.fn(), 'workspace-1', 'storage-root');
    watcher.start();
    expect(watcher.diagnostics()).toMatchObject({ seen: 0, trackedSessions: 1 });

    sessions = [];
    (watcher as unknown as { refresh(): void }).refresh();
    expect(watcher.diagnostics()).toMatchObject({ seen: 0, trackedSessions: 1 });

    vi.setSystemTime(new Date('2026-07-23T12:50:00.001Z'));
    (watcher as unknown as { refresh(): void }).refresh();
    expect(watcher.diagnostics()).toMatchObject({ seen: 0, trackedSessions: 0 });
    watcher.dispose();
  });

  it('does not parse every historical chat during watcher startup', () => {
    mocks.listCopilotSessions.mockReturnValue(
      Array.from({ length: 100 }, (_, index) => ({
        sessionId: `chat-${index}`,
        workspaceHash: 'workspace-1',
        modifiedMs: index,
        sourceBytes: index + 1,
      })),
    );
    const watcher = new CopilotWatcher(vi.fn(), 'workspace-1', 'storage-root');

    watcher.start();

    expect(mocks.readSessionSnapshot).not.toHaveBeenCalled();
    expect(watcher.diagnostics().trackedSessions).toBe(100);
    watcher.dispose();
  });

  it('retries an unchanged source signature after an incomplete read', () => {
    const currentSession = session(2, 200);
    const currentEvent = event('request-recovered', 0, '2026-07-23T11:55:00.000Z');
    mocks.listCopilotSessions.mockReturnValue([currentSession]);
    mocks.readSessionSnapshot
      .mockReturnValueOnce({ events: [currentEvent], complete: false })
      .mockReturnValueOnce({ events: [currentEvent], complete: true });
    const onEvent = vi.fn();
    const watcher = new CopilotWatcher(onEvent, 'workspace-1', 'storage-root');

    (watcher as unknown as { refresh(): void }).refresh();
    expect(onEvent).not.toHaveBeenCalled();

    (watcher as unknown as { refresh(): void }).refresh();
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent.mock.calls[0][0].sourceRequestId).toBe('request-recovered');
    watcher.dispose();
  });

  it('migrates a timestamp-keyed preliminary event when its request ID appears', () => {
    let nowSession = session(1);
    const preliminary = event(undefined, 0, '2026-07-23T12:00:00.000Z', 'pending');
    let events = [preliminary];
    mocks.listCopilotSessions.mockImplementation(() => [nowSession]);
    mocks.readSessionSnapshot.mockImplementation(() => ({ events, complete: true }));
    const onEvent = vi.fn();
    const watcher = new CopilotWatcher(onEvent, 'workspace-1', 'storage-root');

    // Invoke refresh directly so this is a new event rather than startup history.
    (watcher as unknown as { refresh(): void }).refresh();
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent.mock.calls[0][1]).toEqual({ preliminary: true });

    nowSession = session(2);
    events = [{
      ...event('request-final', 0, '2026-07-23T12:00:00.000Z', 'metered'),
      promptText: `${preliminary.promptText} with finalized source context`,
    }];
    (watcher as unknown as { refresh(): void }).refresh();

    expect(onEvent).toHaveBeenCalledTimes(2);
    expect(onEvent.mock.calls[1][0].sourceRequestId).toBe('request-final');
    expect(onEvent.mock.calls[1][1]).toEqual({ preliminary: false });
    expect(watcher.diagnostics().pending).toBe(0);
    watcher.dispose();
  });
});

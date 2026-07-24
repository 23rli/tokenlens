import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  Uri: {
    joinPath: (base: { fsPath: string }, ...parts: string[]) => ({
      fsPath: [base.fsPath, ...parts].join('/'),
    }),
  },
}));

vi.mock('../html', () => ({
  buildDashboardHtml: () => '<html></html>',
}));

import { DashboardViewProvider } from '../DashboardViewProvider';

describe('DashboardViewProvider refresh scheduling', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('posts current state before running a deferred heavy refresh', () => {
    let receive: ((message: { type: string }) => void) | undefined;
    let visibility: (() => void) | undefined;
    let disposed: (() => void) | undefined;
    const postMessage = vi.fn(() => Promise.resolve(true));
    const refresh = vi.fn();
    const view = {
      visible: true,
      webview: {
        options: {},
        html: '',
        postMessage,
        onDidReceiveMessage: (handler: typeof receive) => {
          receive = handler;
          return { dispose: vi.fn() };
        },
      },
      onDidChangeVisibility: (handler: () => void) => {
        visibility = handler;
        return { dispose: vi.fn() };
      },
      onDidDispose: (handler: () => void) => {
        disposed = handler;
        return { dispose: vi.fn() };
      },
    };
    const store = {
      getState: () => ({ captureEnabled: true }),
      onDidChange: () => ({ dispose: vi.fn() }),
    };
    const provider = new DashboardViewProvider(
      { fsPath: 'extension' } as never,
      store as never,
      {
        refresh,
        toggleCapture: vi.fn(),
        manage: vi.fn(),
        exportLedger: vi.fn(),
        openBusinessToolSettings: vi.fn(),
        setBusinessToolTracking: vi.fn(),
        setBusinessToolGroup: vi.fn(),
      },
    );
    provider.resolveWebviewView(view as never);

    receive?.({ type: 'ready' });
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'state' }));
    expect(refresh).not.toHaveBeenCalled();

    vi.runOnlyPendingTimers();
    expect(refresh).toHaveBeenCalledTimes(1);

    visibility?.();
    disposed?.();
    vi.runOnlyPendingTimers();
    expect(refresh).toHaveBeenCalledTimes(1);
    provider.dispose();
  });
});
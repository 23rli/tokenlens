import * as vscode from 'vscode';
import * as path from 'node:path';
import { TamaStore } from './state/tamaStore';
import { CopilotWatcher } from './capture/CopilotWatcher';
import { getWorkspaceStorageRoot, listCopilotSessions } from './capture/copilotPaths';
import {
  normalizeCaptureScope,
  scopeHash,
  selectSessionsInScope,
} from './capture/sessionScope';
import { readSessionEvents, readSessionTitle } from './capture/copilotReader';
import { StatusBar } from './status/statusBar';
import { DashboardViewProvider } from './webview/DashboardViewProvider';
import { ForecastService } from './analysis/forecastService';
import { buildForecastView } from './analysis/forecastView';
import { configuredCostUsd, creditAmount } from './analysis/cost';
import type { ForecastView } from './webview/contract';
import type { PromptEvent, ContextSlice } from '@tokentama/shared-types';

const FORECAST_HISTORY_LIMIT = 200;

export function activate(context: vscode.ExtensionContext): void {
  const store = new TamaStore();
  context.subscriptions.push(store);
  // When this window's extension started — used to scope EMPTY windows (which have
  // no workspace hash) to chats touched since the window opened, so they don't
  // inherit the previous window's chat.
  const activatedAt = Date.now();

  // Optional per-workspace pin: the session id the user locked onto so Token Lens
  // keeps tracking it instead of following the newest chat (resolves same-folder /
  // two-empty-window ties). Stored in workspaceState so it survives a reload.
  const PINNED_KEY = 'tokenlens.pinnedSessionId';
  const getPinnedSessionId = (): string | undefined =>
    context.workspaceState.get<string>(PINNED_KEY);

  const output = vscode.window.createOutputChannel('Token Lens');
  context.subscriptions.push(output);
  const log = (message: string): void =>
    output.appendLine(`[${new Date().toLocaleTimeString()}] ${message}`);
  log('Token Lens activated.');

  const workspaceHash = deriveWorkspaceHash(context);
  const workspaceStorageRoot = deriveWorkspaceStorageRoot(context);
  log(
    workspaceHash
      ? `Capture scoped to this window's workspace storage (${workspaceHash}).`
      : 'No workspace folder open — capture starts empty and follows chats touched after this window opened. Open a folder for stronger isolation.',
  );

  // Precognition core: rebuild the live forecast from the ACTIVE session on disk
  // (which carries real metered tokens for every completed turn), so it appears
  // immediately and never depends on lagging forward-only capture. Model-agnostic
  // and free (pure arithmetic). Refreshed on each capture event + on a timer.
  // Cache the (expensive) whole-chat aggregate so the 5s timer only re-reads every
  // conversation when something on disk actually changed.
  let chatAggCache:
    | {
        signature: string;
        day: string;
        breakdown: ContextSlice[];
        input: number;
        output: number;
        credits: number;
        creditsEstimated: boolean;
        todayInput: number;
        todayOutput: number;
        todayCredits: number;
        todayCreditsEstimated: boolean;
      }
    | undefined;
  let lastRefreshError: string | undefined;
  const refreshForecast = (): void => {
    // The capture toggle is a privacy boundary, not just a watcher preference.
    // When off, no timer/focus/view refresh may read Copilot's files.
    if (!store.captureEnabled) return;
    try {
      const scope = normalizeCaptureScope(
        vscode.workspace.getConfiguration('tokenlens.capture').get('scope', 'window'),
      );
      // Sessions in scope for THIS window (folder / scope=all / empty-window since
      // open), with the active chat chosen pin-aware — see sessionScope.ts.
      const { sessions: allSessions, active: session } = selectSessionsInScope(
        listCopilotSessions(workspaceStorageRoot, scopeHash(scope, workspaceHash)),
        { scope, workspaceHash, activatedAt, pinnedSessionId: getPinnedSessionId() },
      );
      if (!session) {
        chatAggCache = undefined;
        store.clearForecast();
        return;
      }
      const events = readSessionEvents(session);
      if (events.length === 0) {
        store.clearForecast();
        return;
      }
      // Metered turns drive the forecast HISTORY; the newest turn overall is the
      // CURRENT prompt the user just wrote — it may not be metered yet (chatSessions
      // lags the transcript), but we still show it and predict from it so the panel
      // tracks what's actually happening instead of the last fully-billed turn.
      const real = events.filter(
        (e) => e.tokens && e.tokens.estimated === false && (e.tokens.inputTokens ?? 0) > 0,
      );
      const current = events[events.length - 1];
      const lastReal = real.length ? real[real.length - 1] : undefined;
      const currentIsMetered = !!(
        current.tokens &&
        current.tokens.estimated === false &&
        (current.tokens.inputTokens ?? 0) > 0
      );
      // Every user turn (metered or not) for the History list — so a just-sent turn
      // shows up immediately as "pending" and fills in once Copilot meters it.
      const allTurns = events
        .filter((e) => e.promptText.trim())
        .map((e) => ({
          prompt: e.promptText.replace(/\s+/g, ' ').trim().slice(0, 70),
          tokens: e.tokens?.inputTokens ?? 0,
          metered: !!(e.tokens && e.tokens.estimated === false && (e.tokens.inputTokens ?? 0) > 0),
        }));

      const fs = new ForecastService();
      // Replaying accuracy is intentionally quadratic in the calibration window;
      // cap it so pathological multi-thousand-turn chats cannot stall the host.
      for (const e of real.slice(-FORECAST_HISTORY_LIMIT)) {
        fs.recordTurn(
          {
            promptTokens: e.tokens!.inputTokens,
            completionTokens: e.tokens!.outputTokens,
            promptText: e.promptText,
            toolCalls: e.toolCalls?.length,
          },
          { maxInputTokens: e.model?.maxInputTokens, contextMaxTokens: e.model?.contextMaxTokens },
        );
      }
      // While a turn is in flight, estimate that known prompt honestly. Once it
      // is metered, switch back to a true next-turn structural forecast.
      const forecastTarget: ForecastView['forecastTarget'] = currentIsMetered
        ? 'next'
        : 'pending';
      const forecast = fs.forecastNext(forecastTarget === 'pending' ? current.promptText : '');
      const modelEvent = lastReal ?? current;
      // Session-wide breakdown: sum each category's tokens across every real turn.
      const sessionAgg = new Map<string, { category: string; label: string; tokens: number }>();
      for (const e of real) {
        for (const s of e.tokens?.contextBreakdown ?? []) {
          const cur2 = sessionAgg.get(s.label) ?? { category: s.category, label: s.label, tokens: 0 };
          cur2.tokens += s.tokens;
          sessionAgg.set(s.label, cur2);
        }
      }
      const sessionInputTokens = real.reduce((sum, e) => sum + (e.tokens?.inputTokens ?? 0), 0);
      const sessionOutputTokens = real.reduce((sum, e) => sum + (e.tokens?.outputTokens ?? 0), 0);
      // This-chat credit total (real metered when available, else estimated).
      let sessionCredits = 0;
      let sessionCreditsEstimated = real.length === 0;
      for (const e of real) {
        const credit = creditAmount(e.tokens);
        sessionCredits += credit.value;
        sessionCreditsEstimated ||= credit.estimated;
      }
      const sessionBreakdown = [...sessionAgg.values()].map((s) => ({
        category: s.category,
        label: s.label,
        tokens: s.tokens,
        pct: sessionInputTokens > 0 ? Math.round((s.tokens / sessionInputTokens) * 100) : 0,
      }));
      // Whole-chat breakdown: aggregate every conversation in scope (this window)
      // so the split reflects total spend and doesn't reset when a new chat starts.
      const sessionSignature = allSessions
        .map((s) => `${s.workspaceHash}/${s.sessionId}:${s.modifiedMs}`)
        .join('|');
      // 'Today' = turns whose real timestamp falls on the local calendar day; the
      // day key invalidates the cache at midnight so the figure rolls over.
      const todayKey = new Date().toDateString();
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const todayMs = startOfToday.getTime();
      const startOfTomorrow = new Date(startOfToday);
      startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
      const tomorrowMs = startOfTomorrow.getTime();
      if (
        !chatAggCache ||
        chatAggCache.signature !== sessionSignature ||
        chatAggCache.day !== todayKey
      ) {
        const chatAgg = new Map<string, { category: string; label: string; tokens: number }>();
        let chatInput = 0;
        let chatOutput = 0;
        let chatCredits = 0;
        let chatCreditsEstimated = false;
        let todayInput = 0;
        let todayOutput = 0;
        let todayCredits = 0;
        let todayCreditsEstimated = false;
        for (const s of allSessions) {
          const evs = s.sessionId === session.sessionId ? events : readSessionEvents(s);
          for (const e of evs) {
            const t = e.tokens;
            if (!t || t.estimated !== false || (t.inputTokens ?? 0) <= 0) continue;
            chatInput += t.inputTokens ?? 0;
            chatOutput += t.outputTokens ?? 0;
            const credit = creditAmount(t);
            chatCredits += credit.value;
            chatCreditsEstimated ||= credit.estimated;
            const ts = e.timestamp ? Date.parse(e.timestamp) : NaN;
            if (!Number.isNaN(ts) && ts >= todayMs && ts < tomorrowMs) {
              todayInput += t.inputTokens ?? 0;
              todayOutput += t.outputTokens ?? 0;
              todayCredits += credit.value;
              todayCreditsEstimated ||= credit.estimated;
            }
            for (const sl of t.contextBreakdown ?? []) {
              const cur3 = chatAgg.get(sl.label) ?? { category: sl.category, label: sl.label, tokens: 0 };
              cur3.tokens += sl.tokens;
              chatAgg.set(sl.label, cur3);
            }
          }
        }
        chatAggCache = {
          signature: sessionSignature,
          day: todayKey,
          input: chatInput,
          output: chatOutput,
          credits: chatCredits,
          creditsEstimated: chatInput === 0 || chatCreditsEstimated,
          todayInput,
          todayOutput,
          todayCredits,
          todayCreditsEstimated: todayInput === 0 || todayCreditsEstimated,
          breakdown: [...chatAgg.values()].map((s) => ({
            category: s.category,
            label: s.label,
            tokens: s.tokens,
            pct: chatInput > 0 ? Math.round((s.tokens / chatInput) * 100) : 0,
          })),
        };
      }
      // Cost is derived from the (config) blended $/1M-token rate applied to the
      // whole-chat token total — computed fresh each tick so a rate change shows up
      // without waiting for a file to change.
      const usdPerMillionTokens = vscode.workspace
        .getConfiguration('tokenlens.impact')
        .get<number>('usdPerMillionTokens', 0.58);
      const usdPerCredit = vscode.workspace
        .getConfiguration('tokenlens.impact')
        .get<number>('usdPerCredit', 0);
      const costOf = (tokens: number, credits: number): number | undefined =>
        configuredCostUsd(tokens, credits, usdPerMillionTokens, usdPerCredit);
      const chatTotalTokens = chatAggCache.input + chatAggCache.output;
      const sessionTotalTokens = sessionInputTokens + sessionOutputTokens;
      const todayTotalTokens = chatAggCache.todayInput + chatAggCache.todayOutput;
      const chatCostUsd = costOf(chatTotalTokens, chatAggCache.credits);
      const sessionCostUsd = costOf(sessionTotalTokens, sessionCredits);
      const todayCostUsd = costOf(todayTotalTokens, chatAggCache.todayCredits);
      const lastTurnTotalTokens = lastReal
        ? (lastReal.tokens?.inputTokens ?? 0) + (lastReal.tokens?.outputTokens ?? 0)
        : undefined;
      const lastRealCredit = creditAmount(lastReal?.tokens);
      const lastTurnCredits = lastReal && !lastRealCredit.estimated
        ? lastRealCredit.value
        : undefined;
      const lastTurnCostUsd = lastTurnTotalTokens != null
        ? costOf(lastTurnTotalTokens, lastRealCredit.value)
        : undefined;
      const lastRealTimestamp = lastReal?.timestamp ? Date.parse(lastReal.timestamp) : NaN;
      const lastTurnIsToday =
        !Number.isNaN(lastRealTimestamp) &&
        lastRealTimestamp >= todayMs &&
        lastRealTimestamp < tomorrowMs;
      store.setForecast(
        buildForecastView(forecast, fs.accuracy(), modelEvent, {
          forecastTarget,
          sessionShortId: session.sessionId.slice(0, 8),
          sessionTitle: readSessionTitle(session),
          lastPromptPreview: current.promptText.replace(/\s+/g, ' ').trim().slice(0, 140),
          turnCount: real.length,
          contextSeries: real.map((e) => e.tokens!.inputTokens),
          turnPrompts: real.map((e) => e.promptText.replace(/\s+/g, ' ').trim().slice(0, 70)),
          realLastInputTokens: lastReal?.tokens?.inputTokens,
          realLastTotalTokens: lastTurnTotalTokens,
          realLastCredits: lastTurnCredits,
          realLastCostUsd: lastTurnCostUsd,
          realLastIsToday: lastTurnIsToday,
          contextBreakdown: lastReal?.tokens?.contextBreakdown,
          contextInputTokens: lastReal?.tokens?.inputTokens,
          sessionBreakdown: sessionBreakdown.length ? sessionBreakdown : undefined,
          sessionInputTokens: sessionInputTokens || undefined,
          chatBreakdown: chatAggCache.breakdown.length ? chatAggCache.breakdown : undefined,
          chatInputTokens: chatAggCache.input || undefined,
          chatSessionCount: allSessions.length || undefined,
          aggregateScope:
            scope === 'all' ? 'allWindows' : workspaceHash ? 'workspace' : 'emptyWindow',
          chatTotalTokens: chatTotalTokens || undefined,
          chatCredits: chatAggCache.credits || undefined,
          chatCreditsEstimated: chatAggCache.creditsEstimated,
          chatCostUsd,
          sessionTotalTokens: sessionTotalTokens || undefined,
          sessionCredits: sessionCredits || undefined,
          sessionCreditsEstimated,
          sessionCostUsd,
          todayTotalTokens: todayTotalTokens || undefined,
          todayCredits: chatAggCache.todayCredits || undefined,
          todayCreditsEstimated: chatAggCache.todayCreditsEstimated,
          todayCostUsd,
          allTurns,
        }),
        modelEvent.model,
      );
      lastRefreshError = undefined;
    } catch (error) {
      const detail = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
      if (detail !== lastRefreshError) {
        log(`Forecast refresh failed: ${detail}`);
        lastRefreshError = detail;
      }
    }
  };

  const statusBar = new StatusBar();
  context.subscriptions.push(statusBar);

  context.subscriptions.push(store.onDidChange((state) => statusBar.update(state)));
  statusBar.update(store.getState());

  let watcher: CopilotWatcher | undefined;
  const startWatcher = (): void => {
    if (watcher) return;
    const captureCfg = vscode.workspace.getConfiguration('tokenlens.capture');
    // Scope to this window's workspace when it has one; empty windows watch globally
    // (there's no window to scope to) so they still track the active chat.
    const scope = normalizeCaptureScope(captureCfg.get('scope', 'window'));
    const hashScope = scope !== 'all' && workspaceHash ? workspaceHash : undefined;
    watcher = new CopilotWatcher((event, meta) => {
      if (!meta?.preliminary) {
        log(`capture: chat ${event.sessionId.slice(0, 8)}, turn ${event.turnIndex}`);
        // Precognition: rebuild the next-turn forecast from the active session's
        // real metered tokens and refresh the panel (skeletons fill in).
        refreshForecast();
      }
    }, hashScope, workspaceStorageRoot);
    watcher.start();
    refreshForecast();
    log(
      watcher.isAvailable()
        ? 'Passive capture started — watching Copilot chat sessions on disk.'
        : 'Passive capture started, but no Copilot chat sessions were found yet.',
    );
  };
  const stopWatcher = (): void => {
    watcher?.dispose();
    watcher = undefined;
  };
  context.subscriptions.push({ dispose: stopWatcher });

  const toggleCapture = async (): Promise<void> => {
    const next = !store.captureEnabled;
    try {
      await store.setCaptureEnabled(next);
      if (next) startWatcher();
      else stopWatcher();
      log(`passive capture ${next ? 'enabled' : 'disabled'}.`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      log(`Could not ${next ? 'enable' : 'disable'} capture: ${detail}`);
      void vscode.window.showErrorMessage(`Token Lens could not update capture: ${detail}`);
    }
  };

  const provider = new DashboardViewProvider(context.extensionUri, store, {
    toggleCapture,
    refresh: refreshForecast,
  });
  context.subscriptions.push(provider);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(DashboardViewProvider.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('tokenlens.openDashboard', () =>
      vscode.commands.executeCommand('tokenlens.dashboard.focus'),
    ),
    vscode.commands.registerCommand('tokenlens.toggleCapture', toggleCapture),
    vscode.commands.registerCommand('tokenlens.pinChat', async () => {
      try {
        const scope = normalizeCaptureScope(
          vscode.workspace.getConfiguration('tokenlens.capture').get('scope', 'window'),
        );
        const { active } = selectSessionsInScope(
          listCopilotSessions(workspaceStorageRoot, scopeHash(scope, workspaceHash)),
          { scope, workspaceHash, activatedAt, pinnedSessionId: undefined },
        );
        if (!active) {
          void vscode.window.showInformationMessage(
            'Token Lens: no active chat to pin yet — open Copilot Chat here and send a prompt first.',
          );
          return;
        }
        await context.workspaceState.update(PINNED_KEY, active.sessionId);
        log(`pinned chat ${active.sessionId.slice(0, 8)}`);
        void vscode.window.showInformationMessage(
          `Token Lens pinned to this chat (${active.sessionId.slice(0, 8)}). It will keep tracking this chat until you unpin.`,
        );
        refreshForecast();
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        log(`Could not pin chat: ${detail}`);
        void vscode.window.showErrorMessage(`Token Lens could not pin this chat: ${detail}`);
      }
    }),
    vscode.commands.registerCommand('tokenlens.unpinChat', async () => {
      await context.workspaceState.update(PINNED_KEY, undefined);
      log('unpinned chat');
      void vscode.window.showInformationMessage(
        'Token Lens unpinned — following the newest chat again.',
      );
      refreshForecast();
    }),
    vscode.commands.registerCommand('tokenlens.diagnostics', () => {
      try {
        const scope = normalizeCaptureScope(
          vscode.workspace.getConfiguration('tokenlens.capture').get('scope', 'window'),
        );
        const { sessions, active } = selectSessionsInScope(
          listCopilotSessions(workspaceStorageRoot, scopeHash(scope, workspaceHash)),
          { scope, workspaceHash, activatedAt, pinnedSessionId: getPinnedSessionId() },
        );
        const live = watcher?.diagnostics();
        log('--- capture diagnostics ---');
        log(`enabled=${store.captureEnabled} scope=${scope} workspace=${workspaceHash ?? 'empty'}`);
        log(`sessions=${sessions.length} active=${active?.sessionId.slice(0, 8) ?? 'none'} pinned=${getPinnedSessionId()?.slice(0, 8) ?? 'none'}`);
        log(`watcher=${watcher ? 'running' : 'stopped'} seen=${live?.seen ?? 0} pending=${live?.pending ?? 0} tracked=${live?.trackedSessions ?? 0}`);
        output.show(true);
        void vscode.window.showInformationMessage(
          `Token Lens diagnostics: ${sessions.length} chat${sessions.length === 1 ? '' : 's'} visible; active ${active?.sessionId.slice(0, 8) ?? 'none'}. Details are in Output → Token Lens.`,
        );
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        log(`Capture diagnostics failed: ${detail}`);
        void vscode.window.showErrorMessage(`Token Lens diagnostics failed: ${detail}`);
      }
    }),
    vscode.commands.registerCommand('tokenlens.captureSelfTest', () => {
      try {
        const scope = normalizeCaptureScope(
          vscode.workspace.getConfiguration('tokenlens.capture').get('scope', 'window'),
        );
        const { active } = selectSessionsInScope(
          listCopilotSessions(workspaceStorageRoot, scopeHash(scope, workspaceHash)),
          { scope, workspaceHash, activatedAt, pinnedSessionId: getPinnedSessionId() },
        );
        if (!active) {
          void vscode.window.showWarningMessage(
            'Token Lens self-test: no in-scope Copilot chat found. Send a Copilot prompt in this window, then retry.',
          );
          return;
        }
        const events = readSessionEvents(active);
        const metered = events.filter(
          (event) => event.tokens?.estimated === false && (event.tokens.inputTokens ?? 0) > 0,
        ).length;
        const result = `${events.length} turn${events.length === 1 ? '' : 's'}, ${metered} metered`;
        log(`capture self-test: PASS — chat ${active.sessionId.slice(0, 8)}, ${result}.`);
        void vscode.window.showInformationMessage(`Token Lens self-test passed: ${result}.`);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        log(`Capture self-test failed: ${detail}`);
        void vscode.window.showErrorMessage(`Token Lens self-test failed: ${detail}`);
      }
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      const captureEnabledChanged = event.affectsConfiguration(
        'tokenlens.passiveCapture.enabled',
      );
      const scopeChanged = event.affectsConfiguration('tokenlens.capture.scope');
      if (captureEnabledChanged) {
        const enabled = vscode.workspace
          .getConfiguration('tokenlens.passiveCapture')
          .get<boolean>('enabled', true);
        store.syncCaptureEnabled(enabled);
        if (enabled) startWatcher();
        else stopWatcher();
      }
      if (scopeChanged) {
        chatAggCache = undefined;
        stopWatcher();
        if (store.captureEnabled) startWatcher();
      }
      if (
        captureEnabledChanged ||
        scopeChanged ||
        event.affectsConfiguration('tokenlens.impact')
      ) {
        refreshForecast();
        store.ping();
      }
    }),
  );

  if (store.captureEnabled) startWatcher();

  // Backstop: refresh the forecast shortly after activation and on a short timer,
  // so the panel stays live on its own — no reload, no click needed. Also refresh
  // the moment this window regains focus (you've usually just finished a turn).
  const warmupTimer = setTimeout(refreshForecast, 800);
  const forecastTimer = setInterval(refreshForecast, 1500);
  context.subscriptions.push({
    dispose: () => {
      clearTimeout(warmupTimer);
      clearInterval(forecastTimer);
    },
  });
  context.subscriptions.push(
    vscode.window.onDidChangeWindowState((s) => {
      if (s.focused) refreshForecast();
    }),
  );
}

export function deactivate(): void {
  /* disposables are cleaned up via context.subscriptions */
}

function deriveWorkspaceHash(context: vscode.ExtensionContext): string | undefined {
  // context.storageUri = .../User/workspaceStorage/<hash>/<extensionId>
  const storage = context.storageUri?.fsPath;
  if (!storage) return undefined;
  return path.basename(path.dirname(storage));
}

function deriveWorkspaceStorageRoot(context: vscode.ExtensionContext): string {
  // globalStorageUri = .../User/globalStorage/<publisher>.<extension>; deriving
  // from VS Code itself handles Stable/Insiders, portable data dirs, macOS/Linux,
  // and remote extension hosts more reliably than hard-coding APPDATA.
  const globalStorage = context.globalStorageUri?.fsPath;
  return globalStorage
    ? path.join(path.dirname(path.dirname(globalStorage)), 'workspaceStorage')
    : getWorkspaceStorageRoot();
}

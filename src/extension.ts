import * as vscode from 'vscode';
import type { CoachConfig, CoachProvider } from '@ecoprompt/llm-adapters';
import { GuardianStore } from './state/guardianStore';
import { ScoreService } from './core/scoreService';
import { CopilotWatcher } from './capture/CopilotWatcher';
import { StatusBar } from './status/statusBar';
import { DashboardViewProvider } from './webview/DashboardViewProvider';

const SECRET_KEY = 'ecoprompt.llmApiKey';

export function activate(context: vscode.ExtensionContext): void {
  const store = new GuardianStore(context);

  const getCoachConfig = async (): Promise<CoachConfig> => {
    const cfg = vscode.workspace.getConfiguration('ecoprompt.coaching');
    const apiKey = await context.secrets.get(SECRET_KEY);
    return {
      provider: cfg.get<string>('llmProvider', 'none') as CoachProvider,
      endpoint: cfg.get<string>('endpoint') || undefined,
      apiKey: apiKey || undefined,
      deployment: cfg.get<string>('model') || undefined,
      apiVersion: '2024-10-21',
      timeoutMs: 12000,
    };
  };

  const scoreService = new ScoreService(store, getCoachConfig);

  const statusBar = new StatusBar();
  context.subscriptions.push(statusBar);
  store.onDidChange((state) => statusBar.update(state));
  statusBar.update(store.getState());

  let watcher: CopilotWatcher | undefined;
  const startWatcher = (): void => {
    if (watcher) return;
    watcher = new CopilotWatcher((event) => void scoreService.scoreEvent(event, 'copilot'));
    watcher.start();
    context.subscriptions.push(watcher);
  };
  const stopWatcher = (): void => {
    watcher?.dispose();
    watcher = undefined;
  };

  const toggleCapture = (): void => {
    const next = !store.captureEnabled;
    void store.setCaptureEnabled(next);
    if (next) startWatcher();
    else stopWatcher();
    void vscode.window.showInformationMessage(
      `EcoPrompt passive capture ${next ? 'enabled' : 'disabled'}.`,
    );
  };

  const provider = new DashboardViewProvider(context.extensionUri, store, { toggleCapture });
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(DashboardViewProvider.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('ecoprompt.scorePrompt', () =>
      scoreManualPrompt(scoreService),
    ),
    vscode.commands.registerCommand('ecoprompt.openDashboard', () =>
      vscode.commands.executeCommand('ecoprompt.dashboard.focus'),
    ),
    vscode.commands.registerCommand('ecoprompt.toggleCapture', toggleCapture),
    vscode.commands.registerCommand('ecoprompt.resetEcosystem', () => {
      store.reset();
      void vscode.window.showInformationMessage('EcoPrompt ecosystem reset.');
    }),
    vscode.commands.registerCommand('ecoprompt.setLlmApiKey', () => setLlmApiKey(context)),
  );

  if (store.captureEnabled) startWatcher();
}

export function deactivate(): void {
  /* disposables are cleaned up via context.subscriptions */
}

async function scoreManualPrompt(scoreService: ScoreService): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  const selected =
    editor && !editor.selection.isEmpty
      ? editor.document.getText(editor.selection)
      : undefined;

  const text =
    selected ??
    (await vscode.window.showInputBox({
      prompt: 'Paste a prompt to score for efficiency',
      placeHolder: 'e.g. "Could you please, if it is not too much trouble, kindly help me…"',
      ignoreFocusOut: true,
    }));

  if (!text || !text.trim()) return;

  const score = await scoreService.scoreManualText(text);
  await vscode.commands.executeCommand('ecoprompt.dashboard.focus');
  void vscode.window.showInformationMessage(`EcoPrompt score: ${Math.round(score)} / 100`);
}

async function setLlmApiKey(context: vscode.ExtensionContext): Promise<void> {
  const key = await vscode.window.showInputBox({
    prompt: 'Enter the API key for your coaching LLM provider (stored securely)',
    password: true,
    ignoreFocusOut: true,
  });
  if (key === undefined) return;
  if (key.trim() === '') {
    await context.secrets.delete(SECRET_KEY);
    void vscode.window.showInformationMessage('EcoPrompt coaching API key cleared.');
  } else {
    await context.secrets.store(SECRET_KEY, key);
    void vscode.window.showInformationMessage('EcoPrompt coaching API key saved.');
  }
}

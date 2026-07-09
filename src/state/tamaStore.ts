import * as vscode from 'vscode';
import type { ModelInfo } from '@tokentama/shared-types';
import type { TamaState, ForecastView } from '../webview/contract';
import { computeMetrics } from '../metrics/metrics';

/**
 * Minimal state carrier for Token Lens. Holds the capture toggle, the active
 * model, and the live disk-read forecast, and emits a full snapshot to the
 * webview + status bar on every change. (The pre-pivot pet/health/scoring state
 * has been removed — the dashboard is driven entirely by the on-disk forecast.)
 */
export class TamaStore {
  private readonly _onDidChange = new vscode.EventEmitter<TamaState>();
  readonly onDidChange = this._onDidChange.event;

  private _captureEnabled: boolean;
  private model?: ModelInfo;
  private forecast?: ForecastView;

  constructor() {
    this._captureEnabled = vscode.workspace
      .getConfiguration('tokentama.passiveCapture')
      .get<boolean>('enabled', true);
  }

  get captureEnabled(): boolean {
    return this._captureEnabled;
  }

  async setCaptureEnabled(enabled: boolean): Promise<void> {
    this._captureEnabled = enabled;
    await vscode.workspace
      .getConfiguration('tokentama.passiveCapture')
      .update('enabled', enabled, vscode.ConfigurationTarget.Global);
    this.emit();
  }

  /** Update the live next-turn forecast (precognition) + active model; refresh UI. */
  setForecast(forecast: ForecastView, model?: ModelInfo): void {
    this.forecast = forecast;
    if (model) this.model = model;
    this.emit();
  }

  getState(): TamaState {
    const impactCfg = vscode.workspace.getConfiguration('tokentama.impact');
    // Zero-state fallback metrics (ImpactTrio prefers the whole-chat forecast
    // totals when present). Kept so the cost tiles render before a forecast lands.
    const metrics = computeMetrics(
      [],
      { tipsShown: 0, tipsApplied: 0 },
      {
        whPerThousandTokens: 0,
        gridGramsCo2PerKwh: 0,
        co2GramsPer1kTokens: 0,
        waterMlPer1kTokens: 0,
        usdPerCredit: impactCfg.get<number>('usdPerCredit', 0),
        usdPerMillionTokens: impactCfg.get<number>('usdPerMillionTokens', 0.58),
      },
    );
    return {
      metrics,
      model: this.model,
      captureEnabled: this._captureEnabled,
      forecast: this.forecast,
    };
  }

  private emit(): void {
    this._onDidChange.fire(this.getState());
  }
}

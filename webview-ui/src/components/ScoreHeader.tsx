import type { TamaState } from '../../../src/webview/contract';

export function ScoreHeader({ state }: { state: TamaState }) {
  const delta = state.lastEvent?.delta ?? 0;
  const deltaClass = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
  const health = Math.max(0, Math.min(100, Math.round(state.health)));
  const healthClass = health >= 60 ? 'high' : health >= 30 ? 'mid' : 'low';
  const preliminary = state.preliminary === true;

  return (
    <div class="scoreheader">
      <div class="health-block">
        <div class="health-head">
          <span class="health-title">Health</span>
          <span class={`health-value health-${healthClass}`}>{health}</span>
        </div>
        <div class="health-bar">
          <div class={`health-bar-fill health-${healthClass}`} style={{ width: `${health}%` }} />
        </div>
      </div>

      <div class="score-row">
        <div class="score-metric">
          <span class="metric-num">{Math.round(state.overallScore)}</span>
          <span class="metric-label">
            efficiency
            {state.lastEvent && (
              <span class={`delta delta-${deltaClass}`}>
                {delta > 0 ? '\u25b2' : delta < 0 ? '\u25bc' : '\u2014'} {Math.abs(delta)}
              </span>
            )}
          </span>
        </div>
        <div class="score-metric">
          <span class="metric-num metric-waste">{Math.round(state.wasteScore)}</span>
          <span class="metric-label">waste</span>
        </div>
      </div>

      {preliminary && (
        <div class="calc-note">
          <span class="calc-dot" />
          Still calculating — preliminary score
        </div>
      )}
    </div>
  );
}

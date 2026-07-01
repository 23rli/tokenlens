import type { TamaState } from '../../../src/webview/contract';

function sparkline(points: number[]): string {
  if (points.length < 2) return '';
  const w = 120;
  const h = 28;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  return points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - ((p - min) / span) * h;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}

export function ScoreHeader({ state }: { state: TamaState }) {
  const delta = state.lastEvent?.delta ?? 0;
  const trend = state.history.map((h) => h.overallScore);
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
        {trend.length >= 2 && (
          <svg viewBox="0 0 120 28" class="sparkline" preserveAspectRatio="none">
            <path d={sparkline(trend)} fill="none" stroke="currentColor" stroke-width="2" />
          </svg>
        )}
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

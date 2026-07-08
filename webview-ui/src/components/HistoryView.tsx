import type { ForecastView } from '../../../src/webview/contract';
import { fmtNum } from '../format';

/**
 * A readable, scrollable per-turn history — the answer to "what was turn 20?" and
 * to graphs getting cramped once a session has many turns. Newest first; each row
 * shows the turn number, its prompt excerpt, the tokens it carried, and the change
 * from the previous turn (a drop = a summarization reset).
 */
export function HistoryView({ forecast }: { forecast?: ForecastView }) {
  const series = forecast?.contextSeries ?? [];
  const prompts = forecast?.turnPrompts ?? [];

  if (series.length === 0) {
    return <div class="card history-empty muted">No turns captured yet — start a Copilot chat.</div>;
  }

  const rows = series.map((v, i) => ({
    turn: i + 1,
    prompt: prompts[i] || '—',
    tokens: v,
    delta: i > 0 ? v - series[i - 1] : v,
  }));

  return (
    <section class="card history">
      <div class="history-head">
        <span class="section-title">Turn history</span>
        <span class="history-count">{rows.length} turns</span>
      </div>
      <div class="history-list">
        {rows
          .slice()
          .reverse()
          .map((r) => (
            <div class="history-row" key={r.turn}>
              <span class="history-turn">{r.turn}</span>
              <span class="history-prompt" title={r.prompt}>{r.prompt}</span>
              <span class="history-tokens">{fmtNum(r.tokens)}</span>
              <span class={`history-delta${r.delta < 0 ? ' down' : ''}`}>
                {r.delta < 0 ? `▼ ${fmtNum(-r.delta)}` : `▲ ${fmtNum(r.delta)}`}
              </span>
            </div>
          ))}
      </div>
    </section>
  );
}

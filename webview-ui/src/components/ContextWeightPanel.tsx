import type { ForecastView } from '../../../src/webview/contract';
import { fmtNum } from '../format';
import { Tip } from './Tip';

/** Visuals for each context-load band. */
const BANDS: Record<
  ForecastView['contextBand'],
  { label: string; caption: string; color: string }
> = {
  light: { label: 'Light', caption: 'Plenty of room.', color: '#3fb950' },
  moderate: { label: 'Moderate', caption: 'Context is growing.', color: '#57ab5a' },
  heavy: { label: 'Heavy', caption: 'A large input is re-sent each turn.', color: '#d29922' },
  critical: { label: 'Near limit', caption: 'Consider a fresh chat for a new task.', color: '#f0883e' },
  overloaded: { label: 'At limit', caption: 'Copilot may summarize this chat.', color: '#f85149' },
};

/**
 * Shows current context load, growth across turns, and visible summarization
 * drops. Always renders a zero state before data so the layout does not shift.
 */
export function ContextWeightPanel({ forecast }: { forecast?: ForecastView }) {
  const f = forecast;
  const band = f ? BANDS[f.contextBand] : BANDS.light;
  const fill = !f ? 0 : f.loadFraction != null ? Math.min(1, f.loadFraction) : Math.min(1, f.contextTokens / 400_000);
  const blown = f?.contextBand === 'overloaded';
  const series = f?.contextSeries ?? [];
  const prompts = f?.turnPrompts ?? [];
  const turnRange = contextTurnRange(
    series.length,
    f?.contextSeriesStartTurn,
    f?.turnCount,
  );
  const peak = series.length ? Math.max(...series) : 1;
  const resets = series.reduce((n, v, i) => (i > 0 && v < series[i - 1] * 0.6 ? n + 1 : n), 0);
  const pct = f?.loadFraction != null ? Math.round(f.loadFraction * 100) : undefined;

  // Downsample the bars so a long chat does not turn into unreadable slivers; the
  // trend line still uses the full series, so the true shape is preserved.
  const MAX_BARS = 44;
  const bars: { v: number; turn: number; prompt?: string }[] =
    series.length <= MAX_BARS
        ? series.map((v, i) => ({ v, turn: turnRange.start + i, prompt: prompts[i] }))
      : Array.from({ length: MAX_BARS }, (_, b) => {
          const idx = Math.min(series.length - 1, Math.floor(((b + 1) * series.length) / MAX_BARS) - 1);
          return { v: series[idx], turn: turnRange.start + idx, prompt: prompts[idx] };
        });
  const sampled = series.length > MAX_BARS;

  return (
    <section class={`card gauge${blown ? ' gauge-blown' : ''}`}>
      <header class="gauge-head">
        <Tip text="Input context carried and re-sent on every turn. Sharp drops in the chart usually mean Copilot summarized the chat. Start a fresh chat for a new task to reduce carried context.">
          <span class="section-title" role="heading" aria-level={2}>Context weight</span>
        </Tip>
        <span class="gauge-band" style={{ color: f ? band.color : undefined }}>
          {f ? band.label : '—'}
        </span>
      </header>

      <div class="gauge-loadrow">
        <span class={`gauge-load${f ? '' : ' muted'}`}>{f ? fmtNum(f.contextTokens) : '—'}</span>
        <span class="gauge-load-unit">input tokens carried</span>
      </div>

      <div
        class="gauge-track"
        role="progressbar"
        aria-label="Context window load"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, pct ?? Math.round(fill * 100))}
        aria-valuetext={f?.contextLimit ? `${pct}% of ${fmtNum(f.contextLimit)} tokens` : 'Context limit unknown'}
      >
        <div class="gauge-fill" style={{ width: `${Math.round(fill * 100)}%`, background: f ? band.color : undefined }} />
      </div>
      <div class="gauge-limitline">
        {f?.contextLimit ? (
          <>
            <span>{pct}% of the {fmtNum(f.contextLimit)}-token limit</span>
            <span class="gauge-cap" style={{ color: band.color }}>{band.caption}</span>
          </>
        ) : (
          <span class="muted">
            {f ? 'Model context limit unavailable' : 'Waiting for your first measured Copilot turn…'}
          </span>
        )}
      </div>

      {series.length > 1 && (
        <div class="gauge-graphwrap">
          <span class="gauge-graphtitle">
            Input context per turn
            {turnRange.total > series.length
              ? ` · latest ${series.length} of ${turnRange.total} turns`
              : ''}
          </span>
          <div class="gauge-graph">
            <div class="gauge-yaxis">
              <span>{fmtNum(peak)}</span>
              <span>0</span>
            </div>
            <div
              class="gauge-plot"
              role="img"
              aria-label={`Context trend across turns ${turnRange.start} to ${turnRange.end}; peak ${fmtNum(peak)} tokens; ${resets} likely summarizations`}
            >
              <div class="gauge-spark">
                {bars.map((d, i) => (
                  <span
                    key={i}
                    class="gauge-bar"
                    title={`Turn ${d.turn}: ${fmtNum(d.v)} tokens${d.prompt ? ` — "${d.prompt}"` : ''}`}
                    style={{
                      height: `${Math.max(2, Math.round((d.v / peak) * 100))}%`,
                      background: i === bars.length - 1 ? band.color : 'var(--vscode-descriptionForeground, #8b949e)',
                      opacity: i === bars.length - 1 ? 1 : 0.4,
                    }}
                    aria-hidden="true"
                  />
                ))}
              </div>
              <svg class="gauge-trend" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <polyline
                  points={series
                    .map((v, i) => `${(i / (series.length - 1)) * 100},${100 - Math.max(2, (v / peak) * 100)}`)
                    .join(' ')}
                  fill="none"
                  stroke={band.color}
                  stroke-width="1.2"
                  vector-effect="non-scaling-stroke"
                />
              </svg>
            </div>
          </div>
          <div class="gauge-sparkaxis">
            <span>turn {turnRange.start}</span>
            <span title="A sharp drop usually means Copilot summarized the chat and replaced older context with a shorter recap.">
              {resets > 0 ? `${resets} summarization${resets > 1 ? 's' : ''}` : ''}
            </span>
            <span>now (turn {turnRange.end})</span>
          </div>
        </div>
      )}
    </section>
  );
}

export function contextTurnRange(
  seriesLength: number,
  startTurn?: number,
  totalTurns?: number,
): { start: number; end: number; total: number } {
  if (seriesLength <= 0) return { start: 0, end: 0, total: Math.max(0, totalTurns ?? 0) };
  const total = Math.max(seriesLength, totalTurns ?? seriesLength);
  const start = Math.max(1, startTurn ?? total - seriesLength + 1);
  const end = start + seriesLength - 1;
  return { start, end, total: Math.max(end, total) };
}

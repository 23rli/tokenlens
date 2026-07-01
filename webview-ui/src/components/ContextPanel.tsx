import type { ScoredEventView } from '../../../src/webview/contract';
import { summarizeContext } from '../../../src/analysis/contextBreakdown';
import { fmtNum } from '../format';

/**
 * "Where your tokens go" — the real cost driver. Most of a turn's INPUT tokens are
 * fixed overhead (system instructions + tool definitions) plus history/context sent
 * every turn; the user's message is usually a sliver. That overhead is a stable,
 * cacheable prefix — the biggest lever for real savings.
 */
export function ContextPanel({ lastEvent }: { lastEvent?: ScoredEventView }) {
  const slices = lastEvent?.contextBreakdown;
  const summary = summarizeContext(slices, lastEvent?.inputTokens ?? 0);
  if (!summary) return null;

  const palette = ['#539bf5', '#d29922', '#3fb950', '#a371f7', '#f85149', '#8b949e'];

  return (
    <section class="context">
      <div class="context-head">
        <span class="section-title">Where your tokens go</span>
        <span class="context-total">{fmtNum(summary.totalTokens)} in</span>
      </div>

      <div class="context-bar">
        {summary.slices.map((s, i) => (
          <div
            key={s.label}
            class="context-seg"
            style={{ width: `${s.pct}%`, background: palette[i % palette.length] }}
            title={`${s.label}: ${fmtNum(s.tokens)} tokens (${s.pct}%)`}
          />
        ))}
      </div>

      <ul class="context-legend">
        {summary.slices.map((s, i) => (
          <li key={s.label}>
            <span class="context-dot" style={{ background: palette[i % palette.length] }} />
            <span class="context-label">{s.label}</span>
            <span class="context-val">
              {fmtNum(s.tokens)} · {s.pct}%
            </span>
          </li>
        ))}
      </ul>

      <p class="context-note">
        {summary.overheadPct}% is fixed system + tool overhead ({fmtNum(summary.overheadTokens)}{' '}
        tokens) — a stable prefix that's cacheable. Trim unused tools and avoid re-pasting context
        to keep that cache warm.
      </p>
    </section>
  );
}

import type { TamaState } from '../../../src/webview/contract';
import { fmtNum, fmtUsd } from '../format';

/**
 * Compact strip surfacing the REAL Copilot data we pull from the chat session:
 * the model/agent + reasoning level, this prompt's token usage, and the running
 * session totals — so it's clear the dashboard is reading live metered data.
 */
export function LiveData({ state }: { state: TamaState }) {
  const m = state.model;
  const e = state.lastEvent;
  const metrics = state.metrics;
  const efforts = m?.reasoningEfforts ?? [];
  // Prefer the effort the session ACTUALLY selected; fall back to the model's
  // supported range only when the concrete choice isn't recorded.
  const reasoning =
    m?.reasoningEffort ??
    (efforts.length > 1 ? `${efforts[0]}\u2013${efforts[efforts.length - 1]}` : efforts[0]);

  const agent = m ? [m.name ?? m.id, m.category].filter(Boolean).join(' · ') : undefined;
  const reasoningLine = m
    ? [reasoning, m.contextMaxTokens ? `${fmtNum(m.contextMaxTokens)} ctx` : null]
        .filter(Boolean)
        .join(' · ')
    : undefined;

  return (
    <section class="livedata">
      <div class="livedata-head">
        <span class="livedata-title">Live Copilot data</span>
        {e && (
          <span class={`pill ${e.tokensReal ? 'pill-real' : ''}`}>
            {e.tokensReal ? 'real tokens' : 'estimated'}
          </span>
        )}
      </div>

      <div class="livedata-row">
        <span class="livedata-key">Agent</span>
        <span class="livedata-val">{agent ?? 'waiting for a Copilot prompt…'}</span>
      </div>

      {reasoningLine && (
        <div class="livedata-row">
          <span class="livedata-key">Reasoning</span>
          <span class="livedata-val">{reasoningLine}</span>
        </div>
      )}

      <div class="livedata-row">
        <span class="livedata-key">This prompt</span>
        <span class="livedata-val">
          {e
            ? `${fmtNum(e.inputTokens)} in · ${fmtNum(e.outputTokens)} out` +
              (e.copilotCredits != null ? ` · ${e.copilotCredits.toFixed(1)} cr` : '')
            : '—'}
        </span>
      </div>

      <div class="livedata-row">
        <span class="livedata-key">Session</span>
        <span class="livedata-val">
          {`${fmtNum(metrics.totalTokens)} tokens · ${fmtNum(metrics.totalCredits)} AIC` +
            (metrics.totalCreditsEstimated ? ' (est.)' : '') +
            (metrics.hasUsdRate ? ` · ${fmtUsd(metrics.totalCostUsd)}` : '')}
        </span>
      </div>
    </section>
  );
}

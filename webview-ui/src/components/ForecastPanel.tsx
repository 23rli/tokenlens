import type { ForecastView } from '../../../src/webview/contract';
import { fmtNum } from '../format';
import { Tip } from './Tip';

/**
 * The chat header + the two headline numbers side by side: LAST TURN (the real
 * input tokens the previous turn cost) vs NEXT TURN (est.), plus a one-line
 * range and forecast accuracy. Always renders (skeleton before data).
 */
export function ForecastPanel({ forecast }: { forecast?: ForecastView }) {
  const f = forecast;
  const name = f?.sessionTitle || (f?.sessionShortId ? `Chat ${f.sessionShortId}` : 'No active chat');

  return (
    <>
      <section class="card now">
        <span class="now-label">Chat</span>
        <div class="now-row">
          <span class="now-name">{name}</span>
          {f && f.turnCount > 0 && <span class="now-turn">turn {f.turnCount}</span>}
        </div>
      </section>

      <section class="card next">
        <div class="next-cols">
          <div class="next-col">
            <span class="next-kicker">Last turn</span>
            <span class={`next-number${f?.realLastInputTokens != null ? '' : ' muted'}`}>
              {f?.realLastInputTokens != null ? fmtNum(f.realLastInputTokens) : '—'}
            </span>
          </div>
          <div class="next-arrow">→</div>
          <div class="next-col">
            <Tip text="What your next prompt will cost, predicted from your recent turns.">
              <span class="next-kicker">Next turn (est.)</span>
            </Tip>
            <span class={`next-number next-pred${f ? '' : ' muted'}`}>
              {f ? fmtNum(f.predictedInputTokens) : '—'}
            </span>
          </div>
        </div>

        <div class="next-detail">
          {f ? (
            <>
              {f.predictedCredits != null && <>≈ {Math.round(f.predictedCredits).toLocaleString()} credits · </>}
              range {fmtNum(f.intervalLow)}–{fmtNum(f.intervalHigh)} tokens
              {f.confidence < 0.4 && <span class="next-hedge"> · low conf.</span>}
            </>
          ) : (
            'range —'
          )}
        </div>

        {f && f.accuracySamples > 0 && (
          <div class="next-acc" title={`How close past predictions landed — median error on ${f.accuracySamples} of your turns`}>
            <b class="next-acc-pct">{Math.round(f.accuracyScore)}%</b>
            <span class="next-acc-note">forecast accuracy</span>
          </div>
        )}

        {f?.resetRisk === 'high' && (
          <div class="next-warn">Summarization likely next — a reset may drop cost sharply.</div>
        )}
      </section>
    </>
  );
}

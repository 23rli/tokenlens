import type { ForecastView } from '../../../src/webview/contract';
import { fmtNum } from '../format';
import { Tip } from './Tip';

/**
 * The chat header + the two headline numbers side by side: LAST TURN (the real
 * input tokens the previous turn cost) vs NEXT TURN (est.), plus a one-line
 * likely range and historical median error. Always renders (skeleton before data).
 */
export function ForecastPanel({ forecast }: { forecast?: ForecastView }) {
  const f = forecast;
  const name = f?.sessionTitle || (f?.sessionShortId ? `Chat ${f.sessionShortId}` : 'No active Copilot chat');
  const turns = f?.allTurns ?? [];
  const liveTurn = visibleTurnCount(f);
  const pending = countInFlightTurns(turns);
  const estimatingPending = f?.forecastTarget === 'pending';
  const medianError = f ? Math.max(0, Math.round(100 - f.accuracyScore)) : 0;
  const rangeCoverage = f ? Math.round(f.intervalCoverage * 100) : 0;

  return (
    <>
      <section class="card now">
        <span class="now-label" role="heading" aria-level={2}>Chat</span>
        <div class="now-row">
          <span class="now-name">{name}</span>
          {f && liveTurn > 0 && (
            <span class="now-turn">
              turn {liveTurn}
              {pending > 0 ? ` · ${pending} pending` : ''}
            </span>
          )}
        </div>
        {!f && (
          <p class="now-empty">Send a Copilot Chat message in this window to begin live tracking.</p>
        )}
      </section>

      <section class="card next" aria-labelledby="forecast-heading">
        <h2 id="forecast-heading" class="sr-only">
          {estimatingPending ? 'Current turn estimate' : 'Next-turn forecast'}
        </h2>
        <div class="next-cols">
          <div class="next-col">
            <Tip text="Measured input tokens for the latest completed turn. Input includes system instructions, tools, chat history, files, and your message.">
              <span class="next-kicker">Latest input</span>
            </Tip>
            <span class={`next-number${f?.realLastInputTokens != null ? '' : ' muted'}`}>
              {f?.realLastInputTokens != null ? fmtNum(f.realLastInputTokens) : '—'}
            </span>
          </div>
          <div class="next-arrow">→</div>
          <div class="next-col">
            <Tip text={estimatingPending ? "Estimated input for the turn Copilot is processing now. It becomes measured after Copilot writes its usage." : "Estimated input for your next turn, based on this chat's measured growth. Re-sent context usually matters more than message length."}>
              <span class="next-kicker">{estimatingPending ? 'Current input (est.)' : 'Next input (est.)'}</span>
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
              likely range {fmtNum(f.intervalLow)}–{fmtNum(f.intervalHigh)} tokens
              {f.confidence < 0.4 && <span class="next-hedge"> · low confidence</span>}
            </>
          ) : (
            'likely range —'
          )}
        </div>

        {pending > 0 && (
          <div class="next-pending">
            Copilot is still processing {pending > 1 ? `${pending} turns` : 'this turn'}. Usage will switch from estimated to measured when available.
          </div>
        )}

        {f && f.accuracySamples > 0 && (
          <div class="next-acc" title={`Median absolute error across ${f.accuracySamples} measured turns; ${rangeCoverage}% landed inside the predicted range.`}>
            <b class="next-acc-pct">{medianError}%</b>
            <span class="next-acc-note">
              median error · {rangeCoverage}% in range · {f.accuracySamples} turn{f.accuracySamples === 1 ? '' : 's'}
            </span>
          </div>
        )}

        {f?.resetRisk === 'high' && (
          <div class="next-warn">
            This chat is close to its context limit. Copilot may summarize it soon, but the timing is uncertain.
          </div>
        )}
      </section>
    </>
  );
}

export function countInFlightTurns(turns: NonNullable<ForecastView['allTurns']>): number {
  return turns.filter((turn) => turn.status === 'pending').length;
}

export function visibleTurnCount(forecast?: ForecastView): number {
  return forecast?.allTurnsTotal ?? forecast?.allTurns?.length ?? forecast?.turnCount ?? 0;
}

import type { TokenLensState } from '../../../src/webview/contract';
import { fmtNum } from '../format';
import { Tip } from './Tip';

/**
 * The model/agent context: which model, reasoning effort, and context window are
 * live in this session. Cost/token numbers live in the forecast + session-cost
 * cards, so they're deliberately NOT repeated here.
 */
export function LiveData({ state }: { state: TokenLensState }) {
  const m = state.model;
  // Only show the reasoning effort when the session ACTUALLY recorded which one
  // was selected. Never show the supported range (e.g. "low–max") — that reads
  // like the model is using a range, which is wrong and confusing.
  const reasoning = m?.reasoningEffort;

  const modelName = m ? [m.name ?? m.id, m.category].filter(Boolean).join(' · ') : undefined;

  return (
    <section class="card livedata">
      <div class="livedata-head">
        <Tip text="Model metadata recorded for this chat. Token Lens shows reasoning effort only when Copilot persists the selected value.">
          <span class="section-title" role="heading" aria-level={2}>Current model</span>
        </Tip>
      </div>

      <div class="livedata-row">
        <span class="livedata-key">Model</span>
        <span class="livedata-val">{modelName ?? 'Waiting for Copilot model data…'}</span>
      </div>

      {reasoning && (
        <div class="livedata-row">
          <span class="livedata-key">Reasoning effort</span>
          <span class="livedata-val">{reasoning}</span>
        </div>
      )}

      {m?.contextMaxTokens && (
        <div class="livedata-row">
          <span class="livedata-key">Context limit</span>
          <span class="livedata-val">{fmtNum(m.contextMaxTokens)} tokens</span>
        </div>
      )}
    </section>
  );
}

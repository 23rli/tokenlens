import { useEffect, useRef, useState } from 'preact/hooks';
import type { AutoRewriteView, ComposeResult } from '../../../src/webview/contract';
import { post } from '../vscodeApi';

/**
 * In-the-moment coaching surface we fully own: as the user drafts a prompt here we
 * (1) score it live with the offline engine and (2) AUTOMATICALLY produce a leaner,
 * more precise rewrite — the system decides whether that needs the model or a free
 * offline cleanup, so the user never has to. "Copy to Copilot" sends the best
 * version and clears the box; "Clear" resets it.
 */
export function ComposeBox({ result, auto }: { result?: ComposeResult; auto?: AutoRewriteView }) {
  const [text, setText] = useState('');
  const [pending, setPending] = useState(false);
  const scoreTimer = useRef<number | undefined>(undefined);
  const rewriteTimer = useRef<number | undefined>(undefined);
  const lastRewriteReq = useRef<string>('');

  // Fast live score (offline, no tokens) as the user types.
  useEffect(() => {
    if (scoreTimer.current) clearTimeout(scoreTimer.current);
    const draft = text;
    scoreTimer.current = window.setTimeout(() => post({ type: 'composeInput', text: draft }), 300);
    return () => {
      if (scoreTimer.current) clearTimeout(scoreTimer.current);
    };
  }, [text]);

  // Automatic rewrite once the draft settles — the host decides offline vs. model.
  useEffect(() => {
    if (rewriteTimer.current) clearTimeout(rewriteTimer.current);
    const draft = text.trim();
    if (draft.length < 20 || draft === lastRewriteReq.current) return;
    rewriteTimer.current = window.setTimeout(() => {
      lastRewriteReq.current = draft;
      setPending(true);
      post({ type: 'autoRewrite', text });
    }, 1100);
    return () => {
      if (rewriteTimer.current) clearTimeout(rewriteTimer.current);
    };
  }, [text]);

  // An arriving rewrite for the current draft clears the pending state.
  useEffect(() => {
    if (auto && auto.text === text) setPending(false);
  }, [auto, text]);

  const matches = result != null && result.text === text && text.trim().length > 0;
  const score = matches ? Math.round(result!.overallScore) : undefined;
  const scoreClass = score == null ? '' : score >= 60 ? 'high' : score >= 30 ? 'mid' : 'low';
  const retryRisk = matches ? result!.retryRisk : undefined;
  const retryReason = matches ? result!.retryReasons?.[0] : undefined;
  const contextGap = matches ? result!.contextGapHint : undefined;

  const autoMatches = auto != null && auto.text === text;
  const autoRewrite = autoMatches ? auto!.rewrittenPrompt : undefined;
  // Prefer the host rewrite; fall back to the live offline suggestion while it loads.
  const rewrite = autoRewrite ?? (matches ? result!.rewrittenPrompt : undefined);
  const rewriteFromAuto = autoRewrite != null;
  const savingsPct = rewriteFromAuto
    ? auto!.estimatedTokenReductionPct
    : matches
      ? result!.estimatedTokenReductionPct
      : undefined;
  const savedTokens = rewriteFromAuto
    ? auto!.estimatedTokensSaved
    : matches
      ? result!.estimatedTokensSaved
      : undefined;

  // One nudge at most, only when there's no concrete rewrite to offer.
  const nudge = rewrite
    ? undefined
    : pending
      ? undefined
      : contextGap
        ? `🧩 ${contextGap}`
        : retryRisk === 'high' || retryRisk === 'medium'
          ? `⚠️ ${retryRisk === 'high' ? 'High' : 'Some'} retry risk${
              retryReason ? ` — ${retryReason}` : ''
            }. Name the exact file or function you mean.`
          : autoMatches && auto!.source === 'none'
            ? '✓ Already clear — no changes needed.'
            : matches && result!.tip
              ? `💡 ${result!.tip}`
              : undefined;

  const clear = (): void => {
    setText('');
    lastRewriteReq.current = '';
    setPending(false);
  };

  const send = (): void => {
    const out = rewrite ?? text;
    if (!out.trim()) return;
    post({ type: 'copyToCopilot', text: out, adopted: rewrite != null });
    clear();
  };

  return (
    <section class="compose">
      <div class="compose-head">
        <span class="section-title">Compose</span>
        {score != null && <span class={`compose-score compose-${scoreClass}`}>{score}</span>}
      </div>

      <textarea
        class="compose-input"
        rows={3}
        placeholder="Draft a prompt here — Tokentama scores it live and automatically rewrites it leaner. Copy to Copilot when ready."
        value={text}
        onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
      />

      {rewrite ? (
        <div class="compose-rewrite">
          <div class="rewrite-head">
            {rewriteFromAuto && auto!.source === 'llm' ? 'Rewrite · your Copilot model' : 'Rewrite'}
            {rewriteFromAuto && auto!.source === 'llm' && auto!.examplesUsed > 0 && (
              <span class="rewrite-badge"> · {auto!.examplesUsed} of your examples</span>
            )}
          </div>
          <pre class="rewrite-body">{rewrite}</pre>
          <p class="rewrite-savings">
            {savedTokens != null && savedTokens > 0
              ? `Saves ~${savedTokens} tokens${savingsPct != null ? ` (${Math.round(savingsPct)}%)` : ''}`
              : 'Sharper prompt — aims to land the right result on the first try'}
          </p>
        </div>
      ) : pending ? (
        <p class="compose-tip">✨ Improving your prompt…</p>
      ) : (
        nudge && <p class="compose-tip">{nudge}</p>
      )}

      {text.trim() && (
        <div class="compose-actions">
          <button class="primary" onClick={send}>
            {rewrite ? 'Copy rewrite to Copilot' : 'Copy to Copilot'}
          </button>
          <button class="ghost" onClick={clear}>
            Clear
          </button>
        </div>
      )}
    </section>
  );
}

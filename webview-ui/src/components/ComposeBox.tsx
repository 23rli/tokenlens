import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComposeResult } from '../../../src/webview/contract';
import { post } from '../vscodeApi';

/**
 * In-the-moment coaching surface we fully own: as the user drafts a prompt here,
 * we debounce-score it with the offline engine (no network, no state change) and
 * offer a leaner rewrite before it ever reaches Copilot.
 */
export function ComposeBox({ result }: { result?: ComposeResult }) {
  const [text, setText] = useState('');
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const draft = text;
    timer.current = window.setTimeout(() => post({ type: 'composeInput', text: draft }), 300);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [text]);

  const matches = result != null && result.text === text && text.trim().length > 0;
  const score = matches ? Math.round(result!.overallScore) : undefined;
  const scoreClass = score == null ? '' : score >= 60 ? 'high' : score >= 30 ? 'mid' : 'low';
  const rewrite = matches ? result!.rewrittenPrompt : undefined;

  return (
    <section class="compose">
      <div class="compose-head">
        <span class="section-title">Compose</span>
        {score != null && <span class={`compose-score compose-${scoreClass}`}>{score}</span>}
      </div>

      <textarea
        class="compose-input"
        rows={3}
        placeholder="Draft a prompt here — Tokentama scores it live, before you send it to Copilot."
        value={text}
        onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
      />

      {matches && result!.tip && <p class="compose-tip">💡 {result!.tip}</p>}

      {rewrite && (
        <div class="compose-rewrite">
          <pre class="rewrite-body">{rewrite}</pre>
          {result!.estimatedTokenReductionPct != null && (
            <p class="rewrite-savings">
              Saves ~{Math.round(result!.estimatedTokenReductionPct)}% tokens
            </p>
          )}
        </div>
      )}

      {text.trim() && (
        <div class="compose-actions">
          <button
            class="primary"
            disabled={!rewrite}
            onClick={() => rewrite && post({ type: 'copyToCopilot', text: rewrite, adopted: true })}
          >
            Copy leaner rewrite
          </button>
          <button class="ghost" onClick={() => post({ type: 'copyToCopilot', text, adopted: false })}>
            Copy my prompt
          </button>
        </div>
      )}
    </section>
  );
}

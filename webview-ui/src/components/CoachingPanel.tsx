import type { ScoredEventView, TipView } from '../../../src/webview/contract';

interface Props {
  tip?: TipView;
  lastEvent?: ScoredEventView;
}

/**
 * Forward-looking coaching for your last CAPTURED prompt. That prompt was already
 * sent to Copilot, so rewriting IT is moot — the live rewriting happens in the
 * Compose box before you send. Here we just surface the one lesson to apply next
 * time, so the habit sticks.
 */
export function CoachingPanel({ tip, lastEvent }: Props) {
  const improvements = lastEvent?.improvements ?? [];
  const message = tip?.message;
  if (!message && improvements.length === 0) return null;

  return (
    <section class="coaching">
      <span class="section-title">Coach · for next time</span>
      {message && <p class="tip-message">💡 {message}</p>}
      {improvements.length > 0 && (
        <ul class="tip-improvements">
          {improvements.slice(0, 2).map((imp, i) => (
            <li key={i}>{imp}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

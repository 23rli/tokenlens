import type { ContextSlice, ForecastView } from '../../../src/webview/contract';
import { summarizeContext } from '../../../src/analysis/contextBreakdown';
import { fmtNum } from '../format';
import { Tip } from './Tip';

const PALETTE = ['#539bf5', '#d29922', '#3fb950', '#a371f7', '#f85149', '#8b949e'];

/**
 * "Where tokens go" — the real cost driver. Shows the split (system / tools /
 * history / message) for the LATEST prompt, THIS chat, and ALL chats in the
 * workspace, as stacked bars that share one legend. Data comes straight from
 * Copilot's on-disk `promptTokenDetails`.
 */
export function ContextPanel({
  breakdown,
  inputTokens,
  sessionBreakdown,
  sessionInputTokens,
  chatBreakdown,
  chatInputTokens,
  chatSessionCount,
  aggregateScope,
}: {
  breakdown?: ContextSlice[];
  inputTokens?: number;
  sessionBreakdown?: ContextSlice[];
  sessionInputTokens?: number;
  chatBreakdown?: ContextSlice[];
  chatInputTokens?: number;
  chatSessionCount?: number;
  aggregateScope?: ForecastView['aggregateScope'];
}) {
  const latest = summarizeContext(breakdown, inputTokens ?? 0);
  const session = summarizeContext(sessionBreakdown, sessionInputTokens ?? 0);
  const chat = summarizeContext(chatBreakdown, chatInputTokens ?? 0);
  // The latest turn's own breakdown can be momentarily absent (a just-started chat
  // or a summarization reset), but the chat/all-chats aggregates persist. Drive the
  // card off whichever scope has data so the bars don't vanish.
  const primary = latest ?? session ?? chat;
  const aggregateLabel =
    aggregateScope === 'allWindows'
      ? 'All windows'
      : aggregateScope === 'emptyWindow'
        ? 'This window'
        : 'All chats';

  if (!primary) {
    return (
      <section class="card context">
        <div class="context-head">
          <Tip text="Input splits into system · tools · history · message. History usually dominates in long chats — start a fresh chat for a new task, and turn off tools or attachments you don't need.">
            <span class="section-title" role="heading" aria-level={2}>Where tokens go</span>
          </Tip>
        </div>
        <div class="context-bar context-bar-empty" />
        <p class="context-note muted">
          Reading Copilot's token breakdown from disk… the system / tools / history / message split
          appears once the current turn is metered.
        </p>
      </section>
    );
  }

  // Keep colors stable across every scope and include categories that only occur
  // in an aggregate (for example, a tool category absent from the latest turn).
  const allSlices = [latest, session, chat].flatMap((summary) => summary?.slices ?? []);
  const order = [...new Set(allSlices.map((slice) => slice.label))];
  const colorFor = (label: string): string => PALETTE[Math.max(0, order.indexOf(label)) % PALETTE.length];

  // Each bar fills 100% of its OWN segments, so proportions are correct and the
  // bar never comes up short when the reported total includes uncategorised tokens.
  const bar = (slices: ContextSlice[]) => {
    const sum = slices.reduce((a, s) => a + s.tokens, 0) || 1;
    return (
      <div
        class="context-bar"
        role="img"
        aria-label={slices
          .map((slice) => `${slice.label} ${Math.round((slice.tokens / sum) * 100)} percent`)
          .join(', ')}
      >
        {slices.map((s, i) => {
          const w = (s.tokens / sum) * 100;
          const p = Math.round(w);
          return (
            <div
              key={`${s.label}-${i}`}
              class="context-seg"
              style={{ width: `${w}%`, background: colorFor(s.label) }}
              title={`${s.label}: ${fmtNum(s.tokens)} tokens (${p}%)`}
              aria-hidden="true"
            >
              {w >= 10 && <span class="context-seg-pct">{p}%</span>}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <section class="card context">
      <div class="context-head">
        <Tip text={`Input tokens by scope: this prompt → this chat → ${aggregateLabel.toLowerCase()}. History usually dominates in long chats — start a fresh chat for a new task, and turn off tools or attachments you don't need.`}>
          <span class="section-title" role="heading" aria-level={2}>Where tokens go</span>
        </Tip>
      </div>

      {latest && (
        <>
          <div class="context-barrow">
            <span class="context-barlabel">This prompt</span>
            <span class="context-barval">{fmtNum(latest.totalTokens)}</span>
          </div>
          {bar(latest.slices)}
        </>
      )}

      {session && (
        <>
          <div class="context-barrow">
            <span class="context-barlabel">This chat</span>
            <span class="context-barval">{fmtNum(session.totalTokens)}</span>
          </div>
          {bar(session.slices)}
        </>
      )}

      {chat && (
        <>
          <div class="context-barrow">
            <span class="context-barlabel">
              {aggregateLabel}{chatSessionCount && chatSessionCount > 1 ? ` · ${chatSessionCount}` : ''}
            </span>
            <span class="context-barval">{fmtNum(chat.totalTokens)}</span>
          </div>
          {bar(chat.slices)}
        </>
      )}

      <ul class="context-legend">
        {order.map((label) => (
          <li key={label}>
            <span class="context-dot" style={{ background: colorFor(label) }} aria-hidden="true" />
            <span class="context-label">{label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

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
          <Tip text="Source-reported input categories. Long chats usually carry more message history; tool definitions, tool results, files, and system instructions can also contribute.">
            <span class="section-title" role="heading" aria-level={2}>Where tokens go</span>
          </Tip>
        </div>
        <div class="context-bar context-bar-empty" />
        <p class="context-note muted">
          Waiting for Copilot's input-category breakdown. It appears after the latest turn is measured.
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
          const displayLabel = humanizeContextLabel(s.label);
          return (
            <div
              key={`${s.label}-${i}`}
              class="context-seg"
              style={{ width: `${w}%`, background: colorFor(s.label) }}
              title={`${displayLabel}: ${fmtNum(s.tokens)} tokens (${p}%)`}
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
        <Tip text={`Source-reported input categories for the latest turn, this chat, and ${aggregateLabel.toLowerCase()}. These are request categories, not exact per-tool token totals.`}>
          <span class="section-title" role="heading" aria-level={2}>Where tokens go</span>
        </Tip>
      </div>

      {latest && (
        <>
          <div class="context-barrow">
            <span class="context-barlabel">Latest turn</span>
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
            <span class="context-label">{humanizeContextLabel(label)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function humanizeContextLabel(value: string): string {
  const words = value
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
    .toLowerCase();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Other';
}

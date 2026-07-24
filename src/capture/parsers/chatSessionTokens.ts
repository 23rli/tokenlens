import { parseChatSessionLines, type ChatSessionLine } from './chatSessionLines';

/** Real per-turn token + credit counts, keyed by request/turn index. */
export interface PromptTokenDetail {
  category: string;
  label: string;
  percentageOfPrompt: number;
}

export interface TurnTokens {
  promptTokens?: number;
  completionTokens?: number;
  copilotCredits?: number;
  /** Per-category split of the input tokens (System, Tool Definitions, Messages…). */
  promptTokenDetails?: PromptTokenDetail[];
}

const TOKEN_FIELDS = ['promptTokens', 'completionTokens', 'copilotCredits'] as const;

/**
 * Extract the REAL metered token + credit counts Copilot records in a
 * `chatSessions/<id>.jsonl` patch log. Unlike the prompt text (which the patch
 * log reconstructs unreliably), these scalar fields are robust: we take the
 * last value written for `["requests", N, <field>]` (last-write-wins per turn),
 * plus any values present in the initial `kind:0` snapshot.
 *
 * `promptTokens` is the FULL model input (system + context + history + prompt),
 * so it reflects true usage — not just the visible prompt text.
 */
export function parseChatSessionTokens(
  content: string,
  lines: readonly ChatSessionLine[] = parseChatSessionLines(content),
): Map<number, TurnTokens> {
  const byTurn = new Map<number, TurnTokens>();

  const set = (idx: number, field: string, value: unknown): void => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return;
    const cur = byTurn.get(idx) ?? {};
    (cur as Record<string, number>)[field] = value;
    byTurn.set(idx, cur);
  };

  const setDetails = (idx: number, value: unknown): void => {
    if (!Array.isArray(value)) return;
    const details = value.filter(
      (d): d is PromptTokenDetail =>
        d != null &&
        typeof d.category === 'string' &&
        typeof d.label === 'string' &&
        typeof d.percentageOfPrompt === 'number',
    );
    if (details.length === 0) return;
    const cur = byTurn.get(idx) ?? {};
    cur.promptTokenDetails = details;
    byTurn.set(idx, cur);
  };

  for (const parsed of lines) {
    if (parsed.kind === 0 && Array.isArray(parsed.v?.requests)) {
      parsed.v.requests.forEach((req: any, i: number) => {
        if (!req || typeof req !== 'object') return;
        for (const field of TOKEN_FIELDS) set(i, field, req[field]);
        setDetails(i, req.promptTokenDetails);
      });
      continue;
    }

    if (
      (parsed.kind === 1 || parsed.kind === 2) &&
      Array.isArray(parsed.k) &&
      parsed.k[0] === 'requests' &&
      typeof parsed.k[1] === 'number'
    ) {
      const field = parsed.k[2];
      if (typeof field === 'string' && (TOKEN_FIELDS as readonly string[]).includes(field)) {
        set(parsed.k[1], field, parsed.v);
      } else if (field === 'promptTokenDetails') {
        setDetails(parsed.k[1], parsed.v);
      }
    }
  }

  return byTurn;
}

import { readFileSync } from 'node:fs';
import type { PromptEvent } from '@ecoprompt/shared-types';
import { parseTranscript } from './parsers/transcriptParser';
import { buildPromptEvent } from './parsers/promptEventFactory';
import type { CopilotSessionPaths } from './copilotPaths';

function safeRead(path: string | undefined): string {
  if (!path) return '';
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}

/**
 * Read one Copilot session from its append-only transcript and produce one
 * PromptEvent per user turn: the user prompt, the assistant's aggregated
 * response, and tool calls. Token/cost are estimated by the event factory.
 *
 * The transcript is the single source of truth because the companion
 * `chatSessions/*.jsonl` patch-log format is version-volatile and unreliable.
 */
export function readSessionEvents(paths: CopilotSessionPaths, userId = 'local-user'): PromptEvent[] {
  const parsed = parseTranscript(safeRead(paths.transcriptPath));
  const sessionId = parsed.sessionId || paths.sessionId;

  const events: PromptEvent[] = [];
  for (const turn of parsed.turns) {
    const promptText = (turn.promptText ?? '').trim();
    if (!promptText) continue;
    events.push(
      buildPromptEvent({
        source: 'transcript',
        sessionId,
        userId,
        turnIndex: turn.turnIndex,
        promptText: turn.promptText ?? '',
        responseText: turn.responseText || undefined,
        toolCalls: turn.toolCalls,
        timestamp: turn.startTime,
      }),
    );
  }
  return events;
}

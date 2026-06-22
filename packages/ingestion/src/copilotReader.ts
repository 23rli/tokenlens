import { readFileSync } from 'node:fs';
import type { PromptEvent } from '@ecoprompt/shared-types';
import { parseTranscript } from './transcriptParser';
import { parseChatSession } from './chatSessionParser';
import { buildPromptEvent } from './promptEventFactory';
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
 * Read one Copilot session from disk and merge the two sources into per-turn
 * PromptEvents: user prompt + model + real output tokens (chatSession) enriched
 * with assistant response + tool calls + timing (transcript).
 */
export function readSessionEvents(
  paths: CopilotSessionPaths,
  userId = 'local-user',
): PromptEvent[] {
  const parsedChat = parseChatSession(safeRead(paths.chatSessionPath));
  const parsedTranscript = parseTranscript(safeRead(paths.transcriptPath));
  const sessionId = parsedChat.sessionId || parsedTranscript.sessionId || paths.sessionId;

  const byTurn = new Map<number, PromptEvent>();

  for (const r of parsedChat.requests) {
    byTurn.set(
      r.turnIndex,
      buildPromptEvent({
        source: 'chat-session',
        sessionId,
        userId,
        turnIndex: r.turnIndex,
        promptText: r.promptText,
        model: parsedChat.model,
        outputTokensOverride: r.completionTokens,
      }),
    );
  }

  for (const t of parsedTranscript.turns) {
    const existing = byTurn.get(t.turnIndex);
    if (existing) {
      if (t.responseText) existing.responseText = t.responseText;
      if (t.toolCalls.length) existing.toolCalls = t.toolCalls;
      existing.source = 'transcript';
      if (t.startTime) existing.timestamp = t.startTime;
    } else if (t.responseText || t.toolCalls.length) {
      byTurn.set(
        t.turnIndex,
        buildPromptEvent({
          source: 'transcript',
          sessionId,
          userId,
          turnIndex: t.turnIndex,
          promptText: '',
          responseText: t.responseText,
          toolCalls: t.toolCalls,
          model: parsedChat.model,
          timestamp: t.startTime,
        }),
      );
    }
  }

  return [...byTurn.values()].sort((a, b) => a.turnIndex - b.turnIndex);
}

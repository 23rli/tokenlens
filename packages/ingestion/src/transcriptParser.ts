import type { ToolCallInfo } from '@ecoprompt/shared-types';
import type { ParsedTranscript, ParsedTurn } from './types';

interface Envelope {
  type?: string;
  data?: Record<string, any>;
  id?: string;
  timestamp?: string;
  parentId?: string | null;
}

/**
 * Parse a Copilot `transcripts/<id>.jsonl` event stream into per-turn data:
 * assistant response text, tool calls (with success + duration), and turn
 * boundaries. Schema confirmed against real transcripts (design research).
 */
export function parseTranscript(content: string): ParsedTranscript {
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  let sessionId = '';
  let currentTurn = 0;
  const turnsMap = new Map<number, ParsedTurn>();
  const toolStart = new Map<string, { name: string; ts?: string }>();

  const getTurn = (i: number): ParsedTurn => {
    let t = turnsMap.get(i);
    if (!t) {
      t = { turnIndex: i, responseText: '', toolCalls: [] };
      turnsMap.set(i, t);
    }
    return t;
  };

  for (const line of lines) {
    let ev: Envelope;
    try {
      ev = JSON.parse(line) as Envelope;
    } catch {
      continue;
    }
    const d = ev.data ?? {};
    switch (ev.type) {
      case 'session.start':
        sessionId = typeof d.sessionId === 'string' ? d.sessionId : sessionId;
        break;
      case 'assistant.turn_start': {
        const n = Number.parseInt(String(d.turnId), 10);
        if (Number.isFinite(n)) currentTurn = n;
        const t = getTurn(currentTurn);
        if (!t.startTime) t.startTime = ev.timestamp;
        break;
      }
      case 'assistant.turn_end': {
        getTurn(currentTurn).endTime = ev.timestamp;
        break;
      }
      case 'assistant.message': {
        const t = getTurn(currentTurn);
        if (typeof d.content === 'string' && d.content.length > 0) {
          t.responseText += (t.responseText ? '\n' : '') + d.content;
        }
        if (Array.isArray(d.toolRequests)) {
          for (const tr of d.toolRequests) {
            if (tr?.toolCallId && tr?.name) toolStart.set(tr.toolCallId, { name: tr.name });
          }
        }
        break;
      }
      case 'tool.execution_start': {
        if (d.toolCallId) {
          const name = d.toolName ?? toolStart.get(d.toolCallId)?.name ?? 'unknown';
          toolStart.set(d.toolCallId, { name, ts: ev.timestamp });
        }
        break;
      }
      case 'tool.execution_complete': {
        const t = getTurn(currentTurn);
        const started = d.toolCallId ? toolStart.get(d.toolCallId) : undefined;
        const durationMs =
          started?.ts && ev.timestamp
            ? Math.max(0, Date.parse(ev.timestamp) - Date.parse(started.ts))
            : undefined;
        const call: ToolCallInfo = {
          toolName: started?.name ?? d.toolName ?? 'unknown',
          toolCallId: d.toolCallId,
          success: typeof d.success === 'boolean' ? d.success : undefined,
          durationMs,
        };
        t.toolCalls.push(call);
        break;
      }
      default:
        break;
    }
  }

  const turns = [...turnsMap.values()].sort((a, b) => a.turnIndex - b.turnIndex);
  return { sessionId, turns };
}

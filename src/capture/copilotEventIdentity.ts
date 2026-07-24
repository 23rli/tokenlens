import type { PromptEvent } from '@tokentama/shared-types';
import { createHash } from 'node:crypto';

type EventIdentityInput = Pick<
  PromptEvent,
  'sessionId' | 'sourceRequestId' | 'timestamp' | 'turnIndex' | 'model' | 'promptText'
>;

export interface CopilotEventIdentity {
  /** Best available identity. Stable request IDs survive Copilot compaction. */
  primary: string;
  /** Stable fallback used to migrate a preliminary event once its request ID appears. */
  timestamp?: string;
  /** Canonical source time, used only with the same pending turn index. */
  occurredAt?: string;
}

/**
 * Build a watcher identity without relying on Copilot's mutable turn index.
 * The index is used only when the source provides neither a request ID nor a
 * valid timestamp, matching the durable ledger's evidence precedence.
 */
export function copilotEventIdentity(
  event: EventIdentityInput,
  workspaceHash = '',
): CopilotEventIdentity {
  const scope = [workspaceHash, event.sessionId];
  const timestamp = canonicalTimestamp(event.timestamp);
  const timestampKey = timestamp
    ? JSON.stringify([
        'timestamp',
        ...scope,
        timestamp,
        event.model?.id ?? 'unknown-model',
        promptDigest(event.promptText),
      ])
    : undefined;

  if (event.sourceRequestId) {
    return {
      primary: JSON.stringify(['request-id', ...scope, event.sourceRequestId]),
      timestamp: timestampKey,
      occurredAt: timestamp,
    };
  }
  if (timestampKey) {
    return { primary: timestampKey, timestamp: timestampKey, occurredAt: timestamp };
  }
  return {
    primary: JSON.stringify([
      'legacy-index-fallback',
      ...scope,
      event.turnIndex,
      event.model?.id ?? 'unknown-model',
    ]),
  };
}

function canonicalTimestamp(value: string): string | undefined {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString();
}

function promptDigest(value: string): string {
  return createHash('sha256')
    .update(value.replace(/\s+/g, ' ').trim())
    .digest('hex');
}
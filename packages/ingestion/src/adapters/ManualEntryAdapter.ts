import { EventEmitter } from 'node:events';
import type { PromptEvent } from '@ecoprompt/shared-types';
import type { IngestionAdapter, PromptEventHandler } from '../types';
import { buildPromptEvent } from '../promptEventFactory';

export interface ManualSubmitInput {
  promptText: string;
  responseText?: string;
  sessionId?: string;
  userId?: string;
  model?: string;
  adoptedPreviousTip?: boolean;
}

/** Always-available fallback: the user types/pastes a prompt to be scored. */
export class ManualEntryAdapter implements IngestionAdapter {
  readonly source = 'manual' as const;
  private readonly emitter = new EventEmitter();
  private counter = 0;
  private readonly sessionId: string;
  private readonly userId: string;

  constructor(opts: { sessionId?: string; userId?: string } = {}) {
    this.sessionId = opts.sessionId ?? `manual-${Date.now()}`;
    this.userId = opts.userId ?? 'local-user';
  }

  start(): void {
    /* nothing to start */
  }

  stop(): void {
    this.emitter.removeAllListeners();
  }

  onPromptEvent(handler: PromptEventHandler): () => void {
    this.emitter.on('event', handler);
    return () => this.emitter.off('event', handler);
  }

  submit(input: ManualSubmitInput): PromptEvent {
    const event = buildPromptEvent({
      source: 'manual',
      sessionId: input.sessionId ?? this.sessionId,
      userId: input.userId ?? this.userId,
      turnIndex: this.counter++,
      promptText: input.promptText,
      responseText: input.responseText,
      toolCalls: [],
      modelFamily: input.model,
      adoptedPreviousTip: input.adoptedPreviousTip,
    });
    this.emitter.emit('event', event);
    return event;
  }
}

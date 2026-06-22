import { EventEmitter } from 'node:events';
import type { PromptEvent } from '@ecoprompt/shared-types';
import type { IngestionAdapter, PromptEventHandler } from '../types';
import { buildPromptEvent } from '../promptEventFactory';
import { DEMO_SCRIPT, type ScriptedStep } from '../demoScript';

/** Plays a pre-baked sequence of prompts for a reliable, repeatable demo. */
export class ScriptedScenarioAdapter implements IngestionAdapter {
  readonly source = 'scripted' as const;
  private readonly emitter = new EventEmitter();
  private readonly steps: ScriptedStep[];
  private index = 0;
  private timer?: ReturnType<typeof setInterval>;
  private sessionId = `demo-${Date.now()}`;

  constructor(steps: ScriptedStep[] = DEMO_SCRIPT) {
    this.steps = steps;
  }

  start(): void {
    /* call next() or play() to advance */
  }

  stop(): void {
    this.pause();
    this.emitter.removeAllListeners();
  }

  onPromptEvent(handler: PromptEventHandler): () => void {
    this.emitter.on('event', handler);
    return () => this.emitter.off('event', handler);
  }

  get length(): number {
    return this.steps.length;
  }

  get position(): number {
    return this.index;
  }

  peek(): ScriptedStep | undefined {
    return this.steps[this.index];
  }

  hasNext(): boolean {
    return this.index < this.steps.length;
  }

  reset(): void {
    this.pause();
    this.index = 0;
    this.sessionId = `demo-${Date.now()}`;
  }

  next(): PromptEvent | undefined {
    const step = this.steps[this.index];
    if (!step) return undefined;
    const event = buildPromptEvent({
      source: 'scripted',
      sessionId: this.sessionId,
      userId: 'demo-user',
      turnIndex: this.index,
      promptText: step.promptText,
      responseText: step.responseText,
      toolCalls: step.toolCalls ?? [],
      modelFamily: step.model ?? 'claude-opus-4.6',
      retryCountInSession: step.retryCountInSession,
      adoptedPreviousTip: step.adoptedPreviousTip,
    });
    this.index++;
    this.emitter.emit('event', event);
    return event;
  }

  /** Auto-advance through the script on an interval until complete. */
  play(intervalMs = 2600): void {
    this.pause();
    this.timer = setInterval(() => {
      if (!this.hasNext()) {
        this.pause();
        return;
      }
      this.next();
    }, intervalMs);
  }

  pause(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}

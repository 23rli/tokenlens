import type { ScorePromptResponse, TipResponse, WasteCategory } from '@ecoprompt/shared-types';

export type IngestionMode = 'scripted' | 'manual' | 'live';
export type WindowMode = 'minimized' | 'expanded' | 'deep';

/** A fully scored + coached turn, pushed from main to the renderer. */
export interface ScoreEvent {
  sessionId: string;
  turnIndex: number;
  promptText: string;
  promptExcerpt: string;
  label?: string;
  narration?: string;
  response: ScorePromptResponse;
  tip: TipResponse;
  source: 'api' | 'local';
  timestamp: string;
}

export interface StatusEvent {
  apiOnline: boolean;
  coachConfigured: boolean;
  mode: IngestionMode;
  scriptedPosition: number;
  scriptedLength: number;
  storage: string;
  liveAvailable: boolean;
}

export interface SessionMetrics {
  sessionId: string;
  promptCount: number;
  averageScore: number;
  currentScore: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  estimatedTokensSaved: number;
  estimatedCostSavedUsd: number;
  retriesDetected: number;
  toolCallsTotal: number;
  wasteByCategory: Partial<Record<WasteCategory, number>>;
}

/** IPC channel names shared by main, preload, and renderer. */
export const IPC = {
  GET_STATUS: 'eco:getStatus',
  SET_MODE: 'eco:setMode',
  SCRIPTED_NEXT: 'eco:scriptedNext',
  SCRIPTED_PLAY: 'eco:scriptedPlay',
  SCRIPTED_PAUSE: 'eco:scriptedPause',
  SCRIPTED_RESET: 'eco:scriptedReset',
  SUBMIT_MANUAL: 'eco:submitManual',
  ACCEPT_REWRITE: 'eco:acceptRewrite',
  GET_METRICS: 'eco:getMetrics',
  SET_WINDOW_MODE: 'eco:setWindowMode',
  QUIT: 'eco:quit',
  SCORE_EVENT: 'eco:scoreEvent',
  STATUS_EVENT: 'eco:statusEvent',
} as const;

/** The API surface exposed to the renderer on `window.eco`. */
export interface EcoApi {
  getStatus(): Promise<StatusEvent>;
  setMode(mode: IngestionMode): Promise<boolean>;
  scriptedNext(): Promise<void>;
  scriptedPlay(): Promise<void>;
  scriptedPause(): Promise<void>;
  scriptedReset(): Promise<void>;
  submitManual(text: string): Promise<void>;
  acceptRewrite(rewrite?: string): Promise<void>;
  getMetrics(): Promise<SessionMetrics>;
  setWindowMode(mode: WindowMode): Promise<void>;
  quit(): Promise<void>;
  onScore(cb: (e: ScoreEvent) => void): () => void;
  onStatus(cb: (s: StatusEvent) => void): () => void;
}

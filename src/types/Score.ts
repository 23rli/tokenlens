import type { PetWorldState } from './PetWorldState';
import type { TokenEstimate } from './PromptEvent';

/** Avoidable-waste categories that make up the Waste Score (design doc §10.4). */
export type WasteCategory =
  | 'redundantContext'
  | 'vagueness'
  | 'retryLoop'
  | 'toolOveruse'
  | 'verbosityMismatch'
  | 'ignoredCoaching';

export interface ScoreToolCall {
  toolName: string;
  durationMs?: number;
  success?: boolean;
}

export interface ScorePromptMetadata {
  promptLengthChars: number;
  estimatedInputTokens?: number;
  estimatedOutputTokens?: number;
  retryCountInSession?: number;
  modelName?: string;
}

/** Request contract for POST /scorePrompt (design doc §19.1, extended). */
export interface ScorePromptRequest {
  sessionId: string;
  userId: string;
  promptText: string;
  responseText?: string;
  toolCalls?: ScoreToolCall[];
  metadata?: ScorePromptMetadata;
  /** Recent prompts in the session, used for retry/redundancy detection. */
  recentPrompts?: string[];
  /** Whether the user adopted the previous coaching suggestion (learning signal). */
  adoptedPreviousTip?: boolean;
}

/** The five efficiency subdimensions (design doc §10.3). 0..100 each. */
export interface Subscores {
  promptQuality: number;
  contextEfficiency: number;
  toolEfficiency: number;
  outputEfficiency: number;
  learningAdoption: number;
}

/** Transparent, per-category contribution to the Waste Score. */
export interface WasteComponent {
  category: WasteCategory;
  /** 0..1 severity before weighting. */
  severity: number;
  /** Points contributed to the 0..100 Waste Score. */
  weightedPoints: number;
  reason: string;
}

/** Response contract for POST /scorePrompt (design doc §19.2, extended). */
export interface ScorePromptResponse {
  overallScore: number;
  wasteScore: number;
  subscores: Subscores;
  reasons: string[];
  improvements: string[];
  petState: PetWorldState;
  /** Change in overall score vs. the session's previous prompt. */
  delta: number;
  wasteBreakdown: WasteComponent[];
  tokens?: TokenEstimate;
}

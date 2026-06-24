import type { PetWorldState } from './PetWorldState';
import type { WasteCategory } from './Score';

/** Aggregated, demo-friendly metrics for a session (powers the metrics tab). */
export interface SessionSummary {
  sessionId: string;
  userId: string;
  promptCount: number;
  averageScore: number;
  currentScore: number;
  petState: PetWorldState;
  totalEstimatedInputTokens: number;
  totalEstimatedOutputTokens: number;
  totalEstimatedCostUsd: number;
  /** Modeled savings if the user adopts coaching (directional, not precise). */
  estimatedTokensSaved: number;
  estimatedCostSavedUsd: number;
  retriesDetected: number;
  toolCallsTotal: number;
  wasteByCategory: Record<WasteCategory, number>;
  startedAt: string;
  updatedAt: string;
}

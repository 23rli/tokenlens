import type { WasteCategory } from './Score';

export interface TipRequest {
  promptText: string;
  responseText?: string;
  reasons: string[];
  improvements: string[];
  wasteCategories: WasteCategory[];
  overallScore: number;
  model?: string;
}

export interface EstimatedSavings {
  estimatedTokenReductionPct?: number;
  estimatedLatencyReductionPct?: number;
}

/** Response contract for POST /generateTip (design doc §19.3, extended). */
export interface TipResponse {
  shortTip: string;
  detailedTip: string;
  rewrittenPrompt?: string;
  estimatedSavings?: EstimatedSavings;
  /** "heuristic" or the LLM provider name — surfaced in the UI for transparency. */
  source: string;
}

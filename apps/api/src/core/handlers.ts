import type {
  ScorePromptRequest,
  ScorePromptResponse,
  SessionSummary,
  TipRequest,
  TipResponse,
  WasteCategory,
} from '@ecoprompt/shared-types';
import { scorePrompt, dominantWasteCategories, transition } from '@ecoprompt/scoring-engine';
import { generateTip, isCoachConfigured, loadCoachConfig } from '@ecoprompt/llm-adapters';
import { createScoreStore, type ScoreRecord, type ScoreStore } from '../lib/storage';
import { buildSessionSummary } from './summary';
import { trackEvent, isTelemetryConfigured } from '../lib/telemetry';

const store: ScoreStore = createScoreStore();

function recordFromResponse(
  req: ScorePromptRequest,
  resp: ScorePromptResponse,
  turnIndex: number,
): ScoreRecord {
  const wasteByCategory = resp.wasteBreakdown.reduce(
    (acc, c) => {
      acc[c.category] = c.weightedPoints;
      return acc;
    },
    {} as Record<WasteCategory, number>,
  );
  return {
    sessionId: req.sessionId,
    userId: req.userId,
    turnIndex,
    timestamp: new Date().toISOString(),
    overallScore: resp.overallScore,
    wasteScore: resp.wasteScore,
    petState: resp.petState,
    inputTokens: resp.tokens?.inputTokens ?? 0,
    outputTokens: resp.tokens?.outputTokens ?? 0,
    estimatedCostUsd: resp.tokens?.estimatedCostUsd ?? 0,
    toolCalls: req.toolCalls?.length ?? 0,
    retry: (req.metadata?.retryCountInSession ?? 0) > 0,
    wasteByCategory,
  };
}

/** POST /scorePrompt — score a prompt, persist it, emit telemetry. */
export async function handleScorePrompt(req: ScorePromptRequest): Promise<ScorePromptResponse> {
  const prior = await store.listBySession(req.sessionId);
  const previousScore = prior.length ? prior[prior.length - 1]!.overallScore : null;

  const resp = scorePrompt(req, { previousScore, hadPreviousTip: prior.length > 0 });
  const turnIndex = prior.length;
  await store.append(recordFromResponse(req, resp, turnIndex));

  const change = transition(previousScore, resp.overallScore);
  trackEvent({
    name: 'prompt_scored',
    sessionId: req.sessionId,
    userId: req.userId,
    timestamp: new Date().toISOString(),
    properties: { petState: resp.petState, model: req.metadata?.modelName ?? 'unknown' },
    measurements: {
      overallScore: resp.overallScore,
      wasteScore: resp.wasteScore,
      delta: resp.delta,
      inputTokens: resp.tokens?.inputTokens ?? 0,
      outputTokens: resp.tokens?.outputTokens ?? 0,
    },
  });
  if (change.recovered) {
    trackEvent({
      name: 'score_recovered',
      sessionId: req.sessionId,
      userId: req.userId,
      timestamp: new Date().toISOString(),
      properties: { from: change.previousState ?? 'unknown', to: change.state },
    });
  }
  if (change.previousState && change.previousState !== change.state) {
    trackEvent({
      name: 'pet_state_changed',
      sessionId: req.sessionId,
      userId: req.userId,
      timestamp: new Date().toISOString(),
      properties: { from: change.previousState, to: change.state },
    });
  }

  return resp;
}

/** POST /generateTip — coach the user (LLM if configured, else heuristic). */
export async function handleGenerateTip(req: TipRequest): Promise<TipResponse> {
  const tip = await generateTip(req);
  trackEvent({
    name: 'tip_generated',
    sessionId: 'n/a',
    userId: 'n/a',
    timestamp: new Date().toISOString(),
    properties: { source: tip.source, hasRewrite: String(Boolean(tip.rewrittenPrompt)) },
  });
  return tip;
}

export interface SessionSummaryRequest {
  sessionId: string;
  userId?: string;
}

/** POST /sessionSummary — aggregate metrics for the metrics tab. */
export async function handleSessionSummary(req: SessionSummaryRequest): Promise<SessionSummary> {
  const records = await store.listBySession(req.sessionId);
  return buildSessionSummary(req.sessionId, req.userId ?? 'local-user', records);
}

export interface HealthResponse {
  status: 'ok';
  time: string;
  storage: string;
  coachConfigured: boolean;
  telemetryConfigured: boolean;
}

/** GET /health — readiness + configuration snapshot. */
export async function handleHealth(): Promise<HealthResponse> {
  return {
    status: 'ok',
    time: new Date().toISOString(),
    storage: store.kind,
    coachConfigured: isCoachConfigured(loadCoachConfig()),
    telemetryConfigured: isTelemetryConfigured(),
  };
}

export { dominantWasteCategories };

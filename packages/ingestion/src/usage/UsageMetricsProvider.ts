import type { PromptEvent } from '@ecoprompt/shared-types';

export interface UsageSnapshot {
  sessionId: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  source: string;
  asOf: string;
}

/**
 * Pluggable usage source. Decouples the real-time loop from any single data
 * provider so an enterprise rollup can drop in without the demo depending on it.
 * (See the AIUsageMetrics design decision.)
 */
export interface UsageMetricsProvider {
  readonly name: string;
  isConfigured(): boolean;
  getSessionUsage(sessionId: string, events: PromptEvent[]): Promise<UsageSnapshot>;
}

function aggregate(sessionId: string, events: PromptEvent[], source: string): UsageSnapshot {
  let inputTokens = 0;
  let outputTokens = 0;
  let cost = 0;
  for (const e of events) {
    if (!e.tokens) continue;
    inputTokens += e.tokens.inputTokens;
    outputTokens += e.tokens.outputTokens;
    cost += e.tokens.estimatedCostUsd;
  }
  return {
    sessionId,
    inputTokens,
    outputTokens,
    estimatedCostUsd: Math.round(cost * 1e6) / 1e6,
    source,
    asOf: new Date().toISOString(),
  };
}

/** Default provider: aggregates the locally intercepted Copilot usage. */
export class LocalCopilotUsageProvider implements UsageMetricsProvider {
  readonly name = 'local-copilot';
  isConfigured(): boolean {
    return true;
  }
  async getSessionUsage(sessionId: string, events: PromptEvent[]): Promise<UsageSnapshot> {
    return aggregate(sessionId, events, this.name);
  }
}

/** Fallback provider: tokenizer estimates only (no real interception). */
export class EstimatedUsageProvider implements UsageMetricsProvider {
  readonly name = 'estimated';
  isConfigured(): boolean {
    return true;
  }
  async getSessionUsage(sessionId: string, events: PromptEvent[]): Promise<UsageSnapshot> {
    return aggregate(sessionId, events, this.name);
  }
}

/**
 * Enterprise rollup seam. In production this would query an authorized source
 * such as the MSIT "AI Usage Metrics" Power BI dataset (Power BI REST
 * `executeQueries`) or an approved CSV export. Intentionally a documented stub
 * so the demo never depends on gated corporate data.
 */
export class EnterpriseMetricsProvider implements UsageMetricsProvider {
  readonly name = 'enterprise-powerbi';
  constructor(
    private readonly config: {
      datasetId?: string;
      endpoint?: string;
      accessToken?: string;
    } = {},
  ) {}

  isConfigured(): boolean {
    return Boolean(this.config.datasetId && this.config.accessToken);
  }

  async getSessionUsage(): Promise<UsageSnapshot> {
    throw new Error(
      'EnterpriseMetricsProvider is not configured. Provide an authorized Power BI dataset id + access token to enable org-level rollup.',
    );
  }
}

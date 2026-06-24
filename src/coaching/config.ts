export type CoachProvider = 'none' | 'azure-openai' | 'foundry' | 'openai';

export interface CoachConfig {
  provider: CoachProvider;
  endpoint?: string;
  apiKey?: string;
  deployment?: string;
  apiVersion: string;
  timeoutMs: number;
}

/** Read coach configuration from the environment. Defaults to the heuristic coach. */
export function loadCoachConfig(env: NodeJS.ProcessEnv = process.env): CoachConfig {
  const provider = (env.ECO_LLM_PROVIDER ?? 'none') as CoachProvider;
  return {
    provider,
    endpoint: env.ECO_LLM_ENDPOINT || undefined,
    apiKey: env.ECO_LLM_API_KEY || undefined,
    deployment: env.ECO_LLM_DEPLOYMENT || undefined,
    apiVersion: env.ECO_LLM_API_VERSION || '2024-10-21',
    timeoutMs: Number(env.ECO_LLM_TIMEOUT_MS ?? 12000),
  };
}

export function isCoachConfigured(config: CoachConfig): boolean {
  return config.provider !== 'none' && Boolean(config.endpoint) && Boolean(config.apiKey);
}

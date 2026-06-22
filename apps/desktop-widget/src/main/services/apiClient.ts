import type {
  ScorePromptRequest,
  ScorePromptResponse,
  TipRequest,
  TipResponse,
} from '@ecoprompt/shared-types';
import { scorePrompt } from '@ecoprompt/scoring-engine';
import { generateTip as localGenerateTip } from '@ecoprompt/llm-adapters';

export interface ApiClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
}

/**
 * Talks to the canonical scoring API, but transparently falls back to the local
 * scoring-engine / heuristic coach so the demo keeps working if the API is down.
 */
export class ApiClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  online = false;
  storage = 'local';
  coachConfigured = false;

  constructor(opts: ApiClientOptions = {}) {
    this.baseUrl = opts.baseUrl ?? process.env['ECO_API_URL'] ?? 'http://localhost:7071/api';
    this.timeoutMs = opts.timeoutMs ?? 1500;
  }

  private async fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Probe the API; updates online/storage/coachConfigured. Never throws. */
  async health(): Promise<void> {
    try {
      const h = await this.fetchJson<{ status: string; storage: string; coachConfigured: boolean }>(
        '/health',
        { method: 'GET' },
      );
      this.online = h.status === 'ok';
      this.storage = h.storage;
      this.coachConfigured = h.coachConfigured;
    } catch {
      this.online = false;
      this.storage = 'local';
      this.coachConfigured = false;
    }
  }

  async scorePrompt(
    req: ScorePromptRequest,
    previousScore: number | null,
    hadPreviousTip: boolean,
  ): Promise<{ resp: ScorePromptResponse; source: 'api' | 'local' }> {
    if (this.online) {
      try {
        const resp = await this.fetchJson<ScorePromptResponse>('/scorePrompt', {
          method: 'POST',
          body: JSON.stringify(req),
        });
        return { resp, source: 'api' };
      } catch {
        this.online = false;
      }
    }
    return { resp: scorePrompt(req, { previousScore, hadPreviousTip }), source: 'local' };
  }

  async generateTip(req: TipRequest): Promise<TipResponse> {
    if (this.online) {
      try {
        return await this.fetchJson<TipResponse>('/generateTip', {
          method: 'POST',
          body: JSON.stringify(req),
        });
      } catch {
        this.online = false;
      }
    }
    return localGenerateTip(req);
  }
}

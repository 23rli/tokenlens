import type { PetWorldState, WasteCategory } from '@ecoprompt/shared-types';

export interface ScoreRecord {
  sessionId: string;
  userId: string;
  turnIndex: number;
  timestamp: string;
  overallScore: number;
  wasteScore: number;
  petState: PetWorldState;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  toolCalls: number;
  retry: boolean;
  wasteByCategory: Record<WasteCategory, number>;
}

export interface ScoreStore {
  readonly kind: string;
  append(record: ScoreRecord): Promise<void>;
  listBySession(sessionId: string): Promise<ScoreRecord[]>;
}

/** Default in-process store — perfect for the local demo and tests. */
export class InMemoryScoreStore implements ScoreStore {
  readonly kind = 'memory';
  private readonly bySession = new Map<string, ScoreRecord[]>();

  async append(record: ScoreRecord): Promise<void> {
    const list = this.bySession.get(record.sessionId) ?? [];
    list.push(record);
    this.bySession.set(record.sessionId, list);
  }

  async listBySession(sessionId: string): Promise<ScoreRecord[]> {
    return [...(this.bySession.get(sessionId) ?? [])];
  }
}

/** Azure Table Storage store for the real-Azure deployment. Lazily loaded. */
export class TableScoreStore implements ScoreStore {
  readonly kind = 'table';
  private clientPromise?: Promise<any>;

  constructor(
    private readonly connectionString: string,
    private readonly tableName = 'EcoPromptScores',
  ) {}

  private async getClient(): Promise<any> {
    if (!this.clientPromise) {
      this.clientPromise = (async () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { TableClient } = require('@azure/data-tables');
        const client = TableClient.fromConnectionString(this.connectionString, this.tableName);
        try {
          await client.createTable();
        } catch {
          /* table already exists */
        }
        return client;
      })();
    }
    return this.clientPromise;
  }

  async append(record: ScoreRecord): Promise<void> {
    const client = await this.getClient();
    await client.createEntity({
      partitionKey: sanitizeKey(record.sessionId),
      rowKey: `${record.timestamp}-${record.turnIndex}`,
      ...record,
      wasteByCategory: JSON.stringify(record.wasteByCategory),
    });
  }

  async listBySession(sessionId: string): Promise<ScoreRecord[]> {
    const client = await this.getClient();
    const records: ScoreRecord[] = [];
    const entities = client.listEntities({
      queryOptions: { filter: `PartitionKey eq '${sanitizeKey(sessionId)}'` },
    });
    for await (const e of entities) {
      records.push({
        ...(e as ScoreRecord),
        wasteByCategory: safeParseCategories(e.wasteByCategory),
      });
    }
    return records.sort((a, b) => a.turnIndex - b.turnIndex);
  }
}

function sanitizeKey(key: string): string {
  return key.replace(/[/\\#?]/g, '_');
}

function safeParseCategories(value: unknown): Record<WasteCategory, number> {
  const empty: Record<WasteCategory, number> = {
    redundantContext: 0,
    vagueness: 0,
    retryLoop: 0,
    toolOveruse: 0,
    verbosityMismatch: 0,
    ignoredCoaching: 0,
  };
  if (typeof value !== 'string') return empty;
  try {
    return { ...empty, ...(JSON.parse(value) as Record<WasteCategory, number>) };
  } catch {
    return empty;
  }
}

export function createScoreStore(env: NodeJS.ProcessEnv = process.env): ScoreStore {
  const connectionString = env.ECO_STORAGE_CONNECTION_STRING;
  if (connectionString && connectionString !== 'UseDevelopmentStorage=true') {
    try {
      return new TableScoreStore(connectionString);
    } catch {
      /* fall back to memory */
    }
  }
  return new InMemoryScoreStore();
}

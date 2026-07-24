import { randomUUID } from 'node:crypto';
import {
  appendFile,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
} from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import type {
  LocalLedgerDiagnostics,
  MaterializedUsageRecord,
  UsageObservation,
} from '@tokentama/shared-types';
import { materializeUsageObservations } from './materialize';
import { isUsageObservation } from './validate';

export interface LedgerAppendResult {
  requested: number;
  appended: number;
  duplicatesSkipped: number;
}

interface LedgerReadResult {
  observations: UsageObservation[];
  signature: string;
  fileCount: number;
  storageBytes: number;
  malformedLines: number;
  malformedFiles: string[];
  readFailures: boolean;
}

interface LedgerFileInfo {
  path: string;
  size: number;
  modifiedMs: number;
}

interface MaterializedLedgerSnapshot {
  records: MaterializedUsageRecord[];
  diagnostics: LocalLedgerDiagnostics;
}

/** Dependency-free append-only local metadata ledger. */
export class LocalUsageLedger {
  private readonly writerId = randomUUID();
  private readonly knownObservationIds = new Set<string>();
  private initPromise?: Promise<void>;
  private writeQueue: Promise<void> = Promise.resolve();
  private materializedCache?: {
    signature: string;
    snapshot: MaterializedLedgerSnapshot;
  };

  constructor(private readonly root: string) {}

  get storageRoot(): string {
    return this.root;
  }

  initialize(): Promise<void> {
    this.initPromise ??= this.loadKnownIds();
    return this.initPromise;
  }

  async append(observations: readonly UsageObservation[]): Promise<LedgerAppendResult> {
    await this.initialize();
    const unique = new Map<string, UsageObservation>();
    for (const observation of observations) {
      if (isUsageObservation(observation)) unique.set(observation.observationId, observation);
    }
    let result: LedgerAppendResult | undefined;
    const operation = this.writeQueue.then(async () => {
      const pending = [...unique.values()].filter(
        (observation) => !this.knownObservationIds.has(observation.observationId),
      );
      await this.appendInternal(pending);
      result = {
        requested: observations.length,
        appended: pending.length,
        duplicatesSkipped: observations.length - pending.length,
      };
    });
    this.writeQueue = operation;
    await operation;
    return result!;
  }

  async materialize(): Promise<MaterializedLedgerSnapshot> {
    await this.initialize();
    await this.writeQueue;
    const files = await listJsonlFileInfo(this.root);
    const signature = ledgerFileSignature(this.root, files);
    if (this.materializedCache?.signature === signature) {
      return this.materializedCache.snapshot;
    }
    const read = await this.readAll(files, signature);
    const snapshot = materializeRead(read);
    if (!read.readFailures) this.materializedCache = { signature, snapshot };
    return snapshot;
  }

  async clear(): Promise<void> {
    await this.writeQueue;
    await rm(this.root, { recursive: true, force: true });
    this.knownObservationIds.clear();
    this.materializedCache = undefined;
    this.initPromise = undefined;
  }

  private async loadKnownIds(): Promise<void> {
    await mkdir(this.root, { recursive: true });
    const files = await listJsonlFileInfo(this.root);
    const signature = ledgerFileSignature(this.root, files);
    const read = await this.readAll(files, signature);
    for (const observation of read.observations) {
      this.knownObservationIds.add(observation.observationId);
    }
    if (!read.readFailures) {
      this.materializedCache = { signature, snapshot: materializeRead(read) };
    }
  }

  private async appendInternal(observations: UsageObservation[]): Promise<void> {
    if (observations.length === 0) return;
    this.materializedCache = undefined;
    const byFile = new Map<string, UsageObservation[]>();
    for (const observation of observations) {
      const month = /^\d{4}-\d{2}/.exec(observation.occurredAt)?.[0] ?? 'unknown';
      const adapter = safeSegment(observation.source.adapterId);
      const file = join(this.root, 'writers', this.writerId, adapter, `${month}.jsonl`);
      const rows = byFile.get(file) ?? [];
      rows.push(observation);
      byFile.set(file, rows);
    }
    for (const [file, rows] of byFile) {
      await mkdir(dirname(file), { recursive: true });
      await appendFile(file, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8');
      for (const row of rows) this.knownObservationIds.add(row.observationId);
    }
  }

  private async readAll(
    filesInput?: LedgerFileInfo[],
    signatureInput?: string,
  ): Promise<LedgerReadResult> {
    const files = filesInput ?? await listJsonlFileInfo(this.root);
    const signature = signatureInput ?? ledgerFileSignature(this.root, files);
    const observations: UsageObservation[] = [];
    let malformedLines = 0;
    const malformedFiles = new Set<string>();
    let readFailures = false;
    const storageBytes = files.reduce((sum, file) => sum + file.size, 0);
    for (const file of files) {
      try {
        const content = await readFile(file.path, 'utf8');
        for (const line of content.split(/\r?\n/)) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line) as unknown;
            if (isUsageObservation(parsed)) observations.push(parsed);
            else {
              malformedLines += 1;
              malformedFiles.add(relative(this.root, file.path));
            }
          } catch {
            malformedLines += 1;
            malformedFiles.add(relative(this.root, file.path));
          }
        }
      } catch {
        malformedLines += 1;
        readFailures = true;
        malformedFiles.add(relative(this.root, file.path));
      }
    }
    return {
      observations,
      signature,
      fileCount: files.length,
      storageBytes,
      malformedLines,
      malformedFiles: [...malformedFiles].sort(),
      readFailures,
    };
  }
}

function materializeRead(read: LedgerReadResult): MaterializedLedgerSnapshot {
  const materialized = materializeUsageObservations(read.observations);
  const records = materialized.records;
  return {
    records,
    diagnostics: {
      schemaVersion: 1,
      observationCount: materialized.uniqueObservationCount,
      recordCount: records.length,
      fileCount: read.fileCount,
      storageBytes: read.storageBytes,
      malformedLines: read.malformedLines,
      malformedFiles: read.malformedFiles,
      duplicateObservations: materialized.duplicateObservations,
      conflictingRecords: records.filter((record) => record.conflictFields.length > 0).length,
      oldestAt: records.at(-1)?.occurredAt,
      newestAt: records[0]?.occurredAt,
      retention: 'until-cleared',
    },
  };
}

async function listJsonlFileInfo(root: string): Promise<LedgerFileInfo[]> {
  const result: LedgerFileInfo[] = [];
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return result;
  }
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) result.push(...await listJsonlFileInfo(path));
    else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      try {
        const info = await stat(path);
        result.push({ path, size: info.size, modifiedMs: info.mtimeMs });
      } catch {
        // A concurrent clear/rotation will change the next signature and retry.
      }
    }
  }
  return result.sort((a, b) => a.path.localeCompare(b.path));
}

function ledgerFileSignature(root: string, files: readonly LedgerFileInfo[]): string {
  return JSON.stringify(files.map((file) => [
    relative(root, file.path),
    file.modifiedMs,
    file.size,
  ]));
}

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 100) || 'unknown';
}
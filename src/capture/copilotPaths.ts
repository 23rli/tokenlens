import { homedir } from 'node:os';
import { join } from 'node:path';
import { readdirSync, statSync } from 'node:fs';

export interface CopilotSessionPaths {
  sessionId: string;
  workspaceHash: string;
  /** Copilot can create `chatSessions` before (or without) a transcript. */
  transcriptPath?: string;
  chatSessionPath?: string;
  modelsJsonPath?: string;
  modifiedMs: number;
  /** Combined source bytes distinguish rapid appends on coarse-mtime filesystems. */
  sourceBytes?: number;
  /** Per-file source metadata avoids collisions hidden by max-mtime + total-size. */
  sourceSignature?: string;
  /** Workspace metadata affects ledger projection (project alias), not chat content. */
  workspaceSignature?: string;
}

/** Root of VS Code per-workspace storage (stable build). Override via env or arg. */
export function getWorkspaceStorageRoot(override?: string): string {
  if (override) return override;
  const configuredRoot =
    process.env.TOKENLENS_COPILOT_WORKSPACE_STORAGE ??
    process.env.ECO_COPILOT_WORKSPACE_STORAGE;
  if (configuredRoot) {
    return configuredRoot;
  }
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'Code', 'User', 'workspaceStorage');
  }
  if (process.platform !== 'win32') {
    const configHome = process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config');
    return join(configHome, 'Code', 'User', 'workspaceStorage');
  }
  const appData = process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming');
  return join(appData, 'Code', 'User', 'workspaceStorage');
}

function safeReaddir(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

interface SourceFileStat {
  mtimeMs: number;
  size: number;
}

function safeStat(p: string): SourceFileStat | undefined {
  try {
    const stat = statSync(p);
    return stat.isFile() ? { mtimeMs: stat.mtimeMs, size: stat.size } : undefined;
  } catch {
    return undefined;
  }
}

/** One canonical signature shared by every reader/projection cache. */
export function copilotSessionSourceSignature(paths: CopilotSessionPaths): string {
  return paths.sourceSignature ?? `${paths.modifiedMs}:${paths.sourceBytes ?? 'unknown'}`;
}

/** Source plus workspace metadata used by content-free ledger projections. */
export function copilotSessionProjectionSignature(paths: CopilotSessionPaths): string {
  return JSON.stringify([
    copilotSessionSourceSignature(paths),
    paths.workspaceSignature ?? 'unknown-workspace-metadata',
  ]);
}

/** Enumerate all Copilot chat sessions on disk, newest source file first. */
export function listCopilotSessions(
  root = getWorkspaceStorageRoot(),
  onlyHash?: string,
): CopilotSessionPaths[] {
  const sessions: CopilotSessionPaths[] = [];

  const hashes = onlyHash ? [onlyHash] : safeReaddir(root);
  for (const hash of hashes) {
    const transcriptsDir = join(root, hash, 'GitHub.copilot-chat', 'transcripts');
    const chatSessionsDir = join(root, hash, 'chatSessions');
    const workspaceStat = safeStat(join(root, hash, 'workspace.json'));
    const workspaceSignature = workspaceStat
      ? JSON.stringify([workspaceStat.mtimeMs, workspaceStat.size])
      : undefined;
    const files = new Set([
      ...safeReaddir(transcriptsDir),
      ...safeReaddir(chatSessionsDir),
    ]);

    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue;
      const sessionId = file.replace(/\.jsonl$/, '');
      const transcriptPath = join(transcriptsDir, file);
      const chatSessionPath = join(chatSessionsDir, file);
      const transcriptStat = safeStat(transcriptPath);
      const chatSessionStat = safeStat(chatSessionPath);
      if (!transcriptStat && !chatSessionStat) continue;
      const modelsCandidate = join(
        root,
        hash,
        'GitHub.copilot-chat',
        'debug-logs',
        sessionId,
        'models.json',
      );
      const modelsStat = safeStat(modelsCandidate);
      const modelsJsonPath = modelsStat ? modelsCandidate : undefined;
      const sourceStats = [transcriptStat, chatSessionStat, modelsStat];
      sessions.push({
        sessionId,
        workspaceHash: hash,
        transcriptPath: transcriptStat ? transcriptPath : undefined,
        chatSessionPath: chatSessionStat ? chatSessionPath : undefined,
        modelsJsonPath,
        modifiedMs: Math.max(...sourceStats.map((source) => source?.mtimeMs ?? 0)),
        sourceBytes: sourceStats.reduce((sum, source) => sum + (source?.size ?? 0), 0),
        sourceSignature: JSON.stringify(sourceStats.map((source) =>
          source ? [source.mtimeMs, source.size] : null,
        )),
        workspaceSignature,
      });
    }
  }
  return sessions.sort((a, b) =>
    b.modifiedMs - a.modifiedMs ||
    a.workspaceHash.localeCompare(b.workspaceHash) ||
    a.sessionId.localeCompare(b.sessionId),
  );
}

/** The most recently active Copilot chat session, if any. */
export function findActiveSession(
  root = getWorkspaceStorageRoot(),
  onlyHash?: string,
): CopilotSessionPaths | undefined {
  return listCopilotSessions(root, onlyHash)[0];
}

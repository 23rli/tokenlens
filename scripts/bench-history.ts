/**
 * Real-history token-savings benchmark. Reads your ACTUAL Copilot chat sessions
 * from disk, runs the offline rewrite over the real prompts, and measures real
 * numbers: metered tokens per session, prompt-text compression, and the cost of
 * real retry/re-ask loops that a clearer first prompt would avoid.
 *
 * Everything stays local. Picks the 5 longest conversations (~20 turns each).
 * Run: `npm run bench:history`  (or: node scripts/run-bench.mjs bench-history.ts)
 */
import { readFileSync } from 'node:fs';
import { listCopilotSessions } from '../src/capture/copilotPaths';
import {
  parseTranscript,
  parseChatSession,
  parseChatSessionTokens,
  type TurnTokens,
} from '@tokentama/ingestion';
import { leanRewrite } from '@tokentama/llm-adapters';
import { estimateTokens, similarity } from '@tokentama/scoring-engine';

const N_SESSIONS = 5;
const MIN_TURNS = 8; // a "conversation" worth measuring
const RETRY_RE =
  /^(?:it'?s |it |that |this |still|nope|no[,.\s]|hmm|wait|actually|that (?:didn'?t|did not)|(?:doesn'?t|does not) work|not working|broken|same (?:as|error|issue)|try again|again[,.\s]|error|failed|fix it|didn'?t work)/i;

function readText(path: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}

interface SessionData {
  id: string;
  prompts: string[];
  responses: string[];
  real: (TurnTokens | undefined)[]; // aligned to user-turn order
  hasReal: boolean;
  model?: ReturnType<typeof parseChatSession>['model'];
}

function loadSession(s: ReturnType<typeof listCopilotSessions>[number]): SessionData | undefined {
  const parsed = parseTranscript(readText(s.transcriptPath));
  const turns = parsed.turns.filter((t) => (t.promptText ?? '').trim().length > 0);
  if (turns.length < MIN_TURNS) return undefined;

  let realArr: (TurnTokens | undefined)[] = [];
  let model: SessionData['model'];
  if (s.chatSessionPath) {
    const content = readText(s.chatSessionPath);
    if (content) {
      const map = parseChatSessionTokens(content);
      realArr = [...map.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
      model = parseChatSession(content).model;
    }
  }

  return {
    id: s.sessionId.slice(0, 8),
    prompts: turns.map((t) => (t.promptText ?? '').trim()),
    responses: turns.map((t) => t.responseText ?? ''),
    real: turns.map((_, i) => realArr[i]),
    hasReal: realArr.length > 0,
    model,
  };
}

function isRetry(cur: string, prev: string | undefined): boolean {
  if (!prev) return false;
  if (similarity(cur, prev) >= 0.45) return true;
  return cur.length < 90 && RETRY_RE.test(cur.trim());
}

function pct(before: number, after: number): number {
  return before <= 0 ? 0 : Math.round((1 - after / before) * 100);
}

console.log('\n=== Tokentama — real Copilot history benchmark ===\n');

const all = listCopilotSessions();
const loaded = all
  .map(loadSession)
  .filter((x): x is SessionData => x != null)
  .sort((a, b) => b.prompts.length - a.prompts.length)
  .slice(0, N_SESSIONS);

if (loaded.length === 0) {
  console.log('No Copilot chat sessions with enough turns were found on this machine.');
  console.log('(Looked under %APPDATA%/Code/User/workspaceStorage/**/GitHub.copilot-chat/.)\n');
} else {
  let gTotal = 0;
  let gAfter = 0;
  let gRealCredits = 0;
  let gRealCreditsAfter = 0;
  let gRealCreditTurns = 0;

  for (const s of loaded) {
    let processed = 0; // sum of per-turn full model input+output (re-sent context included)
    let compressionSaved = 0; // measured prompt-text tokens removed
    let retryTokens = 0; // whole-turn tokens spent on real re-asks
    let retries = 0;
    let realCredits = 0;
    let realCreditsAfter = 0;
    let realCreditTurns = 0;

    for (let i = 0; i < s.prompts.length; i++) {
      const p = s.prompts[i];
      const real = s.real[i];
      const promptTok = estimateTokens(p);
      const rw = leanRewrite(p).trim();
      const after = rw !== p && rw.length < p.length ? estimateTokens(rw) : promptTok;
      compressionSaved += promptTok - after;

      // Whole-turn cost: prefer real counts, else estimate from text.
      const inTok = real?.promptTokens ?? promptTok;
      const outTok = real?.completionTokens ?? estimateTokens(s.responses[i]);
      const turnTotal = inTok + outTok;
      processed += turnTotal;

      const realCredit = real?.copilotCredits ?? 0;
      if (realCredit > 0) realCreditTurns += 1;
      realCredits += realCredit;

      const retry = isRetry(p, s.prompts[i - 1]);
      if (retry) {
        retries += 1;
        retryTokens += turnTotal;
      } else {
        realCreditsAfter += realCredit;
      }
    }

    // Treatment = clearer prompts avoid the real re-asks + prompts are compressed.
    const afterTotal = processed - retryTokens - compressionSaved;
    const avgCtx = Math.round(processed / s.prompts.length);
    gTotal += processed;
    gAfter += afterTotal;
    gRealCredits += realCredits;
    gRealCreditsAfter += realCreditsAfter;
    gRealCreditTurns += realCreditTurns;

    console.log(`• session ${s.id}…  (${s.prompts.length} turns, tokens ${s.hasReal ? 'REAL' : 'estimated'})`);
    console.log(`  input+output processed across turns: ${processed.toLocaleString()} (~${avgCtx.toLocaleString()}/turn — context is re-sent each turn)`);
    console.log(`  real re-asks detected: ${retries}  ->  ${retryTokens.toLocaleString()} tokens re-sending whole turns`);
    console.log(`  prompt-text compression: ${compressionSaved} tokens`);
    console.log(
      `  savings if re-asks avoided + prompts compressed: ${(processed - afterTotal).toLocaleString()} tokens ` +
        `(${pct(processed, afterTotal)}%)`,
    );
    if (realCredits > 0) {
      console.log(`  real billed credits: ${realCredits.toFixed(2)} -> ${realCreditsAfter.toFixed(2)} AIC`);
    }
    console.log('');
  }

  console.log('--- Across the 5 longest real conversations ---');
  console.log(
    `processed tokens: ${gTotal.toLocaleString()} -> ${gAfter.toLocaleString()}   ` +
      `saved ${(gTotal - gAfter).toLocaleString()} (${pct(gTotal, gAfter)}%)`,
  );
  if (gRealCreditTurns > 0) {
    console.log(
      `real billed credits (${gRealCreditTurns} metered turns): ${gRealCredits.toFixed(2)} -> ` +
        `${gRealCreditsAfter.toFixed(2)} AIC   saved ${(gRealCredits - gRealCreditsAfter).toFixed(2)} AIC`,
    );
  } else {
    console.log('real billed credits: not metered in these agent sessions (rely on the % above).');
  }
  console.log(
    '\nHow to read this: the % is the honest headline. "Processed tokens" sums each turn\'s\n' +
      'full model input (system + tools + the whole re-sent conversation) + output, so absolute\n' +
      'counts look large and are NOT the billed amount (Copilot caches most of the re-sent\n' +
      'context). Prompt-text compression is measured directly; retry-avoidance is the REAL\n' +
      'token cost of your own re-ask turns — it only materializes when a clearer first prompt\n' +
      'prevents the re-ask, which is exactly what the Compose rewrite is for.\n',
  );
}

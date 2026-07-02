import { similarity } from '@tokentama/scoring-engine';
import type { TrainingPair } from '../data/corpusStore';

/**
 * Retrieve the most relevant past (original → lean) rewrites from the corpus to
 * use as few-shot examples — favouring prompts similar to the target and, softly,
 * the same model. This is what makes rewrites match the user's own style.
 * Pure and deterministic.
 */
export function retrievePairs(
  pairs: TrainingPair[],
  prompt: string,
  opts: { k?: number; model?: string } = {},
): TrainingPair[] {
  const k = opts.k ?? 3;
  return pairs
    .map((p) => {
      let score = similarity(prompt, p.input);
      if (opts.model && p.model && p.model === opts.model) score += 0.15;
      return { p, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(0, k))
    .map((x) => x.p);
}

/** Build the system + user messages for a few-shot, style-matched rewrite. */
export function buildRewriteMessages(
  prompt: string,
  examples: TrainingPair[],
  portfolio?: string,
): { system: string; user: string } {
  const base =
    "You COMPRESS a developer's prompt so it uses FEWER tokens while producing the SAME " +
    'result. This is a rewrite they will paste directly into Copilot.\n' +
    '- KEEP every concrete detail they gave: file/function/component names, requirements, ' +
    'constraints, and any facts they pasted. Never drop information.\n' +
    '- CUT filler, politeness, hedging, and repetition. Use the fewest words that still work.\n' +
    "- NEVER invent details they didn't give — no made-up file names, APIs, or requirements.\n" +
    '- If the prompt is already tight and cannot be shortened without losing meaning, return it ' +
    'UNCHANGED.\n' +
    '- Output ONLY the rewritten prompt text \u2014 no preamble, quotes, code fences, advice, or notes.';
  // The compact profile replaces stuffing many examples — cheaper and personalized.
  const system = portfolio ? `${base}\n\n${portfolio}` : base;
  const shots = examples
    .slice(0, 2)
    .map((e) => `Original:\n${e.input}\nLeaner rewrite:\n${e.output}`)
    .join('\n\n');
  const user =
    (shots ? `Examples of how I like my prompts rewritten:\n\n${shots}\n\n` : '') +
    `Rewrite this prompt in the same style:\n\nOriginal:\n${prompt}\nLeaner rewrite:`;
  return { system, user };
}

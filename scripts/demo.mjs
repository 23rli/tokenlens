// Headless demo: drives the scripted scenario through the SAME scoring path the
// widget uses (ingestion -> scoring-engine -> heuristic coach) and prints the
// thriving -> collapse -> recovery arc. Run with: npm run demo
// Requires a prior build (npm run build) since it loads the packages' dist output.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

let ingestion, scoring, coach;
try {
  ingestion = require('@ecoprompt/ingestion');
  scoring = require('@ecoprompt/scoring-engine');
  coach = require('@ecoprompt/llm-adapters');
} catch (err) {
  console.error('\nCould not load packages. Run "npm run build" first.\n');
  console.error(String(err?.message ?? err));
  process.exit(1);
}

const { ScriptedScenarioAdapter, SessionTracker, DEMO_SCRIPT } = ingestion;
const { scorePrompt, dominantWasteCategories } = scoring;
const { generateTip } = coach;

const STATE_GLYPH = {
  thriving: '🌳',
  healthy: '🌿',
  concerned: '🍂',
  critical: '🥀',
  collapse: '🔥',
  dead: '💀',
};

function bar(score) {
  const filled = Math.round(score / 5); // 0..20
  return '█'.repeat(filled) + '░'.repeat(20 - filled);
}

function pad(s, n) {
  return String(s).padEnd(n);
}

async function main() {
  const adapter = new ScriptedScenarioAdapter();
  const tracker = new SessionTracker();
  adapter.reset();

  let prev = null;
  let hadTip = false;
  const scores = [];

  console.log('\n  EcoPrompt Guardians — scripted demo arc\n');
  console.log(`  ${pad('Step', 20)} ${pad('Score', 26)} Δ     State\n`);

  for (let i = 0; i < adapter.length; i++) {
    const ev = adapter.next();
    if (!ev) break;
    const step = DEMO_SCRIPT[i];
    const req = tracker.toScoreRequest(ev);
    const resp = scorePrompt(req, { previousScore: prev, hadPreviousTip: hadTip });
    const tip = await generateTip({
      promptText: req.promptText,
      responseText: req.responseText,
      reasons: resp.reasons,
      improvements: resp.improvements,
      wasteCategories: dominantWasteCategories(resp),
      overallScore: resp.overallScore,
    });

    const delta = prev == null ? 0 : resp.overallScore - prev;
    const deltaStr = delta === 0 ? '  · ' : (delta > 0 ? `+${delta}` : `${delta}`).padStart(4);
    scores.push(resp.overallScore);

    console.log(
      `  ${pad(step.label, 20)} ${pad(resp.overallScore + ' ' + bar(resp.overallScore), 26)} ${deltaStr}  ${STATE_GLYPH[resp.petState]} ${resp.petState}`,
    );
    console.log(`     ↳ ${tip.shortTip}`);
    if (tip.rewrittenPrompt && step.label.includes('Adopt')) {
      console.log(`     ↳ rewrite: ${tip.rewrittenPrompt}`);
    }

    prev = resp.overallScore;
    hadTip = true;
  }

  const min = Math.min(...scores);
  const max = Math.max(...scores);
  console.log(
    `\n  Arc: start ${scores[0]} → trough ${min} → finish ${scores[scores.length - 1]}  (range ${min}-${max})`,
  );
  console.log('  The ecosystem collapses under wasteful prompting, then recovers once');
  console.log('  the user adopts the coached rewrite. 🌍\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

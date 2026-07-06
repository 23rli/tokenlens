import type { ModelInfo, ScoredEventView } from '../../../src/webview/contract';
import { modelRightSizing, effortRightSizing } from '../../../src/analysis/rightSizing';

/**
 * Right-sizing advisories: when a trivial/moderate task is running on a premium
 * model or high reasoning effort, a lighter option would very likely do for less.
 * Down-route only and advisory — always "escalate if it falls short".
 */
export function RightSizePanel({
  lastEvent,
  model,
}: {
  lastEvent?: ScoredEventView;
  model?: ModelInfo;
}) {
  if (!lastEvent?.difficulty || !model) return null;
  const turnCredits = lastEvent.copilotCredits ?? lastEvent.estimatedCredits;
  const modelRec = modelRightSizing(lastEvent.difficulty, model, turnCredits);
  const effortRec = effortRightSizing(lastEvent.difficulty, model, turnCredits);
  if (!modelRec.recommend && !effortRec.recommend) return null;

  const saved = (c?: number): string => (c && c > 0 ? ` (~${c} AICs/turn)` : '');

  return (
    <section class="rightsize">
      <span class="section-title">Right-size this task</span>
      {modelRec.recommend && (
        <p class="rightsize-rec">
          🪶 {modelRec.message}
          {saved(modelRec.estCreditsSaved)}
        </p>
      )}
      {effortRec.recommend && (
        <p class="rightsize-rec">
          🧠 {effortRec.message}
          {saved(effortRec.estCreditsSaved)}
        </p>
      )}
    </section>
  );
}

import { useState } from 'react';
import type { ScoreEvent } from '@shared/contracts';
import { useEcoStore } from '../store';

interface TipBubbleProps {
  event?: ScoreEvent;
}

export function TipBubble({ event }: TipBubbleProps): JSX.Element | null {
  const [expanded, setExpanded] = useState(false);
  const accepted = useEcoStore((s) => s.rewriteAccepted);
  const markAccepted = useEcoStore((s) => s.acceptRewrite);

  if (!event) {
    return (
      <div className="tip-bubble idle">
        <span className="tip-mascot">🌱</span>
        <p>Send a prompt and I’ll coach you toward a greener, leaner ask.</p>
      </div>
    );
  }

  const { tip } = event;
  const savings = tip.estimatedSavings;

  const onAccept = (): void => {
    void window.eco.acceptRewrite(tip.rewrittenPrompt);
    markAccepted();
  };

  return (
    <div className="tip-bubble">
      <div className="tip-head">
        <span className="tip-mascot">📎</span>
        <span className="tip-short">{tip.shortTip}</span>
        <span className={`tip-source ${tip.source === 'heuristic' ? 'heur' : 'llm'}`}>
          {tip.source}
        </span>
      </div>

      {expanded && <p className="tip-detail">{tip.detailedTip}</p>}

      {tip.rewrittenPrompt && (
        <div className="tip-rewrite">
          <div className="tip-rewrite-label">Suggested rewrite</div>
          <code className="tip-rewrite-text">{tip.rewrittenPrompt}</code>
          {(savings?.estimatedTokenReductionPct || savings?.estimatedLatencyReductionPct) && (
            <div className="tip-savings">
              {savings?.estimatedTokenReductionPct
                ? `~${savings.estimatedTokenReductionPct}% fewer tokens`
                : ''}
              {savings?.estimatedTokenReductionPct && savings?.estimatedLatencyReductionPct
                ? ' · '
                : ''}
              {savings?.estimatedLatencyReductionPct
                ? `~${savings.estimatedLatencyReductionPct}% faster`
                : ''}
            </div>
          )}
          <button className="btn-accept" onClick={onAccept} disabled={accepted}>
            {accepted ? '✓ Adopted' : 'Accept rewrite'}
          </button>
        </div>
      )}

      <button className="tip-toggle" onClick={() => setExpanded((e) => !e)}>
        {expanded ? 'Hide details' : 'Why?'}
      </button>
    </div>
  );
}

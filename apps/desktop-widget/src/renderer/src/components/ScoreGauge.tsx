import type { ScoreEvent } from '@shared/contracts';
import { STATE_LABEL, scoreColor } from '../lib/format';

interface ScoreGaugeProps {
  event?: ScoreEvent;
}

const SIZE = 132;
const STROKE = 12;
const RADIUS = (SIZE - STROKE) / 2;
const CIRC = Math.PI * RADIUS; // half circle

export function ScoreGauge({ event }: ScoreGaugeProps): JSX.Element {
  const score = event?.response.overallScore ?? 0;
  const delta = event?.response.delta ?? 0;
  const color = scoreColor(score);
  const offset = CIRC * (1 - score / 100);

  return (
    <div className="gauge">
      <svg width={SIZE} height={SIZE / 2 + 14} viewBox={`0 0 ${SIZE} ${SIZE / 2 + 14}`}>
        <path
          d={`M ${STROKE / 2} ${SIZE / 2} A ${RADIUS} ${RADIUS} 0 0 1 ${SIZE - STROKE / 2} ${SIZE / 2}`}
          fill="none"
          stroke="rgba(255,255,255,0.12)"
          strokeWidth={STROKE}
          strokeLinecap="round"
        />
        <path
          d={`M ${STROKE / 2} ${SIZE / 2} A ${RADIUS} ${RADIUS} 0 0 1 ${SIZE - STROKE / 2} ${SIZE / 2}`}
          fill="none"
          stroke={color}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 600ms ease, stroke 600ms ease' }}
        />
      </svg>
      <div className="gauge-center">
        <span className="gauge-score" style={{ color }}>
          {score}
        </span>
        <span className="gauge-label">
          {event ? STATE_LABEL[event.response.petState] : 'Waiting'}
        </span>
        {event && delta !== 0 && (
          <span className={`gauge-delta ${delta > 0 ? 'up' : 'down'}`}>
            {delta > 0 ? '▲' : '▼'} {Math.abs(delta)}
          </span>
        )}
      </div>
    </div>
  );
}

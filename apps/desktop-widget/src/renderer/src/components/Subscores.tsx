import type { Subscores as SubscoresType } from '@ecoprompt/shared-types';

interface SubscoresProps {
  subscores?: SubscoresType;
}

const ROWS: { key: keyof SubscoresType; label: string }[] = [
  { key: 'promptQuality', label: 'Prompt quality' },
  { key: 'contextEfficiency', label: 'Context efficiency' },
  { key: 'toolEfficiency', label: 'Tool efficiency' },
  { key: 'outputEfficiency', label: 'Output efficiency' },
  { key: 'learningAdoption', label: 'Learning adoption' },
];

function barColor(v: number): string {
  if (v >= 75) return '#37d67a';
  if (v >= 50) return '#f1c40f';
  if (v >= 30) return '#f39c12';
  return '#e74c3c';
}

export function Subscores({ subscores }: SubscoresProps): JSX.Element {
  return (
    <div className="subscores">
      {ROWS.map(({ key, label }) => {
        const v = subscores ? Math.round(subscores[key]) : 0;
        return (
          <div className="subscore-row" key={key}>
            <span className="subscore-label">{label}</span>
            <div className="subscore-track">
              <div className="subscore-fill" style={{ width: `${v}%`, background: barColor(v) }} />
            </div>
            <span className="subscore-val">{v}</span>
          </div>
        );
      })}
    </div>
  );
}

import { useEcoStore } from '../store';
import { scoreColor } from '../lib/format';

export function History(): JSX.Element {
  const history = useEcoStore((s) => s.history);
  const recent = [...history].reverse().slice(0, 8);

  return (
    <div className="history">
      <div className="panel-title">Session history</div>
      {recent.length === 0 && <p className="muted">No prompts scored yet.</p>}
      <ul className="history-list">
        {recent.map((e) => (
          <li className="history-item" key={`${e.sessionId}-${e.turnIndex}`}>
            <span
              className="history-chip"
              style={{ background: scoreColor(e.response.overallScore) }}
            >
              {e.response.overallScore}
            </span>
            <span className="history-text" title={e.promptText}>
              {e.label ? `${e.label} — ` : ''}
              {e.promptExcerpt}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

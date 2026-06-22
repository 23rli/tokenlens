import { useState } from 'react';
import type { IngestionMode } from '@shared/contracts';
import { useEcoStore } from '../store';

const MODES: { id: IngestionMode; label: string }[] = [
  { id: 'scripted', label: 'Demo' },
  { id: 'manual', label: 'Manual' },
  { id: 'live', label: 'Live Copilot' },
];

export function Controls(): JSX.Element {
  const status = useEcoStore((s) => s.status);
  const reset = useEcoStore((s) => s.reset);
  const [draft, setDraft] = useState('');
  const mode = status?.mode ?? 'scripted';

  const switchMode = (m: IngestionMode): void => {
    reset();
    void window.eco.setMode(m);
  };

  const send = (): void => {
    if (!draft.trim()) return;
    void window.eco.submitManual(draft);
    setDraft('');
  };

  return (
    <div className="controls">
      <div className="mode-row">
        {MODES.map((m) => {
          const disabled = m.id === 'live' && !status?.liveAvailable;
          return (
            <button
              key={m.id}
              className={`mode-btn ${mode === m.id ? 'active' : ''}`}
              onClick={() => switchMode(m.id)}
              disabled={disabled}
              title={disabled ? 'No Copilot chat session found on disk' : ''}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      {mode === 'scripted' && (
        <div className="scripted-row">
          <button className="ctl" onClick={() => void window.eco.scriptedNext()}>
            ▶ Next
          </button>
          <button className="ctl" onClick={() => void window.eco.scriptedPlay()}>
            ⏩ Auto
          </button>
          <button className="ctl" onClick={() => void window.eco.scriptedPause()}>
            ⏸ Pause
          </button>
          <button
            className="ctl"
            onClick={() => {
              reset();
              void window.eco.scriptedReset();
            }}
          >
            ↺ Reset
          </button>
          <span className="scripted-pos">
            {status ? `${status.scriptedPosition}/${status.scriptedLength}` : ''}
          </span>
        </div>
      )}

      {mode === 'manual' && (
        <div className="manual-row">
          <textarea
            className="manual-input"
            placeholder="Type or paste a prompt to score…"
            value={draft}
            rows={2}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send();
            }}
          />
          <button className="btn-send" onClick={send} disabled={!draft.trim()}>
            Score
          </button>
        </div>
      )}

      {mode === 'live' && (
        <div className="live-row">
          {status?.liveAvailable ? (
            <span className="live-on">
              ● Watching GitHub Copilot Chat — new turns will be scored automatically.
            </span>
          ) : (
            <span className="live-off">No Copilot session detected on disk.</span>
          )}
        </div>
      )}
    </div>
  );
}

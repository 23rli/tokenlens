import { useEffect } from 'react';
import { useEcoStore } from './store';
import type { WindowMode } from '@shared/contracts';
import { WorldRenderer } from './components/WorldRenderer';
import { ScoreGauge } from './components/ScoreGauge';
import { Subscores } from './components/Subscores';
import { TipBubble } from './components/TipBubble';
import { History } from './components/History';
import { MetricsTab } from './components/MetricsTab';
import { Controls } from './components/Controls';
import { STATE_LABEL } from './lib/format';

export function App(): JSX.Element {
  // Select individual fields. Returning a new object from the selector breaks
  // under Zustand v5 (Object.is equality) and causes an infinite render loop.
  const current = useEcoStore((s) => s.current);
  const health = useEcoStore((s) => s.health);
  const petState = useEcoStore((s) => s.petState);
  const status = useEcoStore((s) => s.status);
  const tab = useEcoStore((s) => s.tab);
  const pushScore = useEcoStore((s) => s.pushScore);
  const setStatus = useEcoStore((s) => s.setStatus);
  const setTab = useEcoStore((s) => s.setTab);

  useEffect(() => {
    const offScore = window.eco.onScore(pushScore);
    const offStatus = window.eco.onStatus(setStatus);
    void window.eco.getStatus().then(setStatus);
    return () => {
      offScore();
      offStatus();
    };
  }, [pushScore, setStatus]);

  const setMode = (mode: WindowMode): void => void window.eco.setWindowMode(mode);

  return (
    <div className="app">
      <header className="titlebar">
        <div className="brand">
          <span className="brand-mark">📎</span>
          <span className="brand-name">EcoPrompt Guardians</span>
        </div>
        <div className="titlebar-right">
          <span className={`api-dot ${status?.apiOnline ? 'on' : 'local'}`} />
          <span className="api-label">
            {status?.apiOnline ? `API · ${status.storage}` : 'Local'}
          </span>
          <button className="win-btn" title="Compact" onClick={() => setMode('minimized')}>
            ▢
          </button>
          <button className="win-btn" title="Expanded" onClick={() => setMode('expanded')}>
            ▣
          </button>
          <button className="win-btn" title="Deep insight" onClick={() => setMode('deep')}>
            ⤢
          </button>
          <button className="win-btn close" title="Quit" onClick={() => void window.eco.quit()}>
            ✕
          </button>
        </div>
      </header>

      <div className="world-wrap">
        <WorldRenderer petState={petState} health={health} height={184} />
        <div className="world-badge">{STATE_LABEL[petState]}</div>
      </div>

      <nav className="tabs">
        <button
          className={`tab ${tab === 'world' ? 'active' : ''}`}
          onClick={() => setTab('world')}
        >
          Coach
        </button>
        <button
          className={`tab ${tab === 'metrics' ? 'active' : ''}`}
          onClick={() => setTab('metrics')}
        >
          Metrics
        </button>
      </nav>

      <main className="content">
        {tab === 'world' ? (
          <>
            <div className="coach-top">
              <ScoreGauge event={current} />
              <div className="coach-narration">
                {current?.label && <div className="narration-label">{current.label}</div>}
                <div className="narration-text">
                  {current?.narration ??
                    (current ? current.response.reasons[0] : 'Awaiting your first prompt…')}
                </div>
              </div>
            </div>
            <TipBubble event={current} />
            <Subscores subscores={current?.response.subscores} />
            <History />
            <Controls />
          </>
        ) : (
          <MetricsTab />
        )}
      </main>
    </div>
  );
}

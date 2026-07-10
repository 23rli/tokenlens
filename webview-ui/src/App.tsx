import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { TamaState, HostMessage } from '../../src/webview/contract';
import { post } from './vscodeApi';
import { SustainabilityGauge } from './components/SustainabilityGauge';
import { ForecastPanel } from './components/ForecastPanel';
import { ContextPanel } from './components/ContextPanel';
import { ImpactTrio } from './components/ImpactTrio';
import { LiveData } from './components/LiveData';
import { HistoryView } from './components/HistoryView';
import { InfoPanel } from './components/InfoPanel';

export function App() {
  const [state, setState] = useState<TamaState | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'dashboard' | 'history' | 'info'>('dashboard');
  const [lastUpdate, setLastUpdate] = useState<number>(Date.now());
  const [, tick] = useState(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    const onMessage = (event: MessageEvent<HostMessage>): void => {
      const message = event.data;
      if (message.type === 'state') {
        setState(message.state);
        setLastUpdate(Date.now());
      } else if (message.type === 'busy') setBusy(message.busy);
    };
    window.addEventListener('message', onMessage);
    post({ type: 'ready' });
    // Tick only while visible so a hidden retained webview does no needless work.
    let id: ReturnType<typeof setInterval> | undefined;
    const syncTimer = (): void => {
      if (id) clearInterval(id);
      id = document.hidden ? undefined : setInterval(() => tick((n) => n + 1), 1000);
    };
    document.addEventListener('visibilitychange', syncTimer);
    syncTimer();
    return () => {
      window.removeEventListener('message', onMessage);
      document.removeEventListener('visibilitychange', syncTimer);
      if (id) clearInterval(id);
    };
  }, []);

  if (!state) {
    return <div class="loading">Loading Token Lens…</div>;
  }

  const agoSec = Math.max(0, Math.round((Date.now() - lastUpdate) / 1000));
  const tabs = ['dashboard', 'history', 'info'] as const;
  const selectTab = (index: number): void => {
    const normalized = (index + tabs.length) % tabs.length;
    setTab(tabs[normalized]);
    requestAnimationFrame(() => tabRefs.current[normalized]?.focus());
  };
  const onTabKeyDown = (event: JSX.TargetedKeyboardEvent<HTMLButtonElement>): void => {
    const index = tabs.indexOf(tab);
    if (event.key === 'ArrowLeft') selectTab(index - 1);
    else if (event.key === 'ArrowRight') selectTab(index + 1);
    else if (event.key === 'Home') selectTab(0);
    else if (event.key === 'End') selectTab(tabs.length - 1);
    else return;
    event.preventDefault();
  };

  return (
    <div class="app">
      <div class="tabs" role="tablist" aria-label="Token Lens sections">
        <button
          ref={(el) => { tabRefs.current[0] = el; }}
          id="tab-dashboard"
          role="tab"
          aria-selected={tab === 'dashboard'}
          aria-controls="panel-dashboard"
          tabIndex={tab === 'dashboard' ? 0 : -1}
          class={`tab${tab === 'dashboard' ? ' active' : ''}`}
          onClick={() => setTab('dashboard')}
          onKeyDown={onTabKeyDown}
        >
          Dashboard
        </button>
        <button
          ref={(el) => { tabRefs.current[1] = el; }}
          id="tab-history"
          role="tab"
          aria-selected={tab === 'history'}
          aria-controls="panel-history"
          tabIndex={tab === 'history' ? 0 : -1}
          class={`tab${tab === 'history' ? ' active' : ''}`}
          onClick={() => setTab('history')}
          onKeyDown={onTabKeyDown}
        >
          History
        </button>
        <button
          ref={(el) => { tabRefs.current[2] = el; }}
          id="tab-info"
          role="tab"
          aria-selected={tab === 'info'}
          aria-controls="panel-info"
          tabIndex={tab === 'info' ? 0 : -1}
          class={`tab${tab === 'info' ? ' active' : ''}`}
          onClick={() => setTab('info')}
          onKeyDown={onTabKeyDown}
        >
          Info
        </button>
      </div>

      {tab === 'dashboard' ? (
        <div class="app-main" id="panel-dashboard" role="tabpanel" aria-labelledby="tab-dashboard">
          <ForecastPanel forecast={state.forecast} />
          <SustainabilityGauge forecast={state.forecast} />
          <ContextPanel
            breakdown={state.forecast?.contextBreakdown}
            inputTokens={state.forecast?.contextInputTokens}
            sessionBreakdown={state.forecast?.sessionBreakdown}
            sessionInputTokens={state.forecast?.sessionInputTokens}
            chatBreakdown={state.forecast?.chatBreakdown}
            chatInputTokens={state.forecast?.chatInputTokens}
            chatSessionCount={state.forecast?.chatSessionCount}
            aggregateScope={state.forecast?.aggregateScope}
          />
          <ImpactTrio metrics={state.metrics} forecast={state.forecast} />
          <LiveData state={state} />
        </div>
      ) : tab === 'history' ? (
        <div class="app-main" id="panel-history" role="tabpanel" aria-labelledby="tab-history">
          <HistoryView forecast={state.forecast} />
        </div>
      ) : (
        <div class="app-main" id="panel-info" role="tabpanel" aria-labelledby="tab-info">
          <InfoPanel />
        </div>
      )}

      <div class="actions">
        <span
          class="live"
          role="status"
          aria-live="polite"
          title={state.captureEnabled ? `Auto-refreshes from disk. Last update ${agoSec}s ago.` : 'Passive capture is off.'}
        >
          <span class={`live-dot${!state.captureEnabled ? '' : agoSec <= 4 ? ' on' : ' stale'}`} aria-hidden="true" />
          {!state.captureEnabled ? 'paused' : agoSec <= 4 ? 'live' : `updated ${agoSec}s ago`}
        </span>
        <button
          class="ghost"
          disabled={busy}
          aria-pressed={state.captureEnabled}
          onClick={() => post({ type: 'toggleCapture' })}
        >
          {state.captureEnabled ? '◉ Capture on' : '○ Capture off'}
        </button>
      </div>
    </div>
  );
}

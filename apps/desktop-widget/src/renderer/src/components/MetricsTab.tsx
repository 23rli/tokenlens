import { useEffect } from 'react';
import type { WasteCategory } from '@ecoprompt/shared-types';
import { useEcoStore } from '../store';
import { CATEGORY_LABEL, fmtTokens, fmtUsd } from '../lib/format';

function Card({ label, value, sub }: { label: string; value: string; sub?: string }): JSX.Element {
  return (
    <div className="metric-card">
      <span className="metric-value">{value}</span>
      <span className="metric-label">{label}</span>
      {sub && <span className="metric-sub">{sub}</span>}
    </div>
  );
}

export function MetricsTab(): JSX.Element {
  const metrics = useEcoStore((s) => s.metrics);
  const setMetrics = useEcoStore((s) => s.setMetrics);
  const current = useEcoStore((s) => s.current);

  useEffect(() => {
    void window.eco.getMetrics().then(setMetrics);
  }, [current, setMetrics]);

  if (!metrics || metrics.promptCount === 0) {
    return <p className="muted metrics-empty">Score a few prompts to populate session metrics.</p>;
  }

  const waste = Object.entries(metrics.wasteByCategory) as [WasteCategory, number][];
  const maxWaste = Math.max(1, ...waste.map(([, v]) => v));

  return (
    <div className="metrics">
      <div className="metric-grid">
        <Card label="Prompts" value={String(metrics.promptCount)} />
        <Card label="Avg score" value={String(metrics.averageScore)} />
        <Card label="Tokens in" value={fmtTokens(metrics.totalInputTokens)} />
        <Card label="Tokens out" value={fmtTokens(metrics.totalOutputTokens)} />
        <Card label="Est. cost" value={fmtUsd(metrics.totalCostUsd)} sub="real model prices" />
        <Card label="Retries" value={String(metrics.retriesDetected)} />
        <Card label="Tool calls" value={String(metrics.toolCallsTotal)} />
        <Card
          label="Tokens saved*"
          value={fmtTokens(metrics.estimatedTokensSaved)}
          sub={`≈ ${fmtUsd(metrics.estimatedCostSavedUsd)}`}
        />
      </div>

      <div className="panel-title">Where the waste came from</div>
      <div className="waste-bars">
        {waste.length === 0 && <p className="muted">No avoidable waste detected. 🌿</p>}
        {waste
          .sort((a, b) => b[1] - a[1])
          .map(([cat, v]) => (
            <div className="waste-row" key={cat}>
              <span className="waste-label">{CATEGORY_LABEL[cat]}</span>
              <div className="waste-track">
                <div className="waste-fill" style={{ width: `${(v / maxWaste) * 100}%` }} />
              </div>
              <span className="waste-val">{v.toFixed(1)}</span>
            </div>
          ))}
      </div>

      <p className="sustainability">
        🌍 Leaner prompts mean fewer tokens, lower latency, and less compute. Estimated savings are
        directional (aligned to real model prices), not metered billing figures.
      </p>
    </div>
  );
}

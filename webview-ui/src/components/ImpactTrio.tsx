import type { SuccessMetrics } from '../../../src/webview/contract';
import { fmtNum, fmtUsd } from '../format';

/**
 * Session cost, anchored on MEASURED units: tokens and Copilot credits (AICs) are
 * what Copilot meters; dollars are a derived estimate (default AIC→$ rate, org can
 * override). Three clearly-separated figures — no eco metrics, business-focused.
 */
export function ImpactTrio({ metrics }: { metrics: SuccessMetrics }) {
  const tiles = [
    {
      key: 'tokens',
      label: 'Tokens',
      value: fmtNum(metrics.totalTokens),
      waste: '',
    },
    {
      key: 'credits',
      label: metrics.totalCreditsEstimated ? 'AICs (est.)' : 'AICs',
      value: fmtNum(metrics.totalCredits),
      waste: `${fmtNum(metrics.creditsWasted)} wasted`,
    },
    {
      key: 'cost',
      label: metrics.hasUsdRate ? 'Cost (est.)' : 'Cost',
      value: metrics.hasUsdRate ? fmtUsd(metrics.totalCostUsd) : '—',
      waste: metrics.hasUsdRate ? `${fmtUsd(metrics.costUsdWasted)} wasted` : '',
    },
  ];

  return (
    <section class="card impact">
      <header class="impact-head">
        <span class="section-title">Session cost</span>
      </header>
      <div class="impact-trio">
        {tiles.map((t) => (
          <div class="impact-tile" key={t.key}>
            <div class="impact-value">{t.value}</div>
            <div class="impact-label">{t.label}</div>
            {t.waste && <div class="impact-waste">{t.waste}</div>}
          </div>
        ))}
      </div>
    </section>
  );
}

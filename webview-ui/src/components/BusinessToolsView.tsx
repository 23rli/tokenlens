import type { JSX } from 'preact';
import { useRef, useState } from 'preact/hooks';
import type {
  BusinessActivityScopes,
  BusinessActivitySummary,
  BusinessAttributionUsage,
  BusinessServiceUsage,
  BusinessToolGroupInfo,
  BusinessToolsState,
  BusinessWorkflowUsage,
} from '../../../src/webview/contract';
import { fmtNum, fmtUsd } from '../format';
import { post } from '../vscodeApi';

type Scope = keyof BusinessActivityScopes;

const SCOPES: { key: Scope; label: string }[] = [
  { key: 'workspace', label: 'Workspace' },
  { key: 'session', label: 'This chat' },
  { key: 'today', label: 'Today' },
];

export function BusinessToolsView({
  tools,
  busy,
}: {
  tools: BusinessToolsState;
  busy: boolean;
}) {
  const [scope, setScope] = useState<Scope>('workspace');
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const summary = tools.activity?.[scope];
  const scopeIndex = SCOPES.findIndex((item) => item.key === scope);
  const enabledGroupCount = tools.groups.filter((group) => group.enabled).length;
  const primaryGroup = tools.groups.find((group) => group.enabled && group.id !== 'all-mcp');
  const comparisonTitle = primaryGroup ? `${primaryGroup.name} vs everything else` : 'Attributed AI usage';

  const selectScope = (index: number): void => {
    const normalized = (index + SCOPES.length) % SCOPES.length;
    setScope(SCOPES[normalized].key);
    requestAnimationFrame(() => refs.current[normalized]?.focus());
  };
  const onScopeKeyDown = (event: JSX.TargetedKeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === 'ArrowLeft') selectScope(scopeIndex - 1);
    else if (event.key === 'ArrowRight') selectScope(scopeIndex + 1);
    else if (event.key === 'Home') selectScope(0);
    else if (event.key === 'End') selectScope(SCOPES.length - 1);
    else return;
    event.preventDefault();
  };

  return (
    <div class="business-view">
      <section class="card business-groups">
        <div class="business-head">
          <div>
            <div class="section-title" role="heading" aria-level={2}>Workflow attribution</div>
            <div class="business-sub">Optional local rules that group whole Copilot requests</div>
          </div>
          <button
            class={`business-master${tools.trackingEnabled ? ' on' : ''}`}
            disabled={busy}
            aria-pressed={tools.trackingEnabled}
            onClick={() => post({
              type: 'setBusinessToolTracking',
              enabled: !tools.trackingEnabled,
            })}
          >
            {tools.trackingEnabled ? 'On' : 'Off'}
          </button>
        </div>
        <div class="business-group-list" aria-label="Available business-tool groups">
          {tools.groups.map((group) => (
            <GroupRow key={group.id} group={group} busy={busy} />
          ))}
        </div>
        <div class="business-group-actions">
          <span class="business-count">
            {enabledGroupCount} of {tools.groups.length} groups selected
          </span>
          <button
            class="ghost business-config"
            onClick={() => post({ type: 'openBusinessToolSettings' })}
          >
            Add or edit groups
          </button>
        </div>
      </section>

      {!tools.trackingEnabled ? (
        <section class="card business-empty muted">
          Workflow attribution is off. Core usage tracking continues in Overview.
        </section>
      ) : enabledGroupCount === 0 ? (
        <section class="card business-empty muted">
          Select one or more workflow profiles to classify matching Copilot requests.
        </section>
      ) : !summary ? (
        <section class="card business-empty muted">Waiting for local Copilot activity…</section>
      ) : (
        <ActivityView
          summary={summary}
          scope={scope}
          setScope={setScope}
          refs={refs}
          onScopeKeyDown={onScopeKeyDown}
          comparisonTitle={comparisonTitle}
          primaryGroup={primaryGroup}
        />
      )}
    </div>
  );
}

function GroupRow({
  group,
  busy,
}: {
  group: BusinessToolGroupInfo;
  busy: boolean;
}) {
  return (
    <div class="business-group-row">
      <div class="business-group-copy">
        <div class="business-group-name">
          {group.name}
          <span class="business-kind">{group.source === 'built-in' ? 'Built in' : 'Custom'}</span>
        </div>
        <div class="business-group-description">{group.description}</div>
      </div>
      <button
        class={`business-group-toggle${group.enabled ? ' on' : ''}`}
        disabled={busy}
        aria-label={`${group.enabled ? 'Disable' : 'Enable'} ${group.name}`}
        aria-pressed={group.enabled}
        onClick={() => post({
          type: 'setBusinessToolGroup',
          groupId: group.id,
          enabled: !group.enabled,
        })}
      >
        {group.enabled ? 'On' : 'Off'}
      </button>
    </div>
  );
}

function ActivityView({
  summary,
  scope,
  setScope,
  refs,
  onScopeKeyDown,
  comparisonTitle,
  primaryGroup,
}: {
  summary: BusinessActivitySummary;
  scope: Scope;
  setScope: (scope: Scope) => void;
  refs: { current: Array<HTMLButtonElement | null> };
  onScopeKeyDown: (event: JSX.TargetedKeyboardEvent<HTMLButtonElement>) => void;
  comparisonTitle: string;
  primaryGroup?: BusinessToolGroupInfo;
}) {
  return (
    <>
      <section class="card business-summary">
        <div class="business-head">
          <div>
            <div class="section-title" role="heading" aria-level={2}>Attributed usage &amp; cost</div>
            <div class="business-sub">Whole-request Copilot usage alongside observed MCP activity</div>
          </div>
          <button class="ghost business-config" onClick={() => post({ type: 'openBusinessToolSettings' })}>
            Set rates
          </button>
        </div>
        <div class="business-scope" role="tablist" aria-label="Business activity scope">
          {SCOPES.map((item, index) => (
            <button
              key={item.key}
              ref={(element) => { refs.current[index] = element; }}
              role="tab"
              aria-selected={scope === item.key}
              tabIndex={scope === item.key ? 0 : -1}
              class={`business-scope-btn${scope === item.key ? ' active' : ''}`}
              title={item.key === 'today' ? 'Your local calendar day' : undefined}
              onClick={() => setScope(item.key)}
              onKeyDown={onScopeKeyDown}
            >
              {item.label}
            </button>
          ))}
        </div>
        <SummaryTiles summary={summary} />
        <p class="business-note">
          Each request keeps its full Copilot usage. MCP calls are shown as activity, not given
          invented per-call token totals. Tool-cost estimates use only rates you configured.
        </p>
      </section>

      <AttributionView rows={summary.attribution} title={comparisonTitle} primaryGroup={primaryGroup} />

      {summary.skills.length > 0 && (
        <section class="card business-skills">
          <div class="section-title" role="heading" aria-level={2}>Detected skill workflows</div>
          <div class="business-chip-row">
            {summary.skills.map((skill) => (
              <span class="business-chip" key={skill.name}>
                {skill.name} <span>×{skill.invocations}</span>
              </span>
            ))}
          </div>
        </section>
      )}

      <section class="card business-services">
        <div class="business-section-head">
          <span class="section-title" role="heading" aria-level={2}>Services</span>
          <span class="business-count">{summary.businessCalls} calls</span>
        </div>
        {summary.services.length > 0 ? (
          <div class="business-table" role="table" aria-label="Business service usage">
            <div class="business-table-head" role="row">
              <span role="columnheader">Service</span>
              <span role="columnheader">Calls</span>
              <span role="columnheader">Success</span>
              <span role="columnheader">Configured cost</span>
            </div>
            {summary.services.map((service) => <ServiceRow key={service.id} service={service} />)}
          </div>
        ) : (
          <p class="business-empty muted">No MCP-backed business calls observed in this scope yet.</p>
        )}
      </section>

      <section class="card business-workflows">
        <div class="business-section-head">
          <span class="section-title" role="heading" aria-level={2}>Usage by detected workflow</span>
          <span class="business-count">{summary.turns} turns</span>
        </div>
        {summary.workflows.length > 0 ? (
          <div class="business-workflow-list" role="list">
            {summary.workflows.map((workflow) => (
              <WorkflowRow key={workflow.id} workflow={workflow} />
            ))}
          </div>
        ) : (
          <p class="business-empty muted">No workflow activity in this scope yet.</p>
        )}
      </section>
    </>
  );
}

function AttributionView({
  rows,
  title,
  primaryGroup,
}: {
  rows: BusinessAttributionUsage[];
  title: string;
  primaryGroup?: BusinessToolGroupInfo;
}) {
  const knownCost = rows.reduce((sum, row) => sum + (row.aiCostUsd ?? 0), 0);
  const knownTokens = rows.reduce((sum, row) => sum + row.tokens, 0);
  const useCost = knownCost > 0;
  const denominator = useCost ? knownCost : knownTokens;
  const displayedShares = allocatePercentages(
    rows.map((row) => useCost ? row.aiCostUsd ?? 0 : row.tokens),
  );
  const primaryRows = primaryGroup
    ? rows.filter((row) => row.groupId === primaryGroup.id)
    : [];
  const primaryAmount = primaryRows.reduce(
    (sum, row) => sum + (useCost ? row.aiCostUsd ?? 0 : row.tokens),
    0,
  );
  const primaryPartial = primaryRows.some((row) =>
    useCost ? row.aiCostPartial : row.tokensPartial,
  );
  const otherAmount = Math.max(0, denominator - primaryAmount);
  const otherPartial = rows
    .filter((row) => !primaryGroup || row.groupId !== primaryGroup.id)
    .some((row) => useCost ? row.aiCostPartial : row.tokensPartial);
  const comparisonShares = allocatePercentages([primaryAmount, otherAmount]);

  return (
    <section class="card business-attribution">
      <div class="business-section-head">
        <span class="section-title" role="heading" aria-level={2}>{title}</span>
        <span class="business-count">each request counted once</span>
      </div>
      {primaryGroup && (
        <div class="business-comparison-tiles" aria-label={`${primaryGroup.name} related versus other or mixed known ${useCost ? 'AI cost' : 'tokens'}`}>
          <div>
            <strong>{formatAttributionAmount(primaryAmount, useCost)}</strong>
            <span>{primaryPartial ? 'Known · ' : ''}{primaryGroup.name} matched · {comparisonShares[0] ?? 0}%</span>
          </div>
          <div>
            <strong>{formatAttributionAmount(otherAmount, useCost)}</strong>
            <span>{otherPartial ? 'Known · ' : ''}Other or multiple matches · {comparisonShares[1] ?? 0}%</span>
          </div>
        </div>
      )}
      {rows.length > 0 ? (
        <div class="business-attribution-list" role="list" aria-label="Request-level AI spend attribution">
          {rows.map((row, index) => {
            const amount = useCost ? row.aiCostUsd ?? 0 : row.tokens;
            const share = denominator > 0 ? (amount / denominator) * 100 : 0;
            const displayedShare = displayedShares[index] ?? 0;
            const partial = useCost ? !!row.aiCostPartial : row.tokensPartial;
            return (
              <div class="business-attribution-row" key={row.id} role="listitem">
                <div class="business-attribution-head">
                  <span class="business-attribution-name">{row.name}</span>
                  <span class={`business-confidence confidence-${row.confidence}`}>
                    {confidenceLabel(row)}
                  </span>
                  <strong>
                    {useCost
                      ? fmtUsd(amount)
                      : fmtNum(amount)}
                  </strong>
                </div>
                <div class="business-attribution-track" aria-label={`${displayedShare} percent of known attributed ${useCost ? 'cost' : 'tokens'}`}>
                  <span style={{ width: `${Math.max(0, Math.min(100, share))}%` }} />
                </div>
                <div class="business-attribution-meta">
                  <span>{displayedShare}% of known {useCost ? 'AI cost' : 'tokens'}</span>
                  <span>{row.turns} turn{row.turns === 1 ? '' : 's'}</span>
                  <span>{row.mcpCalls} MCP call{row.mcpCalls === 1 ? '' : 's'}</span>
                  {useCost && <span>{fmtNum(row.tokens)} known tokens</span>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p class="business-empty muted">No turns available for attribution in this scope.</p>
      )}
      <p class="business-note">
        Explicit workflow is the strongest signal. Tool match means a selected profile participated.
        Multiple matches means more than one profile participated. These are correlations, not causal per-tool costs.
      </p>
    </section>
  );
}

function confidenceLabel(row: BusinessAttributionUsage): string {
  switch (row.basis) {
    case 'explicit-workflow':
      return 'Explicit workflow';
    case 'tool-associated':
      return 'Tool match';
    case 'mixed':
      return 'Multiple profiles';
    case 'other':
      return 'No profile match';
  }
}

function allocatePercentages(values: readonly number[]): number[] {
  const safe = values.map((value) => Number.isFinite(value) && value > 0 ? value : 0);
  const total = safe.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return safe.map(() => 0);
  const raw = safe.map((value) => (value / total) * 100);
  const result = raw.map(Math.floor);
  let remaining = 100 - result.reduce((sum, value) => sum + value, 0);
  const order = raw
    .map((value, index) => ({ index, remainder: value - result[index] }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (let i = 0; i < order.length && remaining > 0; i += 1, remaining -= 1) {
    result[order[i].index] += 1;
  }
  return result;
}

function SummaryTiles({ summary }: { summary: BusinessActivitySummary }) {
  const externalLabel =
    summary.businessCalls === 0
      ? '$0'
      : summary.pricedCalls === 0
        ? 'unpriced'
        : fmtUsd(summary.externalCostUsd);
  const totalLabel = summary.trackedCostUsd == null
    ? '—'
    : fmtUsd(summary.trackedCostUsd);

  return (
    <div class="business-tiles">
      <div class="business-tile">
        <strong>
          {summary.aiCostUsd == null ? '—' : fmtUsd(summary.aiCostUsd)}
        </strong>
        <span>{summary.aiCostPartial ? 'Known attributed AI cost' : 'Attributed AI cost'}</span>
      </div>
      <div class="business-tile">
        <strong>{externalLabel}</strong>
        <span>{summary.unpricedCalls ? 'Known configured tool cost' : 'Configured tool cost'}</span>
      </div>
      <div class="business-tile">
        <strong>{totalLabel}</strong>
        <span>{summary.unpricedCalls || summary.aiCostPartial ? 'Known total' : 'Estimated total'}</span>
      </div>
    </div>
  );
}

function ServiceRow({ service }: { service: BusinessServiceUsage }) {
  const completed = service.successfulCalls + service.failedCalls;
  const success = completed > 0 ? `${service.successfulCalls}/${completed}` : '—';
  const cost =
    service.pricedCalls === 0
      ? 'unpriced'
      : `${fmtUsd(service.estimatedCostUsd ?? 0)}${service.pricedCalls < service.calls ? ' known' : ''}`;
  return (
    <div class="business-table-row" role="row" title={`${formatDuration(service.durationMs)} observed runtime`}>
      <span class="business-service-name" role="cell">
        {service.name}
        <small>{service.groupName}</small>
      </span>
      <span role="cell">{fmtNum(service.calls)}</span>
      <span role="cell">{success}</span>
      <span class={service.pricedCalls === 0 ? 'muted' : ''} role="cell">{cost}</span>
    </div>
  );
}

function WorkflowRow({ workflow }: { workflow: BusinessWorkflowUsage }) {
  const knownCost = (workflow.aiCostUsd ?? 0) + workflow.externalCostUsd;
  const hasKnownCost = workflow.aiCostUsd != null || workflow.businessCalls > workflow.unpricedCalls;
  return (
    <div class="business-workflow-row" role="listitem">
      <div class="business-workflow-main">
        <span class="business-workflow-name" title={workflow.name}>{workflow.name}</span>
        <span class="business-kind">{workflowKindLabel(workflow.kind)}</span>
      </div>
      <div class="business-workflow-meta">
        <span>{workflow.turns} turn{workflow.turns === 1 ? '' : 's'}</span>
        <span>{workflow.businessCalls} MCP call{workflow.businessCalls === 1 ? '' : 's'}</span>
        <strong>
          {hasKnownCost
            ? `${fmtUsd(knownCost)}${workflow.unpricedCalls || workflow.aiCostPartial ? ' known' : ''}`
            : 'unpriced'}
        </strong>
      </div>
    </div>
  );
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return 'no runtime recorded';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} sec`;
  return `${(ms / 60_000).toFixed(1)} min`;
}

function workflowKindLabel(kind: BusinessWorkflowUsage['kind']): string {
  switch (kind) {
    case 'skill': return 'Skill';
    case 'agent': return 'Agent';
    case 'prompt': return 'Saved prompt';
    case 'general': return 'General';
  }
}

function formatAttributionAmount(amount: number, useCost: boolean): string {
  return useCost ? fmtUsd(amount) : fmtNum(amount);
}
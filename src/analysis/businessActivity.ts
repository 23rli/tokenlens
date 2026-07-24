import type {
  BusinessActivitySummary,
  BusinessAttributionBasis,
  BusinessAttributionConfidence,
  BusinessAttributionUsage,
  BusinessServiceUsage,
  BusinessSkillUsage,
  BusinessToolRate,
  BusinessToolRates,
  BusinessWorkflowKind,
  BusinessWorkflowUsage,
  PromptEvent,
  ToolCallInfo,
} from '@tokentama/shared-types';
import {
  configuredCostUsd,
  creditAmountForMeteredUsage,
} from './cost';
import type {
  BusinessToolMatch,
  BusinessToolRegistry,
  BusinessWorkflowGroupMatch,
} from './businessToolGroups';
import { meteredTokenParts } from './meteredUsage';

export interface BusinessActivityCostOptions {
  usdPerMillionTokens: number;
  usdPerCredit: number;
}

interface MutableService extends BusinessServiceUsage {
  knownCostUsd: number;
}

interface MutableWorkflow extends BusinessWorkflowUsage {
  hasAiCost: boolean;
}

interface MutableAttribution extends BusinessAttributionUsage {
  hasAiCost: boolean;
}

interface WorkflowIdentity {
  id: string;
  name: string;
  kind: BusinessWorkflowKind;
  groupId: string;
  groupName: string;
}

interface AttributionIdentity {
  id: string;
  name: string;
  groupId?: string;
  basis: BusinessAttributionBasis;
  confidence: BusinessAttributionConfidence;
}

/**
 * Convert VS Code's untyped object setting into finite, non-negative rates.
 * A numeric shorthand means USD per call; object values can also price runtime.
 */
export function sanitizeBusinessToolRates(input: unknown): BusinessToolRates {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const rates: BusinessToolRates = {};
  for (const [rawKey, rawValue] of Object.entries(input as Record<string, unknown>)) {
    const key = rawKey.trim().toLowerCase();
    if (!key) continue;
    if (isNonNegativeFinite(rawValue)) {
      rates[key] = { usdPerCall: rawValue };
      continue;
    }
    if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) continue;
    const source = rawValue as Record<string, unknown>;
    const rate: BusinessToolRate = {};
    if (isNonNegativeFinite(source.usdPerCall)) rate.usdPerCall = source.usdPerCall;
    if (isNonNegativeFinite(source.usdPerMinute)) rate.usdPerMinute = source.usdPerMinute;
    if (rate.usdPerCall != null || rate.usdPerMinute != null) rates[key] = rate;
  }
  return rates;
}

/** Aggregate content-free business activity across any requested event scope. */
export function summarizeBusinessActivity(
  events: readonly PromptEvent[],
  rates: BusinessToolRates,
  costs: BusinessActivityCostOptions,
  registry: BusinessToolRegistry,
): BusinessActivitySummary {
  const normalizedRates = sanitizeBusinessToolRates(rates);
  const services = new Map<string, MutableService>();
  const workflows = new Map<string, MutableWorkflow>();
  const skills = new Map<string, number>();
  const attribution = new Map<string, MutableAttribution>();
  const attributionEnabled = registry.enabled && registry.groups.some((group) => group.enabled);

  let totalToolCalls = 0;
  let businessCalls = 0;
  let successfulBusinessCalls = 0;
  let failedBusinessCalls = 0;
  let durationMs = 0;
  let pricedCalls = 0;
  let unpricedCalls = 0;
  let externalCostUsd = 0;
  let aiCostUsd = 0;
  let hasAiCost = false;
  let aiCostPartial = false;
  let relevantTurns = 0;

  for (const event of events) {
    const calls = event.toolCalls ?? [];
    const matchedCalls = calls
      .map((call) => ({ call, match: registry.matchTool(call) }))
      .filter((item): item is { call: ToolCallInfo; match: BusinessToolMatch } => !!item.match);
    const loadedSkills = unique(
      calls.flatMap((call) => call.loadedSkills ?? []),
    ).filter((skill) => registry.matchesWorkflow(skill));
    const workflowIdentity = detectWorkflow(event.promptText, loadedSkills, registry);
    const eventAiCost = costOfEvent(event, costs);

    if (attributionEnabled) {
      const attributionIdentity = classifyAttribution(workflowIdentity, matchedCalls);
      const row = attribution.get(attributionIdentity.id) ?? {
        ...attributionIdentity,
        turns: 0,
        meteredTurns: 0,
        mcpCalls: 0,
        tokens: 0,
        tokensPartial: false,
        hasAiCost: false,
      };
      const parts = meteredTokenParts(event.tokens);
      row.turns += 1;
      row.mcpCalls += calls.filter((call) => call.toolKind === 'mcp').length;
      if (parts.anyMetered) {
        row.meteredTurns += 1;
        row.tokens += parts.total;
        row.tokensPartial ||= parts.partial;
      }
      if (eventAiCost) {
        row.aiCostUsd = (row.aiCostUsd ?? 0) + eventAiCost.value;
        row.aiCostPartial ||= eventAiCost.partial;
        row.hasAiCost = true;
      }
      attribution.set(row.id, row);
    }

    if (!workflowIdentity && matchedCalls.length === 0) continue;

    relevantTurns += 1;
    for (const skill of loadedSkills) skills.set(skill, (skills.get(skill) ?? 0) + 1);

    const identity = workflowIdentity ?? {
      id: 'general:copilot',
      name: 'General Copilot',
      kind: 'general' as const,
    };
    const workflow = workflows.get(identity.id) ?? {
      ...identity,
      turns: 0,
      toolCalls: 0,
      businessCalls: 0,
      unpricedCalls: 0,
      externalCostUsd: 0,
      hasAiCost: false,
    };
    workflow.turns += 1;
    workflow.toolCalls += calls.length;
    totalToolCalls += calls.length;

    if (eventAiCost) {
      aiCostUsd += eventAiCost.value;
      hasAiCost = true;
      aiCostPartial ||= eventAiCost.partial;
      workflow.aiCostUsd = (workflow.aiCostUsd ?? 0) + eventAiCost.value;
      workflow.aiCostPartial ||= eventAiCost.partial;
      workflow.hasAiCost = true;
    }

    for (const { call, match: toolMatch } of matchedCalls) {
      businessCalls += 1;
      workflow.businessCalls += 1;
      if (call.success === true) successfulBusinessCalls += 1;
      if (call.success === false) failedBusinessCalls += 1;
      const callDuration = finiteOrZero(call.durationMs);
      durationMs += callDuration;

      const serviceKey = `${toolMatch.groupId}:${toolMatch.serviceId}`;
      const service = services.get(serviceKey) ?? {
        id: toolMatch.serviceId,
        name: toolMatch.serviceName,
        groupId: toolMatch.groupId,
        groupName: toolMatch.groupName,
        calls: 0,
        successfulCalls: 0,
        failedCalls: 0,
        durationMs: 0,
        pricedCalls: 0,
        knownCostUsd: 0,
      };
      service.calls += 1;
      service.durationMs += callDuration;
      if (call.success === true) service.successfulCalls += 1;
      if (call.success === false) service.failedCalls += 1;

      const priced = priceToolCall(call, toolMatch, normalizedRates);
      if (priced.priced) {
        pricedCalls += 1;
        service.pricedCalls += 1;
      } else {
        unpricedCalls += 1;
        workflow.unpricedCalls += 1;
      }
      externalCostUsd += priced.costUsd;
      service.knownCostUsd += priced.costUsd;
      workflow.externalCostUsd += priced.costUsd;
      services.set(serviceKey, service);
    }
    workflows.set(workflow.id, workflow);
  }

  const serviceRows: BusinessServiceUsage[] = [...services.values()]
    .map(({ knownCostUsd, ...service }) => ({
      ...service,
      estimatedCostUsd: service.pricedCalls > 0 ? knownCostUsd : undefined,
    }))
    .sort((a, b) =>
      (b.estimatedCostUsd ?? 0) - (a.estimatedCostUsd ?? 0) ||
      a.groupName.localeCompare(b.groupName) ||
      b.calls - a.calls ||
      a.name.localeCompare(b.name),
    );
  const workflowRows: BusinessWorkflowUsage[] = [...workflows.values()]
    .map(({ hasAiCost: _hasAiCost, ...workflow }) => workflow)
    .sort((a, b) =>
      knownWorkflowCost(b) - knownWorkflowCost(a) ||
      b.turns - a.turns ||
      a.name.localeCompare(b.name),
    );
  const skillRows: BusinessSkillUsage[] = [...skills.entries()]
    .map(([name, invocations]) => ({ name, invocations }))
    .sort((a, b) => b.invocations - a.invocations || a.name.localeCompare(b.name));
  const attributionRows: BusinessAttributionUsage[] = [...attribution.values()]
    .map(({ hasAiCost: _hasAiCost, ...row }) => row)
    .sort(compareAttribution);

  return {
    turns: relevantTurns,
    totalToolCalls,
    businessCalls,
    successfulBusinessCalls,
    failedBusinessCalls,
    durationMs,
    pricedCalls,
    unpricedCalls,
    aiCostUsd: hasAiCost ? aiCostUsd : undefined,
    aiCostPartial,
    externalCostUsd,
    trackedCostUsd: hasAiCost || pricedCalls > 0 ? (hasAiCost ? aiCostUsd : 0) + externalCostUsd : undefined,
    services: serviceRows,
    workflows: workflowRows,
    skills: skillRows,
    attribution: attributionRows,
  };
}

/** Combine independently summarized sessions without needing their prompt-bearing events. */
export function mergeBusinessActivitySummaries(
  summaries: readonly BusinessActivitySummary[],
): BusinessActivitySummary {
  const services = new Map<string, BusinessServiceUsage>();
  const workflows = new Map<string, BusinessWorkflowUsage>();
  const skills = new Map<string, number>();
  const attribution = new Map<string, BusinessAttributionUsage>();

  for (const summary of summaries) {
    for (const row of summary.services) {
      const key = `${row.groupId}:${row.id}`;
      const current = services.get(key);
      services.set(key, current
        ? {
            ...current,
            calls: current.calls + row.calls,
            successfulCalls: current.successfulCalls + row.successfulCalls,
            failedCalls: current.failedCalls + row.failedCalls,
            durationMs: current.durationMs + row.durationMs,
            pricedCalls: current.pricedCalls + row.pricedCalls,
            estimatedCostUsd: optionalSum(current.estimatedCostUsd, row.estimatedCostUsd),
          }
        : { ...row });
    }
    for (const row of summary.workflows) {
      const current = workflows.get(row.id);
      workflows.set(row.id, current
        ? {
            ...current,
            turns: current.turns + row.turns,
            toolCalls: current.toolCalls + row.toolCalls,
            businessCalls: current.businessCalls + row.businessCalls,
            unpricedCalls: current.unpricedCalls + row.unpricedCalls,
            aiCostUsd: optionalSum(current.aiCostUsd, row.aiCostUsd),
            aiCostPartial: !!current.aiCostPartial || !!row.aiCostPartial,
            externalCostUsd: current.externalCostUsd + row.externalCostUsd,
          }
        : { ...row });
    }
    for (const row of summary.skills) {
      skills.set(row.name, (skills.get(row.name) ?? 0) + row.invocations);
    }
    for (const row of summary.attribution) {
      const current = attribution.get(row.id);
      attribution.set(row.id, current
        ? {
            ...current,
            turns: current.turns + row.turns,
            meteredTurns: current.meteredTurns + row.meteredTurns,
            mcpCalls: current.mcpCalls + row.mcpCalls,
            tokens: current.tokens + row.tokens,
            tokensPartial: current.tokensPartial || row.tokensPartial,
            aiCostUsd: optionalSum(current.aiCostUsd, row.aiCostUsd),
            aiCostPartial: !!current.aiCostPartial || !!row.aiCostPartial,
          }
        : { ...row });
    }
  }

  return {
    turns: sumOf(summaries, (summary) => summary.turns),
    totalToolCalls: sumOf(summaries, (summary) => summary.totalToolCalls),
    businessCalls: sumOf(summaries, (summary) => summary.businessCalls),
    successfulBusinessCalls: sumOf(summaries, (summary) => summary.successfulBusinessCalls),
    failedBusinessCalls: sumOf(summaries, (summary) => summary.failedBusinessCalls),
    durationMs: sumOf(summaries, (summary) => summary.durationMs),
    pricedCalls: sumOf(summaries, (summary) => summary.pricedCalls),
    unpricedCalls: sumOf(summaries, (summary) => summary.unpricedCalls),
    aiCostUsd: optionalSummarySum(summaries, (summary) => summary.aiCostUsd),
    aiCostPartial: summaries.some((summary) => !!summary.aiCostPartial),
    externalCostUsd: sumOf(summaries, (summary) => summary.externalCostUsd),
    trackedCostUsd: optionalSummarySum(summaries, (summary) => summary.trackedCostUsd),
    services: [...services.values()].sort((a, b) =>
      (b.estimatedCostUsd ?? 0) - (a.estimatedCostUsd ?? 0) ||
      a.groupName.localeCompare(b.groupName) ||
      b.calls - a.calls ||
      a.name.localeCompare(b.name),
    ),
    workflows: [...workflows.values()].sort((a, b) =>
      knownWorkflowCost(b) - knownWorkflowCost(a) ||
      b.turns - a.turns ||
      a.name.localeCompare(b.name),
    ),
    skills: [...skills.entries()]
      .map(([name, invocations]) => ({ name, invocations }))
      .sort((a, b) => b.invocations - a.invocations || a.name.localeCompare(b.name)),
    attribution: [...attribution.values()].sort(compareAttribution),
  };
}

function sumOf<T>(values: readonly T[], select: (value: T) => number): number {
  return values.reduce((sum, value) => sum + select(value), 0);
}

function optionalSum(
  left: number | undefined,
  right: number | undefined,
): number | undefined {
  return left === undefined && right === undefined ? undefined : (left ?? 0) + (right ?? 0);
}

function optionalSummarySum(
  summaries: readonly BusinessActivitySummary[],
  select: (summary: BusinessActivitySummary) => number | undefined,
): number | undefined {
  return summaries.some((summary) => select(summary) !== undefined)
    ? summaries.reduce((sum, summary) => sum + (select(summary) ?? 0), 0)
    : undefined;
}

function detectWorkflow(
  promptText: string,
  loadedSkills: readonly string[],
  registry: BusinessToolRegistry,
): WorkflowIdentity | undefined {
  if (loadedSkills[0]) {
    const group = registry.matchWorkflow(loadedSkills[0]);
    if (group) return workflowIdentity('skill', loadedSkills[0], group);
  }
  const text = promptText.trim();
  const savedPrompt = text.match(/^\/prompt\s+([\w.-]+)/i);
  if (savedPrompt?.[1]) {
    const group = registry.matchWorkflow(savedPrompt[1]);
    if (group) return workflowIdentity('prompt', savedPrompt[1], group);
  }
  const slashSkill = text.match(/^\/([\w.-]+)/);
  if (slashSkill?.[1]) {
    const group = registry.matchWorkflow(slashSkill[1]);
    if (group) return workflowIdentity('skill', slashSkill[1], group);
  }
  const agent = text.match(/^@([\w.-]+)/);
  if (agent?.[1]) {
    const group = registry.matchWorkflow(agent[1]);
    if (group) return workflowIdentity('agent', agent[1], group);
  }
  return undefined;
}

function workflowIdentity(
  kind: Exclude<BusinessWorkflowKind, 'general'>,
  name: string,
  group: BusinessWorkflowGroupMatch,
): WorkflowIdentity {
  return {
    id: `${kind}:${name}`,
    name,
    kind,
    groupId: group.groupId,
    groupName: group.groupName,
  };
}

function classifyAttribution(
  workflow: WorkflowIdentity | undefined,
  matchedCalls: readonly { call: ToolCallInfo; match: BusinessToolMatch }[],
): AttributionIdentity {
  if (workflow) {
    return {
      id: `${workflow.groupId}:explicit-workflow`,
      name: `${workflow.groupName} workflow`,
      groupId: workflow.groupId,
      basis: 'explicit-workflow',
      confidence: 'high',
    };
  }

  const groups = new Map<string, string>();
  for (const { match } of matchedCalls) groups.set(match.groupId, match.groupName);
  if (groups.size === 1) {
    const [groupId, groupName] = groups.entries().next().value as [string, string];
    return {
      id: `${groupId}:tool-associated`,
      name: `${groupName} associated`,
      groupId,
      basis: 'tool-associated',
      confidence: 'medium',
    };
  }
  if (groups.size > 1) {
    return {
      id: 'mixed:selected-groups',
      name: 'Mixed selected groups',
      basis: 'mixed',
      confidence: 'low',
    };
  }
  return {
    id: 'other:copilot',
    name: 'Other Copilot',
    basis: 'other',
    confidence: 'unattributed',
  };
}

function compareAttribution(a: BusinessAttributionUsage, b: BusinessAttributionUsage): number {
  const rank: Record<BusinessAttributionBasis, number> = {
    'explicit-workflow': 0,
    'tool-associated': 1,
    mixed: 2,
    other: 3,
  };
  const terminalRank = (row: BusinessAttributionUsage): number =>
    row.basis === 'other' ? 2 : row.basis === 'mixed' ? 1 : 0;
  return (
    terminalRank(a) - terminalRank(b) ||
    (a.groupId ?? '').localeCompare(b.groupId ?? '') ||
    rank[a.basis] - rank[b.basis] ||
    a.name.localeCompare(b.name)
  );
}

function costOfEvent(
  event: PromptEvent,
  costs: BusinessActivityCostOptions,
): { value: number; partial: boolean } | undefined {
  const tokens = event.tokens;
  const parts = meteredTokenParts(tokens);
  if (!parts.anyMetered) return undefined;
  if (Number.isFinite(costs.usdPerMillionTokens) && costs.usdPerMillionTokens > 0) {
    return {
      value: (parts.total * costs.usdPerMillionTokens) / 1_000_000,
      partial: parts.partial,
    };
  }
  const credit = creditAmountForMeteredUsage(tokens);
  if (credit.estimated && !parts.inputMetered) return undefined;
  const value = configuredCostUsd(
    parts.total,
    credit.value,
    costs.usdPerMillionTokens,
    costs.usdPerCredit,
  );
  return value == null
    ? undefined
    // Under credit pricing, authoritative real AICs are a complete cost basis
    // even when the separately displayed token total is partial.
    : { value, partial: credit.estimated };
}

function priceToolCall(
  call: ToolCallInfo,
  match: BusinessToolMatch,
  rates: BusinessToolRates,
): { priced: boolean; costUsd: number } {
  const rate =
    rates[call.toolName.toLowerCase()] ??
    rates[`${match.groupId}/${match.serviceId}`] ??
    rates[match.serviceId] ??
    rates[`group:${match.groupId}`] ??
    rates['*'];
  if (!rate) return { priced: false, costUsd: 0 };
  if (rate.usdPerMinute != null && call.durationMs == null) {
    // Do not add a partial amount when the configured model cannot be evaluated.
    return { priced: false, costUsd: 0 };
  }
  const runtimeCost =
    rate.usdPerMinute != null ? (finiteOrZero(call.durationMs) / 60_000) * rate.usdPerMinute : 0;
  return { priced: true, costUsd: (rate.usdPerCall ?? 0) + runtimeCost };
}

function knownWorkflowCost(workflow: BusinessWorkflowUsage): number {
  return (workflow.aiCostUsd ?? 0) + workflow.externalCostUsd;
}

function isNonNegativeFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function finiteOrZero(value: number | undefined): number {
  return value != null && Number.isFinite(value) && value >= 0 ? value : 0;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
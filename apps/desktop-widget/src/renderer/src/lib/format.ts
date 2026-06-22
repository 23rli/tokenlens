import type { PetWorldState, WasteCategory } from '@ecoprompt/shared-types';

export const CATEGORY_LABEL: Record<WasteCategory, string> = {
  redundantContext: 'Redundant context',
  vagueness: 'Vagueness',
  retryLoop: 'Retry loop',
  toolOveruse: 'Tool overuse',
  verbosityMismatch: 'Verbosity mismatch',
  ignoredCoaching: 'Ignored coaching',
};

export const STATE_LABEL: Record<PetWorldState, string> = {
  thriving: 'Thriving',
  healthy: 'Healthy',
  concerned: 'Concerned',
  critical: 'Critical',
  collapse: 'Collapsing',
  dead: 'Barren',
};

export const STATE_COLOR: Record<PetWorldState, string> = {
  thriving: '#37d67a',
  healthy: '#7ed957',
  concerned: '#f1c40f',
  critical: '#f39c12',
  collapse: '#e74c3c',
  dead: '#7f8c8d',
};

export function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}

export function fmtUsd(n: number): string {
  if (n >= 0.01 || n === 0) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(4)}`;
}

export function scoreColor(score: number): string {
  if (score >= 80) return '#37d67a';
  if (score >= 60) return '#7ed957';
  if (score >= 40) return '#f1c40f';
  if (score >= 20) return '#f39c12';
  return '#e74c3c';
}

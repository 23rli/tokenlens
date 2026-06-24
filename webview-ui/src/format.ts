export function fmtPctSigned(n: number): string {
  const v = Math.round(n);
  return `${v > 0 ? '+' : ''}${v}%`;
}

export function fmtSigned(n: number): string {
  const v = Math.round(n * 10) / 10;
  return `${v > 0 ? '+' : ''}${v}`;
}

export function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.round(n)}`;
}

export function fmtUsd(n: number): string {
  if (n === 0) return '$0';
  return n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`;
}

export function fmtWasteCategory(category: string): string {
  return category
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

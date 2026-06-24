/**
 * Lightweight, dependency-free token estimator. Real token counts are not
 * available on disk, so we approximate with the standard ~4 chars/token rule of
 * thumb (slightly conservative for code). Deterministic for reliable tests.
 */
export function estimateTokens(text: string | undefined | null): number {
  if (!text) return 0;
  const chars = text.length;
  if (chars === 0) return 0;
  return Math.max(1, Math.ceil(chars / 4));
}

import { createHash } from 'node:crypto';

/**
 * One-way, stable hash of prompt text for privacy-preserving telemetry/corpus.
 * We never store or transmit raw prompt text by default — only this digest, so
 * repeated/near-identical prompts can be correlated without exposing content.
 */
export function hashText(text: string): string {
  return createHash('sha256').update(text.trim(), 'utf8').digest('hex').slice(0, 16);
}

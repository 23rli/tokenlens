import { describe, it, expect } from 'vitest';
import { hashText } from '../hash';

describe('telemetry hashText', () => {
  it('is stable and trims surrounding whitespace', () => {
    expect(hashText('write a test')).toBe(hashText('  write a test  '));
  });

  it('differs for different prompts', () => {
    expect(hashText('write a test')).not.toBe(hashText('fix the bug'));
  });

  it('produces a short hex digest (no raw text)', () => {
    const h = hashText('some secret prompt content');
    expect(h).toMatch(/^[0-9a-f]{16}$/);
    expect(h).not.toContain('secret');
  });
});

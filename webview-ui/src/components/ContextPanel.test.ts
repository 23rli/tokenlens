import { describe, expect, it } from 'vitest';
import { humanizeContextLabel } from './ContextPanel';

describe('humanizeContextLabel', () => {
  it('turns source identifiers into readable labels', () => {
    expect(humanizeContextLabel('tool_results')).toBe('Tool results');
    expect(humanizeContextLabel('SystemInstructions')).toBe('System instructions');
    expect(humanizeContextLabel('')).toBe('Other');
  });
});
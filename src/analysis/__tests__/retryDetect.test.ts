import { describe, it, expect } from 'vitest';
import { isReask } from '../retryDetect';

/**
 * Labelled fixture of (previous prompt, current prompt) pairs with a ground-truth
 * re-ask flag, so we can measure the detector's precision/recall instead of
 * trusting the heuristic blindly. Includes a hard rephrase the detector is
 * expected to miss and a borderline case it over-triggers on, so the thresholds
 * reflect real behaviour rather than a hand-tuned 100%.
 */
interface Case {
  prev: string;
  cur: string;
  reask: boolean;
}

const cases: Case[] = [
  // --- true re-asks ---
  { prev: 'Add email validation to LoginForm.tsx', cur: "it's still not validating", reask: true },
  { prev: 'Fix the checkout total', cur: 'still wrong, the tax is off', reask: true },
  { prev: 'Refactor UserService', cur: "that didn't work", reask: true },
  { prev: 'Generate the migration', cur: 'same error as before', reask: true },
  { prev: 'Write the login handler', cur: 'nope, the 401 branch never runs', reask: true },
  { prev: 'Split the file', cur: 'try again, it broke the imports', reask: true },
  { prev: 'Add the auth guard', cur: 'that still fails', reask: true },
  {
    prev: 'Add a loading spinner to the submit button in LoginForm.tsx',
    cur: 'Add a loading spinner to the submit button in LoginForm.tsx please',
    reask: true,
  },
  { prev: 'Fix the types in LoginForm.tsx', cur: 'Error: TS2322 still there after your change', reask: true },
  // hard rephrase — detector is EXPECTED to miss this (keeps recall honest)
  {
    prev: 'Refactor the UserService to split responsibilities',
    cur: 'Please split UserService into two classes instead',
    reask: true,
  },

  // --- fresh, non-re-ask instructions ---
  { prev: 'Add email validation to LoginForm.tsx', cur: 'Now add a loading spinner to the submit button', reask: false },
  { prev: 'Fix the checkout total', cur: 'Write a unit test for the checkout page', reask: false },
  { prev: 'Refactor UserService', cur: 'Add structured logging to each repository method', reask: false },
  { prev: 'Add caching to getUser', cur: 'Update the DI container to register the new services', reask: false },
  { prev: 'Write the login handler', cur: 'Extract the fetch call into a useLogin hook', reask: false },
  { prev: 'Add a loading spinner to LoginForm.tsx', cur: 'Add error handling to LoginForm.tsx', reask: false },
  { prev: 'Generate the migration', cur: 'Add a currency formatter util in format.ts', reask: false },
  { prev: 'Split the file', cur: 'Run a pass to remove unused imports', reask: false },
  // borderline — detector over-triggers on the "again," opener (keeps precision honest)
  { prev: 'Add the header', cur: 'again, on the same note, add a footer too', reask: false },
];

describe('isReask (retry detection)', () => {
  it('returns false with no previous turn', () => {
    expect(isReask('still broken', undefined)).toBe(false);
  });

  it('hits precision and recall targets on the labelled set', () => {
    let tp = 0;
    let fp = 0;
    let fn = 0;
    for (const c of cases) {
      const predicted = isReask(c.cur, c.prev);
      if (predicted && c.reask) tp++;
      else if (predicted && !c.reask) fp++;
      else if (!predicted && c.reask) fn++;
    }
    const precision = tp / (tp + fp || 1);
    const recall = tp / (tp + fn || 1);
    expect(precision).toBeGreaterThanOrEqual(0.8);
    expect(recall).toBeGreaterThanOrEqual(0.7);
  });
});

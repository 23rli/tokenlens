import type { ToolCallInfo } from '@ecoprompt/shared-types';

export interface ScriptedStep {
  label: string;
  /** Short narration for the demo overlay. */
  narration: string;
  promptText: string;
  responseText?: string;
  toolCalls?: ToolCallInfo[];
  model?: string;
  retryCountInSession?: number;
  adoptedPreviousTip?: boolean;
}

const ok = (toolName: string): ToolCallInfo => ({ toolName, success: true });
const fail = (toolName: string): ToolCallInfo => ({ toolName, success: false });

/** A bloated, self-duplicating context block, re-pasted across the bad turns. */
const BIG_PASTE =
  'Refactor the data layer. Refactor the data layer. ' +
  'Here is the entire file again for context. Here is the entire file again for context. ' +
  'It loads users. It loads users. It saves users. It saves users. ' +
  'It caches users. It caches users. The data layer is important. The data layer is important.';

/**
 * The reliable demo arc: thriving → slip → redundant → retry loop → collapse →
 * adopt the rewrite → recovery → thriving. Drives a memorable 60–90s demo.
 */
export const DEMO_SCRIPT: ScriptedStep[] = [
  {
    label: 'Healthy start',
    narration: 'A crisp, bounded prompt. The world thrives.',
    promptText:
      'Summarize the design doc in 5 bullets: cost savings, risks, mitigations, owners, and next steps.',
    responseText: 'Five concise bullets covering each requested dimension.',
    model: 'claude-opus-4.6',
  },
  {
    label: 'Still efficient',
    narration: 'Clear task, explicit output, no wasted tools.',
    promptText:
      'Write a TypeScript function slugify(input: string): string that lowercases, trims, and replaces non-alphanumerics with hyphens. Return only the function.',
    responseText: 'A single tidy function, no extra prose.',
    toolCalls: [ok('read_file')],
    model: 'claude-opus-4.6',
  },
  {
    label: 'First slip',
    narration: 'A vague ask with no target or format — clarification risk.',
    promptText: 'make it better',
    responseText: 'The assistant has to guess what "it" and "better" mean.',
    model: 'claude-opus-4.6',
  },
  {
    label: 'Redundant context',
    narration: 'Re-pasting the same context twice instead of referencing it.',
    promptText: `${BIG_PASTE} Please just refactor the data layer like before.`,
    responseText: 'A large response wading through duplicated context.',
    toolCalls: [ok('read_file'), ok('read_file')],
    model: 'claude-opus-4.6',
  },
  {
    label: 'Retry loop',
    narration: 'A near-duplicate retry with no added specificity.',
    promptText: `${BIG_PASTE} Still not working, try again, same as before, just fix it.`,
    responseText: 'Another pass at the same ambiguous request.',
    toolCalls: [fail('read_file'), fail('read_file'), fail('grep_search')],
    retryCountInSession: 2,
    model: 'claude-opus-4.6',
  },
  {
    label: 'Collapse',
    narration: 'Re-paste again, vague, ignoring coaching, with a storm of failed tools.',
    promptText: `${BIG_PASTE} Still broken, fix it, do everything in exhaustive detail and leave nothing out.`,
    responseText: 'Thrashing across tools without a clear objective.',
    toolCalls: [
      fail('read_file'),
      fail('read_file'),
      fail('grep_search'),
      fail('read_file'),
      fail('grep_search'),
      fail('read_file'),
      fail('list_dir'),
      fail('read_file'),
      fail('grep_search'),
    ],
    retryCountInSession: 4,
    adoptedPreviousTip: false,
    model: 'claude-opus-4.6',
  },
  {
    label: 'Adopt the rewrite',
    narration: 'The user accepts the coached rewrite. The world recovers.',
    promptText:
      'Refactor login() to async/await, keep behavior identical, and return only the unified diff.',
    responseText: 'A focused diff, exactly as requested.',
    toolCalls: [ok('read_file')],
    adoptedPreviousTip: true,
    model: 'claude-opus-4.6',
  },
  {
    label: 'Sustained habit',
    narration: 'Good habits stick. Thriving again.',
    promptText:
      'Add 3 unit tests for slugify covering empty string, unicode input, and multiple spaces. Return only the test block.',
    responseText: 'Three targeted tests, nothing extraneous.',
    toolCalls: [ok('read_file')],
    adoptedPreviousTip: true,
    model: 'claude-opus-4.6',
  },
];

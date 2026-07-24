# Token Lens 0.8.6 — release QA

_Date: July 23, 2026_
_Decision: **GO**_

## Final artifact

- File: `tokentama-0.8.6.vsix`
- Size: 123,996 bytes
- SHA-256: `9189D70111AD6D54011F321C24261DB92C035C8F6741CCF93E7A9D96914B272A`
- Manifest identity: `tokentama.tokentama@0.8.6`
- Installed locally with `--force`; VS Code read-back confirmed `tokentama.tokentama@0.8.6`. All three installed executable assets matched the final build byte-for-byte; manifest identity matched with only VS Code's injected `__metadata` field added.

## Automated gates

| Gate | Result |
| --- | --- |
| Patch whitespace | Pass; line-ending notices only |
| Strict TypeScript | Pass |
| Vitest | 34 files, 178 tests passed |
| Production esbuild | Pass |
| Bundled activation/lifecycle/export smoke | Pass |
| Production dependencies | Preact 10.29.4 only |
| Production npm audit | 0 vulnerabilities |
| VSIX payload | 19 files; no source, maps, dependencies, preview, internal briefs, or QA files |
| Packaged Markdown | 10 documents, 14 relative links checked, 0 missing |
| Executable network/telemetry scan | 0 matches |
| Targeted long-history regression suite | 6 files, 33 tests passed |
| 100-chat watcher startup | 100 sessions tracked, 0 historical snapshot reads |

## UX and accessibility gates

| Gate | Result |
| --- | --- |
| Five-tab navigation | One row at 240 px and 408 px browser widths (192 px and 326 px effective webview widths); every label fully visible, including when selected |
| Horizontal overflow | None across Live, Overview, Turns, Workflows, or Info |
| State matrix | No chat, pending, partial, paused, progressive loading, ledger error, no rate, and zero-token/real-credit states checked |
| Keyboard semantics | Arrow/Home/End tabs and scope selectors retained |
| Accessible descriptions | Help text available to assistive technology and visual hover/focus bubble |
| Reduced motion | Animations/transitions reduced to 0.01 ms |
| High contrast / forced colors | Visible cards, active tabs, focus, and state borders |
| Narrow layout | Metrics stack; Overview header/actions stack; all four range names remain visible; long data names truncate/wrap without horizontal scrolling |
| Local visual preview | Live, Overview, Turns, Workflows, and Info measured at both widths; page/main scroll widths matched their client widths in all 10 cases |
| Stylesheet audit | 137 retired selector families removed; source CSS reduced 57.2% |

## Performance regression gates

| Path | Result |
| --- | --- |
| 200-turn forecast cold rebuild | 11.32 ms |
| Unchanged forecast tick | 0.006 ms |
| One-turn append | 0.14 ms |
| Largest 56.88 MB source cold parse | 443.9 ms |
| Largest source cached read | 0.042 ms |
| Sequential parsed-snapshot probe | 91 sessions, 0 misses, 0.32 ms |
| Ledger materialization | 100,000 observations / 50,000 records in 251.7 ms |
| Overview query | 133.3 ms |

## Original loading issue

**Fixed.** The 70–100 retained-chat startup failure and repeated stalls in long
70–100+ turn chats are covered separately:

- Watcher activation records source metadata for 100 retained chats without
	parsing any historical snapshot.
- Whole-scope totals process the active chat first and continue historical
	sessions in bounded host turns with visible progress.
- Unchanged source signatures are no-ops; parsed snapshots and session/ledger
	rollups are reused instead of reparsing all retained chats.
- Forecast history appends one new measured turn instead of rebuilding all prior
	turns, while revisions and compaction still trigger a safe rebuild.
- Transient webview history is bounded without losing the full turn count.

One honest limit remains: the first read of one newly changed, exceptionally
large Copilot JSONL source is synchronous. In the release corpus, a 56.88 MB
source took 487.5 ms on a later confirmation run; its cached read took 0.023 ms.
This bounded cold read is not the former repeated multi-chat startup loop.

## Independent review

Three independent discovery audits covered product language, visual/accessibility quality, and edge-state plumbing. Two final clean-context judges reviewed the implemented candidate. Both approved it with no blockers. Their remaining terminology consistency suggestions were applied before this artifact was packaged.

## Release changes

- Replaced ambiguous/internal wording with one measured/estimated/known vocabulary.
- Renamed Profiles to Workflows and made request-level, non-causal attribution explicit.
- Replaced the layered legacy stylesheet with one native VS Code visual system.
- Added visible paused/loading/error states and corrected zero-value rendering.
- Kept top navigation on one line without truncation at narrow widths.
- Added narrow, reduced-motion, high-contrast, forced-color, focus, tooltip, and long-name handling.
- Removed misleading deltas across incomparable partial token directions.

## Release decision

**GO.** The exact artifact above passed deterministic, visual, accessibility, edge-state, performance, privacy, package, and independent-review gates. After installation, run **Developer: Reload Window** to load 0.8.6.

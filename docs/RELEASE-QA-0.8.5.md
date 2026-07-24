# Token Lens 0.8.5 — release QA

_Date: July 23, 2026_
_Decision: **GO**_

## Final artifact

- File: `tokentama-0.8.5.vsix`
- Size: 128,434 bytes
- SHA-256: `6A1061DEEE96802F966E1C68C981521BD3FA6386B2040DB42C40D7C481DDCEA6`
- Manifest identity: `tokentama.tokentama@0.8.5`
- Installed locally with `--force`; VS Code read-back confirmed `tokentama.tokentama@0.8.5`

## Automated release gates

| Gate | Result |
| --- | --- |
| VS Code Problems | No errors |
| Patch whitespace | Pass; line-ending notices only |
| Strict TypeScript | Pass |
| Vitest | 33 files, 175 tests passed |
| Production esbuild | Pass |
| Bundled activation/lifecycle/export smoke | Pass |
| Production dependency tree | Preact 10.29.4 only |
| Production npm audit | 0 vulnerabilities |
| VSIX payload | 19 files; no source, maps, scripts, dependencies, preview, internal briefs, or QA files |
| Packaged Markdown | 10 documents, 14 relative links checked, 0 missing |
| Executable network/telemetry scan | 0 fetch, XHR, WebSocket, Application Insights, or trackEvent references |
| Local visual preview | Pass at 360 px; no horizontal overflow or runtime errors |
| Accessibility/turn range | Correct retained range and original turn numbering verified |

## Performance gates

| Path | Result |
| --- | --- |
| 200-turn forecast cold rebuild | 10.52 ms |
| Unchanged forecast tick | 0.005 ms |
| One-turn append | 0.13 ms |
| Largest real source (56.88 MB) cold parse | 450.8 ms |
| Largest real source cached read | 0.023 ms |
| Sequential parsed-snapshot probe | 91 sessions, 0 misses, 0.54 ms warm pass |
| Ledger materialization | 100,000 observations / 50,000 records in 243.4 ms |
| Overview query | 124.9 ms |

## Independent review

- Three clean-context audits were run with performance, data-integrity, lifecycle, and release lenses.
- Speculative concurrency, mtime, pending-ID, and fire-and-forget findings were rejected after control-flow grounding.
- The grounded WeakRef cache-miss concern was resolved with a two-entry, 30-second strong MRU layered over bounded weak storage.
- Final tie-break review approved the implementation after that condition.

## Release changes

- Metadata-only watcher startup avoids parsing every retained chat.
- Per-file signatures invalidate only changed sources and detect size growth even under coarse mtimes.
- Parsed snapshots, session rollups, durable projections, and ledger materialization are cached with partial-read recovery.
- Active-chat state renders first; whole-scope totals fill progressively with visible progress and retry backoff.
- Forecast history appends incrementally and safely rebuilds on revisions/compaction.
- Transient webview history is bounded to 500 rows while preserving exact totals and original turn numbers.
- View refresh work is deferred to a cancellable macrotask so current state can paint first.

## Honest limits

- A first cold parse of a very large private Copilot JSONL source remains synchronous; progressive aggregation prevents it from turning the whole history set into one long startup block.
- Rebuild can recover only source files still retained in this VS Code profile on this machine.
- GitHub Copilot Chat in VS Code remains the only source adapter.
- Exact per-MCP-call tokens remain unavailable from the current source.
- A VS Code window must reload after VSIX installation before the new extension host code runs.

## Release decision

**GO.** The exact artifact above passed all deterministic, performance, package, privacy, visual, and installed-version gates. Run **Developer: Reload Window**, then open Token Lens to load 0.8.5.

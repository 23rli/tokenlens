# 🌱 EcoPrompt Guardians

> A VS Code companion that turns invisible AI prompt waste into something **visible, coachable, and emotionally engaging.**

EcoPrompt Guardians scores the **waste** in your AI prompts (not just their length), coaches you with a one-line tip and a rewritten prompt, and grows a tiny **tamagotchi ecosystem** — a guardian whose world thrives when you prompt efficiently and wilts when you don't.

It is aligned with the strategy in the EcoPrompt Guardians master design document included in this repository.

---

## Why

AI usage is rising fast, and most waste is invisible: verbose prompts, repeated retries, redundant context, and tool overuse. At scale these become real cost, latency, and sustainability concerns. EcoPrompt Guardians makes that waste **legible per-prompt** and coaches better habits in the moment.

## Features

- **Scores waste, not length.** Five efficiency subscores and a transparent, per-category waste breakdown.
- **A living guardian.** A placeholder creature + ecosystem reacts to your efficiency across six health states (thriving → dormant). Real art is coming in a later iteration.
- **Coaching in the moment.** A short tip plus an optional rewritten prompt, using an offline heuristic coach by default (no network) or your own LLM when configured.
- **Two ways to capture prompts.**
  - **Manual:** run **EcoPrompt: Score this prompt** (or select text in the editor) to score on demand.
  - **Passive (experimental):** best-effort, read-only watching of VS Code Copilot chat sessions, scored automatically.
- **Impact metrics.** Token reduction, waste reduction, prompt-quality improvement, average score increase, coaching engagement, and an estimated sustainability (Wh / gCO₂e) impact.

## Getting started (development)

```powershell
npm install
npm run build          # bundle host + webview (esbuild)
# Press F5 in VS Code to launch the Extension Development Host
```

Open the **EcoPrompt Guardians** view from the Activity Bar, then run **EcoPrompt: Score this prompt** from the Command Palette and paste a verbose prompt to watch the guardian react.

### Scripts

| Script | Purpose |
| --- | --- |
| `npm run build` | Bundle the extension host + webview |
| `npm run watch` | Rebuild on change |
| `npm run typecheck` | `tsc --noEmit` across host + webview |
| `npm test` | Run the scoring/ingestion/coaching unit tests (Vitest) |
| `npm run vsce:package` | Produce an installable `.vsix` |

## Configuration

| Setting | Default | Description |
| --- | --- | --- |
| `ecoprompt.passiveCapture.enabled` | `true` | Passively read Copilot chat sessions (experimental, read-only). |
| `ecoprompt.coaching.llmProvider` | `none` | `none` uses the offline heuristic coach; `openai` / `azure-openai` use an LLM. |
| `ecoprompt.coaching.endpoint` | `""` | LLM endpoint URL. |
| `ecoprompt.coaching.model` | `gpt-4o-mini` | Model / deployment name. |
| `ecoprompt.sustainability.whPerThousandTokens` | `0.4` | Watt-hours per 1,000 tokens, for the sustainability estimate. |
| `ecoprompt.sustainability.gridGramsCo2PerKwh` | `400` | Grid carbon intensity (gCO₂e/kWh). |

Set an LLM key securely with **EcoPrompt: Set coaching LLM API key** (stored in VS Code SecretStorage).

## Privacy

All scoring and state are stored **locally** in extension storage. No data leaves your machine unless you explicitly configure an LLM coaching provider. Passive capture is read-only and never modifies Copilot's files.

## Architecture

```
src/
├─ extension.ts          # activation: view, status bar, commands, watcher
├─ capture/              # Copilot session reader + file watcher + parsers
├─ core/scoreService.ts  # score → coach → persist pipeline
├─ scoring/              # waste detectors, subscores, pet state machine, token/cost model
├─ coaching/             # heuristic + optional LLM coach
├─ metrics/              # success-metric aggregation
├─ state/                # persisted guardian store
├─ status/               # status-bar indicator
├─ types/                # shared domain contracts
└─ webview/              # webview provider + html + host↔webview contract
webview-ui/src/          # Preact dashboard (guardian, metrics, coaching)
```

## License

MIT — see [LICENSE](LICENSE). Placeholder guardian art is generated programmatically and will be replaced.

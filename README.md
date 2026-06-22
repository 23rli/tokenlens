# 🌱 EcoPrompt Guardians

> A desktop AI‑efficiency companion that turns invisible prompt waste into something **visible, coachable, and emotionally engaging.**

EcoPrompt Guardians watches how you use AI, scores the **waste** in your prompts (not just their length), coaches you with a one‑line tip and a rewritten prompt, and renders a tiny living ecosystem — a Clippy‑inspired guardian and its world — that **thrives when you prompt efficiently and decays when you don't.**

This repository is the **MVP vertical slice** described in
[`EcoPrompt_Guardians_Master_Design_Doc.md`](EcoPrompt_Guardians_Master_Design_Doc.md).

---

## Why

AI usage is rising fast, and most waste is invisible: verbose prompts, repeated retries, redundant context, and tool overuse. At scale these become real cost, latency, and sustainability concerns. EcoPrompt Guardians makes that waste **legible per‑prompt** and coaches better habits in the moment — the leading indicator that complements lagging org‑level usage dashboards.

## What makes it different

- **Scores waste, not length.** A long prompt that prevents three retries is _efficient_.
- **Live Copilot interception.** Reads the real VS Code GitHub Copilot chat stream on disk (transcripts + chat sessions) and scores it in real time. Manual entry and a scripted demo are always‑available fallbacks.
- **Real prices, honest estimates.** Token counts are estimated with a tokenizer and priced with the **real** per‑model rates Copilot ships in `models.json`.
- **Pluggable usage source.** A `UsageMetricsProvider` seam lets an enterprise rollup (e.g. an authorized Power BI export) drop in later — without the demo depending on it.

---

## Monorepo layout

```
tokentama/                # repo root (what gets pushed to GitHub)
├─ packages/
│  ├─ shared-types/     # Domain contracts (PromptEvent, Score*, Tip*, SessionSummary, PetWorldState)
│  ├─ scoring-engine/   # Heuristic detectors, waste calculator, pet state machine, token/cost model
│  ├─ ingestion/        # Copilot interception: transcript + chatSession tail, manual & scripted adapters
│  └─ llm-adapters/     # Heuristic coach + optional Azure OpenAI / Foundry coach
├─ apps/
│  ├─ api/              # Azure Functions (scorePrompt, generateTip, sessionSummary, health) + local server
│  └─ desktop-widget/   # Electron + React + procedural Canvas art
├─ infra/bicep/         # Function App, Storage, App Insights, optional Azure OpenAI
├─ docs/                # demo runbook, Azure deploy guide
├─ scripts/             # demo.mjs (headless arc)
├─ .github/workflows/   # CI pipeline
└─ EcoPrompt_Guardians_Master_Design_Doc.md   # the full strategy & spec
```

## Architecture at a glance

```
Ingestion (transcript/chatSession tail | manual | scripted)
   → PromptEvent → API /scorePrompt (scoring-engine)
   → ScorePromptResponse (scores, reasons, petState, delta)
   → Widget updates pet state machine + world renderer
   → /generateTip (heuristic or LLM) → tip + rewritten prompt
   → telemetry → App Insights;  history → storage → /sessionSummary → metrics tab
```

The widget falls back to running the scoring engine **locally** if the API is unreachable, so the live demo never depends on the network.

---

## Prerequisites

- **Node.js ≥ 20** (developed on Node 24). Verify with `node -v`.
- **npm ≥ 10** (bundled with Node 20+). This repo uses **npm workspaces** — please don't use pnpm or yarn.
- **git**.
- Works on Windows, macOS, and Linux. The desktop widget uses **Electron**, whose binary is downloaded automatically during `npm install`.

## Quickstart (clone → install → run)

```bash
git clone <your-repo-url>
cd tokentama            # the repository root

npm install             # installs all workspaces + links internal @ecoprompt/* packages
npm run build           # compiles the 4 packages + the API
npm test                # 44 unit tests should pass
```

That's the whole setup. Nothing else is required to run the demo locally with **zero cloud credentials**.

## Run the full stack

Open **two terminals** from the repo root:

```bash
# Terminal 1 — backend (plain Node server, no Azure needed)
npm run api:start       # serves http://localhost:7071/api
```

```bash
# Terminal 2 — desktop widget (Electron overlay, docks bottom-right)
npm run widget:dev
```

In the widget, use the **Demo** controls to step through the scripted scenario and watch the world move from thriving → collapse → recovery. Switch to **Manual** to score your own prompt text, or **Live** to score your real VS Code Copilot chat (see [Live Copilot interception](#live-copilot-interception-how-it-works)).

No GUI handy? Watch the full arc headlessly:

```bash
npm run demo            # prints the thriving → collapse → recovery arc to the console
```

> The widget runs the scoring engine **locally** if the API is down, so the demo never depends on the network or the cloud.

## Scripts reference

Run all of these from the repo root.

| Script                                    | What it does                                                         |
| ----------------------------------------- | -------------------------------------------------------------------- |
| `npm install`                             | Install all workspaces and link the internal `@ecoprompt/*` packages |
| `npm run build`                           | `tsc --build` — compiles the 4 packages + the API (composite refs)   |
| `npm run build:clean`                     | Remove all compiled output (`tsc --build --clean`)                   |
| `npm test`                                | Run the full Vitest suite (44 tests)                                 |
| `npm run test:watch`                      | Vitest in watch mode                                                 |
| `npm run coverage`                        | Vitest with V8 coverage                                              |
| `npm run lint`                            | ESLint across the workspace                                          |
| `npm run format` / `npm run format:check` | Prettier write / verify (CI uses `format:check`)                     |
| `npm run api:start`                       | Start the local Node API server on `:7071`                           |
| `npm run widget:dev`                      | Run the Electron + React widget (electron-vite dev)                  |
| `npm run widget:build`                    | Production-build the widget into `apps/desktop-widget/out/`          |
| `npm run widget:typecheck`                | Strict `tsc --noEmit` typecheck of the widget                        |
| `npm run demo`                            | Headless scripted demo arc                                           |

## Configuration (environment variables)

**Everything works locally without any configuration.** To enable the optional cloud / LLM features, copy [`.env.example`](.env.example) → `.env` and fill in the values below.

| Variable                                                                         | Used by        | Effect when unset                       |
| -------------------------------------------------------------------------------- | -------------- | --------------------------------------- |
| `ECO_API_PORT`                                                                   | API server     | Defaults to `7071`                      |
| `ECO_API_URL`                                                                    | Desktop widget | Defaults to `http://localhost:7071/api` |
| `ECO_LLM_PROVIDER`                                                               | llm-adapters   | `none` → deterministic heuristic coach  |
| `ECO_LLM_ENDPOINT` / `_API_KEY` / `_DEPLOYMENT` / `_API_VERSION` / `_TIMEOUT_MS` | llm-adapters   | Ignored unless a provider is set        |
| `APPLICATIONINSIGHTS_CONNECTION_STRING`                                          | API telemetry  | Telemetry is a no-op (console only)     |
| `ECO_STORAGE_CONNECTION_STRING`                                                  | API storage    | Falls back to an in-memory store        |
| `ECO_COPILOT_WORKSPACE_STORAGE`                                                  | ingestion      | Auto-detects the VS Code storage path   |

---

## Team guide — own a part, fix a part

This is a monorepo of small, single-responsibility packages with strong contracts between them. **Data flows left → right, and each package only depends on the ones before it:**

```
shared-types → scoring-engine → ingestion → llm-adapters → apps/api → apps/desktop-widget
```

| Design-doc role             | Lives in                  | You mostly edit…                                   |
| --------------------------- | ------------------------- | -------------------------------------------------- |
| Framework / architecture    | `packages/shared-types`   | The shared contracts every other package imports   |
| Scoring engine lead         | `packages/scoring-engine` | Heuristic detectors, waste weights, pet states     |
| AI coach lead               | `packages/llm-adapters`   | Tip wording, prompt rewrite, LLM provider wiring   |
| Ingestion / Copilot capture | `packages/ingestion`      | Copilot log parsing, adapters, session tracking    |
| Telemetry / backend lead    | `apps/api`                | HTTP endpoints, storage, telemetry                 |
| Desktop widget lead         | `apps/desktop-widget`     | Electron shell, React UI, the procedural world art |

> **Golden rule:** if you change a shape that crosses a package boundary, change it in [`packages/shared-types`](packages/shared-types/src) first, then `npm run build` to let TypeScript show you every call site that needs updating.

### 1. `packages/shared-types` — the contracts (start here)

**Purpose:** the single source of truth for every type that crosses a boundary — `PromptEvent`, `ScorePromptRequest`/`Response`, `TipRequest`/`Response`, `SessionSummary`, `PetWorldState`, telemetry events. Pure types, no runtime logic.

- Key files: [`Score.ts`](packages/shared-types/src/Score.ts), [`PromptEvent.ts`](packages/shared-types/src/PromptEvent.ts), [`Tip.ts`](packages/shared-types/src/Tip.ts), [`PetWorldState.ts`](packages/shared-types/src/PetWorldState.ts), [`SessionSummary.ts`](packages/shared-types/src/SessionSummary.ts), [`Telemetry.ts`](packages/shared-types/src/Telemetry.ts), barrel: [`index.ts`](packages/shared-types/src/index.ts).
- Run/test: `npm run build` (type-only; consumed by everything else).
- If you change this: rebuild and fix the call sites TypeScript flags. Keep it dependency-free.

### 2. `packages/scoring-engine` — the brain

**Purpose:** turns a `ScorePromptRequest` into a `ScorePromptResponse`. Runs heuristic detectors, computes the weighted **waste score** and the 5 subscores, maps the score to a `PetWorldState`, and estimates tokens/cost with real per-model prices.

- Entry point: [`scorePrompt.ts`](packages/scoring-engine/src/scorePrompt.ts), barrel: [`index.ts`](packages/scoring-engine/src/index.ts).
- Detectors (one file each): [`redundantContext.ts`](packages/scoring-engine/src/heuristics/redundantContext.ts), [`vagueness.ts`](packages/scoring-engine/src/heuristics/vagueness.ts), [`retryLoop.ts`](packages/scoring-engine/src/heuristics/retryLoop.ts), [`toolOveruse.ts`](packages/scoring-engine/src/heuristics/toolOveruse.ts), [`verbosityMismatch.ts`](packages/scoring-engine/src/heuristics/verbosityMismatch.ts), [`structuredPrompt.ts`](packages/scoring-engine/src/heuristics/structuredPrompt.ts), [`coachingAdoption.ts`](packages/scoring-engine/src/heuristics/coachingAdoption.ts).
- Calculators: [`wasteScore.ts`](packages/scoring-engine/src/calculators/wasteScore.ts), [`subscores.ts`](packages/scoring-engine/src/calculators/subscores.ts). State machine: [`transitions/`](packages/scoring-engine/src/transitions). Pricing/tokenizer: [`models/`](packages/scoring-engine/src/models).
- Run/test: `npx vitest run packages/scoring-engine` (tests in [`__tests__/`](packages/scoring-engine/src/__tests__)).
- If you change this: add or adjust a detector + its test. Waste weights live in the calculator; score→state bands live in `transitions`.

### 3. `packages/ingestion` — where prompts come from

**Purpose:** produces `PromptEvent`s from three sources and tracks per-session state (retry counts, recent prompts) to build the `ScorePromptRequest`.

- Adapters: [`ManualEntryAdapter.ts`](packages/ingestion/src/adapters/ManualEntryAdapter.ts), [`ScriptedScenarioAdapter.ts`](packages/ingestion/src/adapters/ScriptedScenarioAdapter.ts), [`TranscriptTailAdapter.ts`](packages/ingestion/src/adapters/TranscriptTailAdapter.ts) (live Copilot).
- Copilot parsing: [`copilotPaths.ts`](packages/ingestion/src/copilotPaths.ts), [`copilotReader.ts`](packages/ingestion/src/copilotReader.ts), [`transcriptParser.ts`](packages/ingestion/src/transcriptParser.ts), [`chatSessionParser.ts`](packages/ingestion/src/chatSessionParser.ts).
- Session state: [`sessionTracker.ts`](packages/ingestion/src/sessionTracker.ts). Scripted beats: [`demoScript.ts`](packages/ingestion/src/demoScript.ts).
- Run/test: `npx vitest run packages/ingestion`.
- If you change this: every adapter implements the `IngestionAdapter` interface in [`types.ts`](packages/ingestion/src/types.ts). Keep `source` tags and the `onPromptEvent` contract stable.

### 4. `packages/llm-adapters` — the coach

**Purpose:** turns a `TipRequest` into a `TipResponse` (short tip, detailed tip, rewritten prompt, estimated savings). Uses an LLM when configured, otherwise a deterministic heuristic coach.

- Router: [`coach.ts`](packages/llm-adapters/src/coach.ts) (`generateTip`). Heuristic: [`heuristicCoach.ts`](packages/llm-adapters/src/heuristicCoach.ts). LLM: [`llmCoach.ts`](packages/llm-adapters/src/llmCoach.ts). Config: [`config.ts`](packages/llm-adapters/src/config.ts). Prompts: [`promptTemplates.ts`](packages/llm-adapters/src/promptTemplates.ts).
- Run/test: `npx vitest run packages/llm-adapters`.
- If you change this: the heuristic path must always work without network/credentials. Provider selection is driven by `ECO_LLM_*` env vars.

### 5. `apps/api` — the backend

**Purpose:** exposes the scoring/coaching/summary contract over HTTP. Ships as both **Azure Functions** and a dependency-free **plain Node server** (the local runner).

- Local server (primary for dev): [`server.ts`](apps/api/src/server.ts). Azure Functions: [`functions/`](apps/api/src/functions). Shared logic: [`core/handlers.ts`](apps/api/src/core/handlers.ts), [`core/summary.ts`](apps/api/src/core/summary.ts).
- Storage + telemetry: [`lib/storage.ts`](apps/api/src/lib/storage.ts) (in-memory or Azure Table), [`lib/telemetry.ts`](apps/api/src/lib/telemetry.ts) (App Insights, lazy).
- Endpoints: `GET /api/health`, `POST /api/scorePrompt`, `POST /api/generateTip`, `POST /api/sessionSummary`.
- Run/test: `npm run api:start`, then `npx vitest run apps/api`.
- If you change this: keep the HTTP request/response shapes equal to the `shared-types` contracts — the widget calls these directly and falls back to the same engine locally.

### 6. `apps/desktop-widget` — the face

**Purpose:** the Electron overlay. A frameless, always-on-top window that renders the guardian + ecosystem on a `<canvas>`, shows scores/tips/metrics, and drives ingestion.

- Main process: [`main/index.ts`](apps/desktop-widget/src/main/index.ts), services [`apiClient.ts`](apps/desktop-widget/src/main/services/apiClient.ts) + [`ingestionBridge.ts`](apps/desktop-widget/src/main/services/ingestionBridge.ts). Preload bridge: [`preload/index.ts`](apps/desktop-widget/src/preload/index.ts). IPC + UI contracts: [`shared/contracts.ts`](apps/desktop-widget/src/shared/contracts.ts).
- Renderer (React): [`App.tsx`](apps/desktop-widget/src/renderer/src/App.tsx), state store [`store.ts`](apps/desktop-widget/src/renderer/src/store.ts), styles [`styles.css`](apps/desktop-widget/src/renderer/src/styles.css).
- Components: [`WorldRenderer.tsx`](apps/desktop-widget/src/renderer/src/components/WorldRenderer.tsx) (the procedural art), [`ScoreGauge.tsx`](apps/desktop-widget/src/renderer/src/components/ScoreGauge.tsx), [`Subscores.tsx`](apps/desktop-widget/src/renderer/src/components/Subscores.tsx), [`TipBubble.tsx`](apps/desktop-widget/src/renderer/src/components/TipBubble.tsx), [`History.tsx`](apps/desktop-widget/src/renderer/src/components/History.tsx), [`MetricsTab.tsx`](apps/desktop-widget/src/renderer/src/components/MetricsTab.tsx), [`Controls.tsx`](apps/desktop-widget/src/renderer/src/components/Controls.tsx).
- Run: `npm run widget:dev`. Typecheck: `npm run widget:typecheck`. Build: `npm run widget:build`.
- If you change this: the widget uses **electron-vite** (not the root `tsc --build`). Always run `npm run widget:typecheck` before pushing — its strict check is a separate CI gate from the package build.

### Ops: infra, docs, CI, demo

- [`infra/bicep/`](infra/bicep) — Storage + Table, App Insights, a Consumption Function App, optional Azure OpenAI.
- [`.github/workflows/ci.yml`](.github/workflows/ci.yml) — build, widget build, widget typecheck, test, lint, format check.
- [`scripts/demo.mjs`](scripts/demo.mjs) — the headless `npm run demo` arc.
- [`docs/`](docs) — [demo runbook](docs/demo-script.md) and [Azure deploy guide](docs/azure-deploy.md).

---

## Live Copilot interception (how it works)

VS Code writes the GitHub Copilot Chat stream to disk under your user storage:

```
%APPDATA%/Code/User/workspaceStorage/<hash>/GitHub.copilot-chat/
   transcripts/<id>.jsonl     # append-only event stream (prompts, responses, tool calls)
   chatSessions/<id>.json     # structured session snapshots
```

[`TranscriptTailAdapter`](packages/ingestion/src/adapters/TranscriptTailAdapter.ts) watches these files, [`copilotReader`](packages/ingestion/src/copilotReader.ts) + the parsers turn new entries into `PromptEvent`s, and each event is scored and coached in real time. The path is auto-detected ([`copilotPaths.ts`](packages/ingestion/src/copilotPaths.ts)) or overridden with `ECO_COPILOT_WORKSPACE_STORAGE`. Nothing is sent anywhere — parsing and scoring happen locally.

## Testing

- Tests live next to the code in `__tests__/` folders (and any `*.test.ts`). Vitest config: [`vitest.config.ts`](vitest.config.ts).
- Run everything: `npm test`. Run one package: `npx vitest run packages/<name>`. Watch: `npm run test:watch`.
- Internal packages are aliased to their **source** in the Vitest config, so you don't need to rebuild before testing.

## Continuous integration

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every push/PR to `main` and must stay green. Reproduce it locally before pushing:

```bash
npm run build
npm run widget:build
npm run widget:typecheck
npm test
npm run lint
npm run format:check
```

## Cloud deployment

Optional — the demo never requires it. See [`docs/azure-deploy.md`](docs/azure-deploy.md) for provisioning the Function App, Storage, and App Insights with the Bicep templates in [`infra/bicep/`](infra/bicep), wiring the LLM coach, and pointing the widget at the deployed API via `ECO_API_URL`.

## Troubleshooting

- **`node`/`npm` not found (Windows):** open a fresh terminal after installing Node, or ensure Node is on your `PATH`.
- **Electron fails to launch / `electron.exe` missing after install:** the Electron binary occasionally fails to unpack (notably Windows on ARM, or when antivirus/OneDrive locks files during `postinstall`). Re-extract it with:
  ```bash
  node node_modules/electron/install.js
  ```
  If that doesn't help, `npm rebuild electron` or reinstall: `npm install electron`.
- **OneDrive-synced checkout:** works, but pausing OneDrive sync during `npm install` avoids occasional file locks. `node_modules` is git-ignored and never synced to the repo.
- **Port 7071 in use:** set `ECO_API_PORT` (API) and `ECO_API_URL` (widget) to a free port.

---

## Status

**MVP vertical slice complete.** 4 packages + 2 apps build clean, 44 unit tests pass, the local API serves the full contract, the Electron widget renders the living world, and `npm run demo` reproduces the collapse-and-recovery arc. See the [design doc](EcoPrompt_Guardians_Master_Design_Doc.md) for the full strategy, scoring philosophy, UX state machine, telemetry schema, and rollout thesis.

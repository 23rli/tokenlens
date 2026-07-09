# Token Lens — Feature Reference

_Real-time **cost visibility** and **precognition** (forecasting) for GitHub Copilot token usage. Not a savings tool — it tells you what you're spending and what your next prompt will cost, before you send it._

Everything is **read-only** and **local**. Token Lens reads VS Code's on-disk Copilot chat logs; it never sends your prompts anywhere.

---

## 1. Scope model (how to read every number)

Tokentama scopes everything to **the workspace of the window you have open** — other VS Code windows' chats never bleed in. Within that, four scopes appear across the UI:

| Term | Meaning |
|---|---|
| **This prompt** | The single latest turn (one message). |
| **Context window** | What Copilot has loaded *right now*. This is the only thing that **resets** — it drops when Copilot auto-summarizes near the model's limit. |
| **This chat** | The current conversation, summed across its turns (cumulative). |
| **All chats** | Every conversation in this workspace, summed. |
| **Total cost** | Money across **all chats** in this workspace (never resets). |

The word "session" is intentionally **not** used in the UI because it was ambiguous.

---

## 2. Dashboard panels

Open with **Tokentama: Open dashboard** (or the activity-bar icon). Two tabs: **Dashboard** and **History**.

### Chat header
Shows the active chat's title (or `Chat <id>`) and the current turn number.

### Next (forecast) card
- **Last turn → Next turn (est.)** — the real input tokens the previous turn cost vs. the predicted cost of your next prompt, side by side.
- A one-line detail: `≈ N credits · range low–high tokens` (adds `low conf.` when uncertain).
- **Forecast accuracy** — median error of past predictions on your own turns (self-measured at runtime).
- A warning line when a summarization/reset is likely next.

### Context weight card
- Tokens currently carried, as a bar that fills and reddens toward the model's context limit (e.g. `12% of the 1.0M-token limit`).
- A band label: Light → Moderate → Heavy → Critical → Overloaded.
- A per-turn **bar graph** of context growth (downsampled for long chats) with a full-resolution trend line; resets show as drops. X-axis marks turn 1, reset count, and now.

### Where tokens go card
Input tokens split by category (**system / tools / history / message**) as stacked bars for **This prompt → This chat → All chats · N**, sharing one color legend. Data comes straight from Copilot's on-disk `promptTokenDetails`.

### Total cost card
Three measured figures for **all chats in this workspace** — **Tokens**, **AICs** (Copilot credits), and **Cost** — each with the last turn's delta (`▲`). Dollars are a derived estimate (see config below); tokens and AICs are what Copilot actually meters.

### Live Copilot data card
The active model/agent and its reasoning effort (shown only when known).

### History tab
A scrollable, newest-first list of every recorded turn: turn #, prompt excerpt, tokens, and the per-turn delta.

---

## 3. Forecasting engine (precognition)

- **Model-agnostic** and free (pure arithmetic) — works for any Copilot model.
- Rebuilds live from the active chat's **real metered tokens** on disk, so it appears immediately and doesn't depend on lagging capture.
- **Self-calibrating** prediction interval — tightens/loosens from the session's own actual-vs-predicted spread.
- **Reset prediction** — flags when the next turn is likely to trigger a summarization (at ~90% of the context/input window).
- **Tool-aware growth** — blends median turn growth with tool-call counts.
- **Runtime accuracy** — measures its own past predictions and reports the median error.

---

## 4. Data source & privacy

- Reads VS Code's per-workspace Copilot storage: transcript `.jsonl` files and `chatSessions` (for real metered tokens and credits).
- Scoped to this window's workspace hash by default; capture never picks up other windows.
- **Read-only.** No prompt text leaves your machine. Optional pilot telemetry is opt-in and export-only.

---

## 5. Commands (Command Palette → "Tokentama")

| Command | What it does |
|---|---|
| **Open Tokentama dashboard** | Reveal/focus the dashboard view. |
| **Toggle passive capture** | Start/stop reading Copilot sessions on disk. |
| **Show capture diagnostics** | Print what Tokentama can see (paths, sessions). |
| **Capture self-test** | Diagnose what is being read right now. |
| **Compact session (fresh chat + summary)** | Copy a lean recap of the current chat and open a new Copilot chat — drop re-sent history. |
| **Reset ecosystem** | Clear Tokentama's local state (confirmation required). |
| **Export pilot data (JSON + CSV)** | Export opt-in telemetry to a folder you pick. |
| **Set coaching LLM API key** | Store a provider key securely (legacy coaching). |

_Legacy commands still present pending the rebrand/cleanup: Score this prompt, Scan recent Copilot prompts, Run Tokentama demo, Ingest Copilot history into corpus, Export training corpus._

---

## 6. Key settings (`tokentama.*`)

| Setting | Default | Purpose |
|---|---|---|
| `impact.usdPerMillionTokens` | `0.58` | **Preferred cost basis** — blended, cache-inclusive $/1M tokens. Set to your real effective rate for an accurate figure. `0` falls back to the credit rate. |
| `impact.usdPerCredit` | `0` | $/AIC, used only when the token rate is `0`. |
| `capture.mode` | `hybrid` | `hybrid` (recommended), `event`, or `disk`. |
| `capture.scope` | this window | `all` to track the newest Copilot session in any window. |
| `passiveCapture.enabled` | `true` | Read Copilot sessions automatically (read-only). |

_Legacy/experimental settings still present: `coaching.*`, `sustainability.*`, `impact.co2GramsPer1kTokens`, `impact.waterMlPer1kTokens`, `health.*`. These belong to the deprecated scoring/pet system and are slated for cleanup._

---

## 7. Removed / deprecated

Token Lens began as a prompt-efficiency **scoring + tamagotchi** tool, then pivoted to
pure cost visibility + forecasting. As of the v0.5.0 cleanup, the legacy subsystems are
**fully removed** from the codebase: the prompt scoring service, the rewriter, the
training corpus, the LLM/heuristic coach (except one text helper reused by the compact
command), telemetry, the pet health/world model, and ~11 unused webview components. The
state contract (`TamaState`) is now just `{ metrics, model, captureEnabled, forecast }`,
and the dashboard is driven entirely by the on-disk forecast.

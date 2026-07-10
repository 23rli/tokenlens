# Token Lens — Feature Reference

_Real-time **cost visibility** and **precognition** (forecasting) for GitHub Copilot token usage. Not a savings tool — it tells you what you're spending and what your next prompt will cost, before you send it._

Everything is **read-only** and **local**. Token Lens reads VS Code's on-disk Copilot chat logs; it never sends your prompts anywhere.

---

## 1. Scope model (how to read every number)

By default, a folder window is scoped to **that folder's VS Code workspace storage**. The optional `all` scope deliberately aggregates every window, while an empty window can only approximate isolation from chats touched after it opened. Within that, four scopes appear across the UI:

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

Open with **Token Lens: Open dashboard** (or the activity-bar icon). Three tabs: **Dashboard**, **History**, and **Info**.

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
Three figures — **Tokens**, **AICs** (Copilot credits), and **Cost** — selectable for the workspace, this chat, or today. Each shows the last metered turn's matching-unit delta (`▲`). Dollars are a derived estimate (see config below); AIC totals are marked estimated if any turn lacks a metered credit value.

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
- Scoped to this window's workspace hash by default. `capture.scope=all` deliberately aggregates all windows; empty windows have the limitations documented in `KNOWN-ISSUES.md`.
- **Read-only.** No prompt text leaves your machine, and there is no telemetry or network upload.

---

## 5. Commands (Command Palette → "Token Lens")

| Command | What it does |
|---|---|
| **Open dashboard** | Reveal/focus the dashboard view. |
| **Toggle passive capture** | Start/stop reading Copilot sessions on disk. |
| **Pin to this chat** | Lock tracking onto the current chat so Token Lens keeps showing it even if a newer chat appears (useful when two windows share a folder). |
| **Unpin chat** | Clear the pin and follow the newest chat again. |
| **Show capture diagnostics** | Print scope, active-chat, and watcher details to Output → Token Lens. |
| **Capture self-test** | Verify that the active chat can be parsed and report how many turns are metered. |

---

## 6. Key settings (`tokenlens.*`)

| Setting | Default | Purpose |
|---|---|---|
| `impact.usdPerMillionTokens` | `0.58` | **Preferred cost basis** — blended, cache-inclusive $/1M tokens. Set to your real effective rate for an accurate figure. `0` falls back to the credit rate. |
| `impact.usdPerCredit` | `0` | $/AIC, used only when the token rate is `0`. |
| `capture.scope` | `window` | `window` keeps each window isolated; `all` follows the newest Copilot chat in any window. |
| `passiveCapture.enabled` | `true` | Read Copilot sessions automatically (read-only). When off, only explicit diagnostics/self-test commands read on demand. |

---

## 7. Removed / deprecated

Token Lens began as a prompt-efficiency **scoring + tamagotchi** tool, then pivoted to
pure cost visibility + forecasting. As of the v0.5.0 cleanup, the legacy subsystems are
**fully removed** from the codebase: the prompt scoring service, the rewriter, the
training corpus, the live LLM/heuristic coach, telemetry, the pet health/world model, and
~11 unused webview components. A rewrite helper remains only for reproducible historical
benchmarks. The
state contract (`TamaState`) is now just `{ metrics, model, captureEnabled, forecast }`,
and the dashboard is driven entirely by the on-disk forecast.

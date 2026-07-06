# 🐣 Tokentama

> A friendly VS Code sidebar buddy that helps you **spend fewer tokens on AI coding** — by fixing your prompts for you, in your own style, before you send them. It shows what each prompt really costs (tokens, Copilot credits, optionally dollars) and keeps a little pet whose world thrives when you prompt well and wilts when you waste tokens.

---

## 🌟 In one minute

Every time you chat with an AI coding assistant (like GitHub Copilot), your words become **tokens** — and tokens cost **money** (metered as Copilot **AI credits**), burn **energy**, and even use **water** to cool the data centres.

**Tokentama's job is to lower that bill without you having to think about it.** Draft a prompt in its sidebar, and it:

- ✍️ **Rewrites it in your style** using *your own Copilot model* — a clearer, self-contained prompt that lands the right result on the first try, so you stop paying for retries and rambling.
- 🔢 **Scores each prompt 0–100** for efficiency and shows exactly what wasted the tokens (duplication, vagueness, verbosity).
- 💠 **Makes the cost visible** in tokens, Copilot AI credits (AICs), and — if you opt in — dollars, with the wasted share called out.
- 🐣 **Keeps a Clippy-style pet** whose little world greens up when you prompt leanly and dries out when you don't — a gentle nudge to build the habit.

The goal is for token-efficient prompting to become **second nature** — because Tokentama fixes the prompt for you instead of asking you to learn.

---

## 🧭 What you see (a tour of the dashboard)

The dashboard is a single, no-scroll panel. Here's each piece — what it means for *you*, and (for the curious) exactly how it works.

### ✍️ Compose & rewrite — the heart of Tokentama

**Draft your prompt in the Compose box** and it's scored live as you type (offline, instant, zero tokens). One tap on **✨ Rewrite in my style** hands it to **your own Copilot model** (no API key) and returns a **fixed, self-contained prompt** — clear target, explicit output, every detail you gave preserved, filler gone — that's more likely to land the right result on the *first* try. **Use rewrite** copies it straight into Copilot; **Copy as-is** sends your original.

<details>
<summary><b>Under the hood — the rewriter</b></summary>

- **Your Copilot model, no key.** Rewrites use VS Code's Language Model API (`vscode.lm`) with your own Copilot entitlement. The first use asks your permission; if the model is unavailable it falls back to a deterministic offline cleanup. Every attempt is logged to the **Tokentama** output channel, and the rewrite card labels its source — *your Copilot model* or *offline* — so you can see it working.
- **In your style.** Rewrites are few-shot-conditioned on your own past prompt→rewrite pairs (a local corpus) plus a compact personal profile, so they sound like you.
- **Honest about savings.** The rewrite's job is to *fix* the ask — it may be shorter, the same, or longer. Token savings are only claimed when it's genuinely shorter; otherwise it's shown as a sharper first-try prompt. It never invents file names, APIs, or requirements you didn't give.
- **Modes:** `off` · `offline` (zero-token cleanup) · `auto` (your Copilot model, default) · `llm` (an external provider). See `tokentama.rewriter.*`.
</details>

### 🪴 Your pet & its world

Meet your pet: a little Clippy who lives in a tiny ecosystem. The **scene reacts to your prompting habits** — clean prompts keep the world green and the lake full; wasteful ones cause a drought. It's a pet that's only as healthy as the way you talk to your AI.

<details>
<summary><b>Under the hood — the six world states</b></summary>

Your pet's world has six states, driven by a smoothed health value (an exponential moving average of your recent scores, so one bad prompt won't instantly tank it):

| Score band | World state | Vibe |
| --- | --- | --- |
| 80–100 | **Thriving** | Bright sky, full lake, Clippy sprinting |
| 60–79 | **Healthy** | Green and steady |
| 40–59 | **Concerned** | Lake shrinking, colours fading |
| 20–39 | **Critical** | Brown, sun sinking |
| 1–19 | **Collapse** | Clippy has fallen over |
| 0 | **Dormant** | A dark, dystopian, waterless world |

The whole landscape is driven by a single `--fill` value (0–1) derived from the score: the lake recedes to reveal a cracked riverbed, greenery withers, the sun reddens and sinks, and the sky bands shift — a drought you cause, not just a progress bar. The art is rendered as **pixel-art** (banded skies, a blocky sun, a pixel mesh) using sprite art from the open-source [vscode-pets](https://github.com/tonybaloney/vscode-pets) project.
</details>

### 🔢 The TokenScore

A single **0–100 score for how efficient your prompt was.** Higher is leaner. It's based on the four habits that waste the most tokens:

- **Duplicate** — repeating context you already gave, or re-sending the same request.
- **Vague** — no clear task, target, or output format (which forces clarifying back-and-forth).
- **Verbose** — padding, politeness filler, and "give me everything" asks.
- **Ignored coaching** — you were given a tip last time and didn't take it.

<details>
<summary><b>Under the hood — the scoring formula</b></summary>

`overallScore = 100 − wasteScore`, where `wasteScore` is a weighted sum of independent detectors (each producing a 0–1 severity), clamped to 0–100:

| Factor | Detector(s) | Weight |
| --- | --- | --- |
| Duplicate | `redundantContext` (0.30) + `retryLoop` (0.25) | **0.55** |
| Vague | `vagueness` | 0.20 |
| Verbose | `verbosityMismatch` | 0.15 |
| Ignored coaching | `ignoredCoaching` | 0.10 |
| _(Tool overuse)_ | `toolOveruse` | 0 — excluded from the headline score |

Design choices that make the score **stable and trustworthy**:
- **Deterministic & prompt-intrinsic.** The same prompt always scores the same. Verbosity is detected from the prompt's *own* padding (not the AI's response length, which varies run to run).
- **No threshold cliffs.** Penalties ramp smoothly, so two near-identical prompts get near-identical scores.
- **Transparent.** Each factor names *what* triggered it (e.g. "Underspecified: no output format, no task verb"), shown right under the quality bars.

Five internal sub-dimensions (`promptQuality`, `contextEfficiency`, `toolEfficiency`, `outputEfficiency`, `learningAdoption`) are still computed and available in the data model for deeper analysis.
</details>

### 💰 Real impact — tokens, credits, and (optionally) dollars

Three tiles show what your session actually spent: **tokens**, **Copilot AI credits (AICs)** — the unit Copilot really meters — and, if you opt in, an estimated **dollar** cost. Beneath each, the share that was **wasted** (caused by inefficiency) is called out, tied directly to your TokenScore. Environmental impact (CO₂ / water) remains available for the sustainability-minded.

<details>
<summary><b>Under the hood — why AICs, and where the numbers come from</b></summary>

- **Tokens & AICs are the measured units.** Copilot bills in AI credits, so we read the **real per-model prices** from its `models.json` (`token_prices.default`), not a generic estimate. Token counts are read from your on-disk chat sessions when metered, or estimated with a tokenizer otherwise (a badge tells you which).
- **Dollars are optional and never guessed.** A `$` figure only appears if you set `tokentama.impact.usdPerCredit` to your org's internal $/AIC rate; otherwise Tokentama shows tokens + AICs and hides `$`, keeping the headline honest.
- **Wasted portion:** `Σ (tokens × wasteScore%)` per prompt → so the "wasted" figure is tied directly to your score.
- **Environmental estimates** (CO₂ `0.11 g` and water `2 mL` per 1,000 tokens) are configurable under `tokentama.impact.*` / `tokentama.sustainability.*`, following published per-token estimates (UC Riverside · Lawrence Berkeley National Lab · *"How Hungry is AI?"*, arXiv 2025).
</details>

### 🎯 How it saves tokens — without making Copilot worse

The guiding rule: **never sacrifice coding capability for tokens.** A tool that makes Copilot noticeably worse won't get used — and a lossy shortcut backfires, because a wrong answer just makes you re-ask (which re-sends everything again). So Tokentama sorts its savings levers by **capability risk** and leads with the ones that cost you nothing:

| Lever | Capability risk | What it does |
| --- | --- | --- |
| **Retry-avoidance** | none (helps) | Clearer prompts land the right answer first try — fewer wrong answers, not more. |
| **Tool-trim** | none | Flags *unused* tool definitions/MCP servers to disable — they're re-sent every turn. |
| **Right-sizing** | low, reversible | Suggests a lighter model/effort for trivial/moderate tasks — "escalate if it falls short." Drops **no** context. |
| **Compaction** | higher (opt-in) | Reclaims re-sent history — the biggest raw lever, but the risky one. Only offered with a working-set recap (files by reference), a preview, and a retry-rate guardrail. |

Measured on real Copilot sessions (see `npm run bench:history`), the **capability-safe levers alone recover ~30–40% of billed AICs with no context dropped**, while complex turns keep the full model and context untouched. Compaction is a larger raw lever but is deliberately opt-in and guarded so it can never quietly degrade your results. Prompt-text *compression* turns out to be a rounding error on real sessions — the tokens are in the re-sent context and the model choice, not your wording.

<details>
<summary><b>Under the hood — how we know</b></summary>

`scripts/bench-history.ts` reads your actual Copilot sessions from disk and computes an **opportunity stack in real billed AICs**: retry-avoidance, right-sizing (only trivial/moderate turns, counted by a difficulty classifier), tool-trim (from `promptTokenDetails`), and compaction (an upper bound). It splits each turn's billed credit into output (not cached) vs input (mostly a cached prefix) so the numbers reflect real billing, and it reports the **task mix** so you can see exactly how many turns are left fully untouched. Everything stays local.
</details>

### 📊 Live Copilot data

Proof that this isn't guesswork — a compact strip shows the **actual data we read from your Copilot session**: which **AI model/agent** you're using and its **reasoning level**, the **tokens this prompt** used, and your **running session totals**. A badge tells you whether those token counts are **real** (metered, read from disk) or **estimated**.

<details>
<summary><b>Under the hood — where this comes from</b></summary>

- **Agent / reasoning / context window** come from Copilot's model catalog (`models.json`): the model name, picker category (e.g. *powerful*), supported reasoning efforts (e.g. *low–max*), and max context window.
- **This prompt** shows input/output tokens and **Copilot credits** when they've been metered to disk in the chat session's patch log.
- **Session** sums tokens, credits, and cost across everything scored this session.
- The **real / estimated** badge reflects whether counts were read from Copilot's on-disk session data or estimated with a tokenizer.
</details>

### 🧑‍🏫 Coaching & insights

Alongside the rewrite, Tokentama surfaces **just-in-time nudges** — a one-line tip, a retry-risk warning, or a hint to name the file/function you mean — and, in an expandable **insights** section, shows **where your tokens go** (system vs. tools vs. your message), your **net savings** from adopting rewrites, model **right-sizing** advice, and a strip of your **recent prompts** so nothing scrolls out of view.

<details>
<summary><b>Under the hood — offline by default, your Copilot model on request</b></summary>

- **Heuristic coach (default, offline, no network):** deterministically cleans the prompt — de-duplicates sentences, strips politeness/retry filler — and names the concrete issue it found (Target / Output / Limit / Context).
- **Model rewrite (on request):** the **Rewrite in my style** action uses your own Copilot model via VS Code's Language Model API, falling back to the offline cleanup on any error so it never breaks. An external provider can be configured under `tokentama.coaching.*` if you prefer.
</details>

---

## 🎬 See every state — the demo

Run **Tokentama: Run Tokentama demo** from the Command Palette to watch a scripted story play out: seven prompts, from a pristine one-liner down to a catastrophic re-paste-and-retry mess, then a clean recovery — so you can see Clippy move through **every** world state in about ten seconds.

<details>
<summary><b>Under the hood</b></summary>

Each demo step is **really scored** (so the quality bars, reasons, coaching, and impact are genuine), while the headline score is scripted and the pet's health is forced to that value — guaranteeing every state is shown clearly regardless of smoothing.
</details>

---

## 🎣 How it reads your prompts

There are a few ways to get a prompt scored (and rewritten) — pick whatever fits your flow:

1. **Draft in the Compose box** — score it live as you type and rewrite it in your style before you send it (the main flow).
2. **Type `@tokentama`** in Copilot Chat followed by your prompt — instant, explicit scoring.
3. **Click "Score a prompt"** (or run the command) and paste/select any text.
4. **Let it watch passively** — it quietly reads your Copilot chat sessions and scores them as you go (read-only; it never changes anything).

<details>
<summary><b>Under the hood — capture details & privacy</b></summary>

- **Chat participant:** `@tokentama` is a registered VS Code chat participant.
- **Manual:** the **Score this prompt** command scores editor text or pasted input.
- **Passive watcher:** reads VS Code's Copilot chat transcripts on disk (`…/workspaceStorage/<hash>/GitHub.copilot-chat/…`). It is **read-only** and best-effort (the on-disk format is undocumented). By default it tracks **every** Copilot chat across your windows (`tokentama.capture.scope: all`) so it just works as one app; set it to `window` to scope to the current workspace only. Use **Scan recent Copilot prompts** to score the last few on demand, and **Capture self-test** to see exactly what it's reading.

Everything stays **on your machine**. Nothing is sent anywhere unless you explicitly turn on an LLM coaching provider.
</details>

---

## 🚀 Install & try it

> Not yet on the Marketplace — run it from source or build a local package.

```powershell
npm install
npm run build     # bundles the host + webview with esbuild
# Press F5 in VS Code to launch the Extension Development Host
```

Then open the **Tokentama** view from the Activity Bar and click **▶ Demo**, or run **Tokentama: Score this prompt** and paste a long, rambling prompt to watch the pet react.

To install into your everyday VS Code, build a package and install the `.vsix`:

```powershell
npm run vsce:package          # produces tokentama-<version>.vsix
# then: Extensions view → "…" menu → Install from VSIX…
```

### Commands

Open the Command Palette (`Ctrl/Cmd+Shift+P`) and search **Tokentama**:

| Command | What it does |
| --- | --- |
| **Score this prompt** | Score pasted/selected text on demand |
| **Open Tokentama dashboard** | Reveal the sidebar dashboard |
| **Toggle passive capture** | Turn automatic Copilot watching on/off |
| **Reset ecosystem** | Start the pet's world fresh (asks to confirm) |
| **Scan recent Copilot prompts** | Score your last few real Copilot prompts now |
| **Show capture diagnostics** | See what the passive watcher is reading |
| **Capture self-test (what is it reading?)** | Verify capture end-to-end and print what it found |
| **Run Tokentama demo** | Play the all-states demo |
| **Set coaching LLM API key** | Store an external LLM key securely (SecretStorage) |
| **Export pilot data (JSON + CSV)** | Export local pilot metrics for a study |
| **Ingest Copilot history into corpus** | Seed your rewrite corpus from past chats |
| **Export training corpus (JSONL)** | Export your local prompt→rewrite pairs |
| **Compact session (fresh chat + summary)** | Start a fresh chat with a compact summary to cut context |

### Settings

| Setting | Default | What it does |
| --- | --- | --- |
| `tokentama.rewriter.mode` | `auto` | How **Rewrite in my style** works: `off` · `offline` (zero-token cleanup) · `auto` (your Copilot model) · `llm` (external provider) |
| `tokentama.rewriter.model` | `""` | Model/deployment for `llm`-mode rewrites (empty = use the coaching model) |
| `tokentama.rewriter.fewShotK` | `3` | How many similar past rewrites from your corpus to use as style examples |
| `tokentama.capture.scope` | `all` | `all` = track every Copilot chat across windows; `window` = current workspace only |
| `tokentama.capture.mode` | `hybrid` | `hybrid` (live + on-disk reconciliation) · `event` · `disk` |
| `tokentama.impact.usdPerCredit` | `0` | Your org's $ per Copilot AI credit. `0` hides `$` and shows tokens + AICs |
| `tokentama.coaching.llmProvider` | `none` | `none` = offline heuristic; `openai` / `azure-openai` = external LLM for tips |
| `tokentama.coaching.endpoint` | `""` | External LLM endpoint URL |
| `tokentama.coaching.model` | `gpt-4o-mini` | External model / deployment name |
| `tokentama.corpus.enabled` | `true` | Record prompt→rewrite pairs to a **local** corpus (used to personalize rewrites) |
| `tokentama.corpus.storeRawText` | `true` | Store raw text in the local corpus (off = hashes only) |
| `tokentama.impact.co2GramsPer1kTokens` | `0.11` | Grams of CO₂ per 1,000 tokens (headline impact) |
| `tokentama.impact.waterMlPer1kTokens` | `2` | Millilitres of water per 1,000 tokens (headline impact) |
| `tokentama.sustainability.whPerThousandTokens` | `0.4` | Watt-hours per 1,000 tokens (energy-saved estimate) |
| `tokentama.sustainability.gridGramsCo2PerKwh` | `400` | Grid carbon intensity (gCO₂e/kWh) |
| `tokentama.telemetry.enabled` | `false` | Collect local, anonymized pilot telemetry (nothing leaves your machine) |

> Health tuning (`tokentama.health.*`) and the legacy `tokentama.passiveCapture.enabled` toggle are also available for fine-tuning; see the Settings UI (search “Tokentama”).

### 🔒 Privacy in one line

Your prompts, scores, and history are stored **locally** in extension storage; passive capture is **read-only**; **nothing leaves your machine** except when you ask for a rewrite (which uses your own Copilot model through VS Code) or configure an external LLM provider.

---

## 🛠️ Under the hood (for contributors)

<details>
<summary><b>Project layout</b></summary>

```
src/                         # extension host (Node)
├─ extension.ts              # activation: view, status bar, commands, watcher, @tokentama, LM rewrite
├─ capture/                  # Copilot session reader + multi-session file watcher + parsers
├─ core/scoreService.ts      # score → coach → persist pipeline (+ compose scoring, corpus ingest, demo)
├─ rewriter/                 # RewriteService + corpus retrieval (few-shot, style-matched rewrites)
├─ analysis/                 # context breakdown, retry-risk, outcomes, right-sizing, portfolio
├─ scoring/                  # waste detectors, subscores, pet-state machine, token/credit model
├─ coaching/                 # heuristic + optional LLM coach (leanRewrite, tips)
├─ data/corpusStore.ts       # on-device prompt→rewrite corpus
├─ metrics/                  # metrics.ts (session aggregation) + impact.ts (CO₂/water footprint)
├─ state/tamaStore.ts        # persisted pet state (globalState), smoothed health, recent events
├─ status/                   # status-bar indicator
├─ types/                    # shared domain contracts
└─ webview/                  # webview provider + HTML/CSP + host↔webview message contract

webview-ui/src/              # Preact dashboard
└─ components/               # PetStage, ScoreHeader, RecentStrip, ComposeBox, ImpactTrio,
                             # ContextPanel, OutcomesPanel, RightSizePanel, CoachingPanel, LiveData
```
</details>

<details>
<summary><b>Build, test & package scripts</b></summary>

| Script | Purpose |
| --- | --- |
| `npm run build` | Bundle the extension host + webview (esbuild) |
| `npm run watch` | Rebuild on change |
| `npm run typecheck` | `tsc --noEmit` across host + webview |
| `npm test` | Run the scoring / ingestion / coaching unit tests (Vitest) |
| `npm run vsce:package` | Produce an installable `.vsix` |

The scoring engine, coaching, and metrics are **pure TypeScript** with no VS Code dependency, so they're unit-tested directly.
</details>

## License

MIT — see [LICENSE](LICENSE). Pet sprite art is from the open-source [vscode-pets](https://github.com/tonybaloney/vscode-pets) project (MIT).

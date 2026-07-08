# Token Lens — Portability to Other IDEs

_How hard is it to ship Token Lens beyond VS Code (Visual Studio, JetBrains, etc.)?_

## TL;DR

The **math and the UI are portable; the data source is not.** Token Lens works by reading GitHub Copilot's **VS Code-specific on-disk chat logs** (`workspaceStorage/<hash>/GitHub.copilot-chat/transcripts/*.jsonl` + `chatSessions/`), which carry the per-turn `promptTokenDetails` (real metered tokens, credits, and the system/tools/history/message breakdown). No other IDE stores that same data in that same place — so every non-VS-Code target needs a new data layer, and some may not expose per-turn token detail at all.

| Target | Difficulty | Main blocker |
|---|---|---|
| VS Code forks (Cursor, Windsurf, VSCodium) | **Trivial** | None — same extension API + same Copilot logs. Mostly runs as-is. |
| Visual Studio (not Code) | **Hard** | Different extension model (C#/.NET), and no known on-disk equivalent of the per-turn token breakdown. |
| JetBrains (IntelliJ, Rider, …) | **Hard** | Kotlin/Java plugin SDK + JCEF UI, and the Copilot plugin's log format differs / may lack per-turn token data. |
| Neovim / CLI Copilot | **Medium–Hard** | Different log format; depends what the Copilot LSP exposes. |

## What's portable vs. what isn't

**Portable (most of the value):**
- **Core engine** — the forecaster, context-breakdown aggregation, cost math, and scope model are pure TypeScript with no VS Code API dependency beyond reading files. Extract these into a small platform-agnostic library and reuse (JS runtimes) or port (C#/Kotlin).
- **The UI** — the Preact dashboard is plain HTML/CSS/JS. It can run in any embedded browser host: VS's **WebView2**, JetBrains' **JCEF**. Only the message bridge (`acquireVsCodeApi`) needs swapping for the host's equivalent.

**Not portable (the hard part):**
- **The data source.** Reading VS Code Copilot's private on-disk logs is VS-Code-only. Each other IDE stores Copilot data differently:
  - *Visual Studio*: Copilot is a separate VSIX; usage/telemetry lives under `%LOCALAPPDATA%\Microsoft\VisualStudio\…` in a different shape, with no documented per-turn `promptTokenDetails`.
  - *JetBrains*: logs live under the JetBrains config dir in a different format; per-turn token detail may not be surfaced.
- **The extension host.** VS Code (Node/TS + webview), Visual Studio (C#/.NET, MEF/`VisualStudio.Extensibility`, WPF/WebView2), and JetBrains (Kotlin/Java + Swing/Compose/JCEF) share **no** extension package format. The host shell is a rewrite per platform.

## Effort by target

- **VS Code forks:** near-zero. Ship the same VSIX; verify the Copilot log path exists.
- **Visual Studio:** a per-IDE project. Reuse the UI (WebView2) + port the core engine to C#, but the gating question is **where the token data comes from** — it likely isn't on disk in the VS-Code shape. Realistically weeks, blocked on the data-source question.
- **JetBrains:** similar to VS — Kotlin plugin + JCEF UI + a new parser, gated on whether the JetBrains Copilot plugin exposes per-turn token/context data.

## The strategic unlock

The cleanest route to multi-IDE is to **stop scraping VS Code's private logs** and instead source usage from something **cross-IDE and stable**:
- the **Copilot Language Server** (shared by several IDE integrations), or
- a **GitHub Copilot usage/metering API**.

If token/context data can come from the LSP or a GitHub API, the data layer unifies, and the remaining work is just "port the engine + reuse the UI" per host. Until then, each IDE needs a bespoke log parser, and VS/JetBrains may not expose the per-turn detail Token Lens depends on.

**Bottom line:** the UI and the analytics travel well; the risk is entirely in the per-IDE Copilot data access. De-risk by proving a shared data source (Copilot LSP or GitHub usage API) before committing to a Visual Studio or JetBrains port.

## “But Visual Studio HAS Copilot — why doesn’t this just work?”

Right — Copilot is in Visual Studio. The catch is that Token Lens doesn’t read Copilot
itself; it reads a **specific on-disk artifact that only VS Code’s Copilot writes**: the
`chatSessions` / transcript JSON with per-turn `promptTokenDetails`. Visual Studio’s
Copilot is a **different implementation** that:

- does **not** write those VS Code files,
- stores its chat/telemetry elsewhere, in a different (undocumented) format, and
- may not persist a per-turn token/context breakdown to disk **at all**.

So the blocker isn’t “Copilot is missing” — it’s “the exact data file we parse is VS-Code-only.”

### How to unlock it (best → fastest)

1. **Copilot Language Server (LSP).** Copilot’s core runs as a language server that
   multiple IDEs embed. If it emits (or can be queried for) token/usage events, a thin
   adapter becomes a **cross-IDE** data source — the real long-term foundation. Needs
   reverse-engineering or a partnership; not a public usage API today.
2. **GitHub Copilot usage/metering API.** GitHub exposes org/user Copilot usage, but
   it’s **aggregate (daily)**, not live per-turn — good for a billing dashboard, not for
   live next-turn forecasting.
3. **Find VS’s own on-disk logs.** Inspect `%LOCALAPPDATA%\Microsoft\VisualStudio\<ver>\`,
   the Copilot VS extension’s storage, and activity/temp logs for any per-turn token
   records. If they exist, write a VS-specific parser. Fastest to prototype; fragile;
   the data may simply not be there.
4. **Local proxy.** Intercept Copilot’s API calls via a local proxy the IDE trusts and
   read token counts from responses. Cross-IDE, but invasive and brittle.

**Recommendation:** prototype (3) to learn whether the per-turn data even exists on disk
in VS; in parallel evaluate (1), the LSP, as the durable cross-IDE source. Everything
else (engine + UI) is ready to reuse the moment a data source lands.

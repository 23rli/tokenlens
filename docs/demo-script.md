# EcoPrompt Guardians — Demo Script (60–90s)

A reliable, repeatable walkthrough that shows the pet ecosystem reacting to **prompt
waste** (not length), with live coaching and a recovery arc.

## Prerequisites

```powershell
# From the repo root. Node 20+ required.
npm install
npm run build
```

> On Windows ARM64, if Electron's binary did not download during install, see
> [Troubleshooting](#troubleshooting).

## Option A — Full desktop experience (recommended)

Two terminals:

```powershell
# Terminal 1 — canonical scoring API (local Node server, in-memory store)
npm run api:start

# Terminal 2 — the desktop companion
npm run widget:dev
```

A small always-on-top window docks to the bottom-right. The status dot reads
**API · memory** when the server is reachable, or **Local** when it falls back to
the in-process scoring engine.

### The beats (use the **Demo** mode, click **▶ Next** to pace each one)

| #   | Step              | What the audience sees                                                   |
| --- | ----------------- | ------------------------------------------------------------------------ |
| 1   | Healthy start     | Crisp, bounded prompt → score ~85, world **thriving** 🌳                 |
| 2   | Still efficient   | Clear task + explicit output → stays green                               |
| 3   | First slip        | "make it better" → vagueness flagged, score dips, tip appears            |
| 4   | Redundant context | Re-pasted context → redundancy waste, plants thin out                    |
| 5   | Retry loop        | Near-duplicate retry + failed tools → score falls, world **critical** 🥀 |
| 6   | Collapse          | Stacked waste + tool storm → **collapse/dead** 🔥💀                      |
| 7   | Adopt the rewrite | Click **Accept rewrite** → next turn adopts it, score jumps, recovery    |
| 8   | Sustained habit   | Good prompt → back to **thriving** 🌳                                    |

Talking points:

- "The score measures **avoidable waste** — redundant context, vagueness, retry loops,
  tool overuse, verbosity mismatch, ignored coaching — each transparently weighted."
- "Health is a smoothed moving average, so the world reacts dramatically but not jitterily."
- Open the **Metrics** tab: prompts, tokens in/out (estimated), **cost at real model
  prices**, retries, tool calls, and directional **tokens saved**.

### Live interception (headline)

Switch to **Live Copilot** mode. If a VS Code Copilot Chat session exists on disk,
the widget tails it and scores **new turns automatically** as you chat in VS Code.
If none is found, the button is disabled and we fall back to Demo/Manual.

### Manual mode

Switch to **Manual**, paste any prompt, and press **Score** (or Ctrl+Enter). Accepting
a rewrite re-scores the improved prompt immediately.

## Option B — Headless arc (no GUI, great for a quick screen share)

```powershell
npm run demo
```

Prints the full thriving → collapse → recovery arc with per-step scores, deltas,
pet state, and the coaching tip.

## Resilience notes (so nothing breaks on stage)

- **API down?** The widget transparently scores locally — the demo still runs.
- **No LLM configured?** Coaching uses the deterministic heuristic coach (tip + rewrite).
  Configure an LLM by setting `ECO_LLM_*` env vars (see `.env.example`) for the API.
- **No Copilot session?** Use Demo or Manual mode.
- Estimated tokens/cost are **directional, aligned to real model prices** — not metered
  billing figures (we intentionally avoid overclaiming precision).

## Troubleshooting

**Electron binary missing (Windows ARM64).** If `npm run widget:dev` fails to launch:

```powershell
# The zip is usually already cached under %LOCALAPPDATA%\electron\Cache\<hash>\
$zip = Get-ChildItem "$env:LOCALAPPDATA\electron\Cache" -Recurse -Filter *.zip | Select-Object -First 1
$dist = 'node_modules/electron/dist'
Remove-Item $dist -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $dist | Out-Null
Expand-Archive -Path $zip.FullName -DestinationPath $dist -Force
'electron.exe' | Set-Content -NoNewline -Path 'node_modules/electron/path.txt'
```

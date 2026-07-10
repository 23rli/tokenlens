/**
 * The Info tab — a plain-language guide that holds more than the hover tooltips can.
 * Explains what each dashboard card shows and the handful of real levers that move
 * a Copilot bill, so testers can self-serve instead of guessing.
 */
export function InfoPanel() {
  return (
    <div class="info">
      <section class="card info-card">
        <span class="section-title" role="heading" aria-level={2}>What Token Lens shows</span>
        <p class="info-lead">
          A live meter for your GitHub Copilot token usage — read-only and fully local.
          It reads the real metered tokens Copilot writes to disk, shows where they go,
          and forecasts what your next turn will cost before you send it.
        </p>
      </section>

      <section class="card info-card">
        <span class="section-title" role="heading" aria-level={2}>Why agentic coding costs tokens</span>
        <p>
          Every turn re-sends the whole conversation — your messages, the model's replies,
          tool definitions, and any attached files — so the cost is <b>structural</b>, not a
          matter of "prompting better." The bill grows with the size of the context you carry,
          the number of tool round-trips, and the model tier you pick.
        </p>
      </section>

      <section class="card info-card">
        <span class="section-title" role="heading" aria-level={2}>Reading each card</span>
        <ul class="info-list">
          <li>
            <b>Next</b> — the real tokens your last metered turn cost vs. the predicted cost of
            your next one. Driven by re-sent history and tool calls, not your message length.
          </li>
          <li>
            <b>Context weight</b> — how much context this chat carries right now. Each turn
            re-sends all of it, so cost climbs as the bar fills; it drops when Copilot
            auto-summarizes near the model's limit.
          </li>
          <li>
            <b>Where tokens go</b> — the input split into <b>system · tools · history · message</b>{' '}
            for this prompt, this chat, and all chats. History usually dominates in long chats.
          </li>
          <li>
            <b>Total cost</b> — tokens and Copilot credits (AICs) for the workspace, this chat,
            or today. Dollars are a derived estimate from your configured rate.
          </li>
          <li>
            <b>Live Copilot data</b> — the model and reasoning effort in use. Premium models and
            higher reasoning effort can increase the overall turn cost.
          </li>
        </ul>
      </section>

      <section class="card info-card">
        <span class="section-title" role="heading" aria-level={2}>Levers that actually move the bill</span>
        <ul class="info-list">
          <li>
            <b>Start a fresh chat for a new task.</b> The single biggest lever — it drops the
            re-sent history back to near zero.
          </li>
          <li>
            <b>Match the model to the task.</b> A lighter model for routine edits costs far less
            per token than a premium one.
          </li>
          <li>
            <b>Trim what you carry.</b> Turn off tools you don't need and avoid attaching large
            files you won't reference — both inflate every turn.
          </li>
          <li>
            <b>Keep chats focused.</b> Shorter, on-topic chats stay cheaper than one long
            sprawling thread.
          </li>
        </ul>
      </section>

      <section class="card info-card">
        <span class="section-title" role="heading" aria-level={2}>Tips &amp; scoping</span>
        <ul class="info-list">
          <li>Hover or keyboard-focus any dotted card title for a one-line reminder.</li>
          <li>
            Token Lens tracks the chat in <b>this window's workspace</b>. If two windows share a
            folder, run <b>Token Lens: Pin to this chat</b> to lock onto the one you're watching.
          </li>
          <li>
            Everything is read-only — no prompt text ever leaves your machine. Capture off stops
            automatic reads; diagnostics/self-test still read only when you run them.
          </li>
        </ul>
      </section>
    </div>
  );
}

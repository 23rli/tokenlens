/** Compact in-product manual. The full reference ships in docs/USER-MANUAL.md. */
export function InfoPanel() {
  return (
    <div class="info info-manual">
      <section class="card info-card info-start">
        <span class="section-title" role="heading" aria-level={2}>How Token Lens works</span>
        <p class="info-lead">
          Token Lens shows live usage for your current Copilot chat and keeps a private,
          metadata-only history on this machine.
        </p>
        <ol class="info-steps">
          <li>Send a Copilot Chat request and let it finish.</li>
          <li>Use <b>Live</b> for the current chat, forecast, and context.</li>
          <li>Use <b>Overview</b> for saved usage across time, models, and projects.</li>
        </ol>
      </section>

      <details class="card info-card info-fold" open>
        <summary>What each tab is for</summary>
        <ul class="info-list">
          <li><b>Live</b>: current chat, input forecast, context growth, token categories, usage, and model.</li>
          <li><b>Overview</b>: saved metadata-only history by time, application, model, and project.</li>
          <li><b>Turns</b>: temporary prompt excerpts and measured input changes for the active chat. Excerpts are never saved or exported.</li>
          <li><b>Workflows</b>: optional request-level attribution using selected workflow and tool signals.</li>
          <li><b>Info</b>: this guide and Token Lens measurement boundaries.</li>
        </ul>
      </details>

      <details class="card info-card info-fold">
        <summary>How to read the numbers</summary>
        <div class="info-definitions">
          <div><b>Metered</b><span>Written by the source application.</span></div>
          <div><b>Estimated</b><span>Calculated locally; not provider metering or an invoice.</span></div>
          <div><b>Known tokens</b><span>A measured minimum when Copilot omitted input or output for some turns.</span></div>
          <div><b>AI credits</b><span>GitHub Copilot's native charge unit, also called AICs.</span></div>
          <div><b>Input only</b><span>Copilot persisted input tokens but not output tokens.</span></div>
          <div><b>Output only</b><span>Copilot persisted output tokens but not input tokens.</span></div>
          <div><b>Pending</b><span>Copilot is still processing the current request or has not written usage yet.</span></div>
          <div><b>Usage unavailable</b><span>The request completed, but Copilot did not persist a usable token meter.</span></div>
          <div><b>Unpriced</b><span>Activity was observed, but no tool-cost rate is configured.</span></div>
        </div>
      </details>

      <details class="card info-card info-fold">
        <summary>Live cards</summary>
        <ul class="info-list">
          <li><b>Input forecast</b>: last measured input versus estimated input for the current or next turn, with a likely range and historical median error.</li>
          <li><b>Context weight</b>: input context re-sent on every turn. Sharp drops usually indicate Copilot summarization.</li>
          <li><b>Where tokens go</b>: source-reported input categories such as system instructions, tool definitions/results, history, messages, and files.</li>
          <li><b>Usage &amp; cost</b>: tokens, Copilot AI credits, and configured dollar estimate for workspace, current chat, or today.</li>
          <li><b>Current model</b>: model, reasoning effort, and context limit when the source records them.</li>
        </ul>
      </details>

      <details class="card info-card info-fold">
        <summary>Controls and commands</summary>
        <ul class="info-list">
          <li><b>Capture on/off</b>: controls new source reads. Existing ledger history remains available when paused.</li>
          <li><b>Manage…</b>: one searchable hub for pin/unpin, export, rebuild, clear, settings, self-test, and diagnostics.</li>
          <li><b>Rebuild from available local history</b>: rescan Copilot history still available on this machine; it cannot restore source files Copilot already removed.</li>
          <li><b>Export all</b>: from Overview, choose metadata-only JSON or CSV and a local destination. It exports all retained records, not only the selected time range.</li>
          <li><b>Clear local usage ledger</b>: confirmed deletion of Token Lens metadata only; Copilot source files are untouched.</li>
          <li><b>Diagnostics / self-test</b>: support actions inside Manage, not normal workflow steps.</li>
        </ul>
      </details>

      <details class="card info-card info-fold">
        <summary>Core, advanced, and deferred</summary>
        <div class="info-status-list">
          <div><span class="info-status core">Core</span><p>Live forecast, context weight, token breakdown, measured totals, personal Overview, source health, Turns, and capture privacy control.</p></div>
          <div><span class="info-status useful">Useful</span><p>Pin/unpin, manual export, configurable rates, historical forecast error, and the experimental context-limit warning.</p></div>
          <div><span class="info-status advanced">Advanced</span><p>Workflow attribution, configured tool costs, custom groups, clear/rebuild, and diagnostics.</p></div>
          <div><span class="info-status defer">Deferred</span><p>Cloud sync, team dashboards, exact per-MCP token splits, Agency CLI/Scout metering, and invoice-grade external billing.</p></div>
        </div>
      </details>

      <details class="card info-card info-fold">
        <summary>Privacy and known limits</summary>
        <ul class="info-list">
          <li>Durable records exclude prompts, responses, code/documents, tool arguments, raw paths/session IDs, user IDs, and machine IDs.</li>
          <li>GitHub Copilot Chat in VS Code is currently the only source adapter.</li>
          <li>MCP calls are visible, but Copilot does not expose exact tokens per individual MCP call.</li>
          <li>Dollars are local projections unless a provider-native charge is available; they are not an invoice.</li>
          <li>Workflow attribution correlates whole requests with evidence. It does not prove causal per-tool spend.</li>
        </ul>
      </details>
    </div>
  );
}

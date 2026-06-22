import type { TelemetryEvent } from '@ecoprompt/shared-types';

/* eslint-disable @typescript-eslint/no-require-imports */
let client: { trackEvent: (e: unknown) => void } | null = null;
let initialized = false;

function getClient(): { trackEvent: (e: unknown) => void } | null {
  if (initialized) return client;
  initialized = true;
  const connectionString = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;
  if (!connectionString) {
    client = null;
    return null;
  }
  try {
    const appInsights = require('applicationinsights');
    appInsights.setup(connectionString).setAutoCollectConsole(false).start();
    client = appInsights.defaultClient;
  } catch {
    client = null;
  }
  return client;
}

/** Track a telemetry event to Application Insights, or log it locally if unconfigured. */
export function trackEvent(event: TelemetryEvent): void {
  const c = getClient();
  if (!c) {
    if (process.env.ECO_TELEMETRY_DEBUG) {
      console.debug(`[telemetry] ${event.name}`, event.properties ?? {}, event.measurements ?? {});
    }
    return;
  }
  c.trackEvent({
    name: event.name,
    properties: {
      sessionId: event.sessionId,
      userId: event.userId,
      timestamp: event.timestamp,
      ...event.properties,
    },
    measurements: event.measurements,
  });
}

export function isTelemetryConfigured(): boolean {
  return Boolean(process.env.APPLICATIONINSIGHTS_CONNECTION_STRING);
}

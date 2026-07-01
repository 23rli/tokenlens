/** Minimum telemetry events (design doc §22.2). */
export type TelemetryEventName =
  | 'prompt_scored'
  | 'tip_generated'
  | 'prompt_rewritten'
  | 'pet_state_changed'
  | 'session_completed'
  | 'history_viewed'
  | 'tip_accepted'
  | 'tip_ignored'
  | 'score_recovered'
  | 'suggestion_shown'
  | 'suggestion_adopted';

/** A telemetry event, shaped for Application Insights trackEvent. */
export interface TelemetryEvent {
  name: TelemetryEventName;
  sessionId: string;
  /** Hashable / anonymizable in enterprise mode (design doc §22.3). */
  userId: string;
  timestamp: string;
  properties?: Record<string, string>;
  measurements?: Record<string, number>;
}

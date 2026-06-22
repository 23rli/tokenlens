/**
 * Azure Functions entry point. Importing each function module registers it with
 * the v4 programming model. (The local server in server.ts imports the handlers
 * directly and does not need these registrations.)
 */
import './functions/health';
import './functions/scorePrompt';
import './functions/generateTip';
import './functions/sessionSummary';

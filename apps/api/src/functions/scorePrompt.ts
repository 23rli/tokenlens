import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from '@azure/functions';
import type { ScorePromptRequest } from '@ecoprompt/shared-types';
import { handleScorePrompt } from '../core/handlers';

app.http('scorePrompt', {
  methods: ['POST'],
  authLevel: 'function',
  route: 'scorePrompt',
  handler: async (request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> => {
    const body = (await request.json()) as ScorePromptRequest;
    return { status: 200, jsonBody: await handleScorePrompt(body) };
  },
});

import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from '@azure/functions';
import { handleSessionSummary, type SessionSummaryRequest } from '../core/handlers';

app.http('sessionSummary', {
  methods: ['POST'],
  authLevel: 'function',
  route: 'sessionSummary',
  handler: async (request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> => {
    const body = (await request.json()) as SessionSummaryRequest;
    return { status: 200, jsonBody: await handleSessionSummary(body) };
  },
});

import { app, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { handleHealth } from '../core/handlers';

app.http('health', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'health',
  handler: async (_request, _context: InvocationContext): Promise<HttpResponseInit> => {
    return { status: 200, jsonBody: await handleHealth() };
  },
});

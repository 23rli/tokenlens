import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from '@azure/functions';
import type { TipRequest } from '@ecoprompt/shared-types';
import { handleGenerateTip } from '../core/handlers';

app.http('generateTip', {
  methods: ['POST'],
  authLevel: 'function',
  route: 'generateTip',
  handler: async (request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> => {
    const body = (await request.json()) as TipRequest;
    return { status: 200, jsonBody: await handleGenerateTip(body) };
  },
});

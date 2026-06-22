import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import {
  handleScorePrompt,
  handleGenerateTip,
  handleSessionSummary,
  handleHealth,
} from './core/handlers';

const PORT = Number(process.env.ECO_API_PORT ?? 7071);

function send(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
  });
  res.end(json);
}

async function readJson(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

/**
 * Lightweight local server exposing the same routes as the Azure Functions, so
 * the widget and demo can run without the Functions Core Tools installed.
 */
export function createApiServer() {
  return createServer(async (req, res) => {
    const url = (req.url ?? '').split('?')[0] ?? '';
    try {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': 'content-type',
          'access-control-allow-methods': 'GET,POST,OPTIONS',
        });
        res.end();
        return;
      }

      if (req.method === 'GET' && url === '/api/health') {
        return send(res, 200, await handleHealth());
      }

      if (req.method === 'POST') {
        const body = await readJson(req);
        if (url === '/api/scorePrompt') return send(res, 200, await handleScorePrompt(body));
        if (url === '/api/generateTip') return send(res, 200, await handleGenerateTip(body));
        if (url === '/api/sessionSummary') return send(res, 200, await handleSessionSummary(body));
      }

      send(res, 404, { error: 'not_found', path: url });
    } catch (err) {
      send(res, 500, { error: 'internal_error', message: String((err as Error)?.message ?? err) });
    }
  });
}

// Start when run directly.
if (require.main === module) {
  createApiServer().listen(PORT, () => {
    console.log(`EcoPrompt Guardians API listening on http://localhost:${PORT}/api`);
  });
}

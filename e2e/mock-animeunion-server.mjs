import { createServer } from 'node:http';

const host = '127.0.0.1';
const port = Number(process.env.E2E_AUTH_PORT ?? 3100);
const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ exp: 4_102_444_800 })}.e2e`;

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(body));
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://${host}:${port}`);

  if (request.method === 'GET' && url.pathname === '/health') {
    sendJson(response, 200, { status: 'ok' });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/v1/integration/auth/login') {
    sendJson(response, 200, {
      token,
      expires_in: 31_536_000,
      user: { email: 'e2e@animeunion.test', name: 'Playwright E2E' },
    });
    return;
  }

  sendJson(response, 404, { error: 'E2E mock route not found' });
});

const shutdown = () => server.close(() => process.exit(0));
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
server.on('error', (error) => {
  console.error(error);
  process.exit(1);
});
server.listen(port, host, () => {
  console.log(`E2E AnimeUnion auth mock listening on http://${host}:${port}`);
});

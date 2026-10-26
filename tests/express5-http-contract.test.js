'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const http = require('node:http');
const express = require('express');
const { createAdminGuard } = require('../src/adminAccess');

const token = 'synthetic-express5-admin-token-0123456789abcdef';
const authorize = () => 'Basic ' + Buffer.from('admin:' + token).toString('base64');

function createSyntheticAdminApp() {
  const app = express();
  app.disable('x-powered-by');
  const guard = createAdminGuard(token);
  app.get('/', guard, (_req, res) => res.type('html').send('<p>synthetic-admin</p>'));
  app.get('/status', guard, (_req, res) => res.json({ status: 'synthetic' }));
  app.get('/qr', guard, (_req, res) => res.type('png').send(Buffer.from('synthetic-qr-not-real')));
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/synthetic-error', guard, async () => {
    throw new Error('PRIVATE_SYNTHETIC_SERVER_DIAGNOSTIC');
  });
  app.use((error, _req, res, _next) => {
    assert.ok(error instanceof Error);
    res.status(503).type('text/plain').send('Service temporarily unavailable');
  });
  return app;
}

async function withServer(run) {
  const server = createSyntheticAdminApp().listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    await run('http://127.0.0.1:' + server.address().port);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

test('Express 5 preserves private QR, status and setup authentication', async () => {
  await withServer(async base => {
    for (const route of ['/', '/status', '/qr']) {
      const unauthenticated = await fetch(base + route);
      assert.equal(unauthenticated.status, 401, route);
      assert.match(unauthenticated.headers.get('cache-control') || '', /no-store/);
      assert.equal(unauthenticated.headers.get('x-frame-options'), 'DENY');
      assert.equal(unauthenticated.headers.get('access-control-allow-origin'), null);
      assert.ok(!(await unauthenticated.text()).includes('synthetic-qr'));

      const queryToken = await fetch(base + route + '?token=' + encodeURIComponent(token));
      assert.equal(queryToken.status, 401, route + ': query tokens are not accepted');

      const authenticated = await fetch(base + route, {
        headers: { Authorization: authorize() }
      });
      assert.equal(authenticated.status, 200, route);
    }
    const health = await fetch(base + '/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
  });
});

test('Express 5 forwards async handler failures without exposing internal diagnostics', async () => {
  await withServer(async base => {
    const response = await fetch(base + '/synthetic-error', {
      headers: { Authorization: authorize() }
    });
    assert.equal(response.status, 503);
    assert.equal(await response.text(), 'Service temporarily unavailable');
  });
});

test('Express 5 forwards occupied listener errors into the listen callback', async () => {
  const holder = http.createServer();
  await new Promise(resolve => holder.listen(0, '127.0.0.1', resolve));
  try {
    const port = holder.address().port;
    const error = await new Promise(resolve => {
      const blocked = createSyntheticAdminApp().listen(port, '127.0.0.1', resolve);
      // Should never accept new connections, but if it unexpectedly does,
      // release the test server rather than leak a listening socket.
      blocked.once('listening', () => blocked.close(() => resolve(null)));
    });
    assert.equal(error?.code, 'EADDRINUSE');
  } finally {
    await new Promise((resolve, reject) => holder.close(error => error ? reject(error) : resolve()));
  }
});

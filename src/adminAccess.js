'use strict';
const { createHash, timingSafeEqual } = require('node:crypto');

const TOKEN_ENV = 'FLOODGUARD_SETUP_TOKEN';
function validToken(token) {
  return typeof token === 'string' && token.length >= 32
    && token.length <= 512 && /^[!-~]+$/.test(token);
}

function createAdminGuard(token = process.env[TOKEN_ENV]) {
  // Deliberately fail closed when no strong administrative token is configured.
  // Operators provision this privately before deploying the PR to EC2.
  const ready = validToken(token);
  const expected = ready ? createHash('sha256').update(token).digest() : null;

  return function requireSetupAdmin(req, res, next) {
    res.set({
      'Cache-Control': 'private, no-store, max-age=0',
      'Pragma': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY',
      'Cross-Origin-Resource-Policy': 'same-origin'
    });
    if (!ready) {
      res.status(503).type('text/plain').send('Administrative setup is unavailable.');
      return;
    }
    const header = req.get('authorization') || '';
    const match = /^Basic ([A-Za-z0-9+/=]{1,2048})$/i.exec(header);
    let allowed = false;
    if (match) {
      const decoded = Buffer.from(match[1], 'base64').toString('utf8');
      const colon = decoded.indexOf(':');
      if (colon !== -1 && decoded.slice(0, colon) === 'admin') {
        const supplied = createHash('sha256').update(decoded.slice(colon + 1)).digest();
        allowed = timingSafeEqual(expected, supplied);
      }
    }
    if (!allowed) {
      res.set('WWW-Authenticate', 'Basic realm="FloodGuard Private Setup", charset="UTF-8"');
      res.status(401).type('text/plain').send('Authorization required.');
      return;
    }
    next();
  };
}

// Administrative Basic authentication must never be exposed on a plaintext
// network listener. Remote administration belongs behind a trusted private
// tunnel or HTTPS reverse proxy that connects to this loopback service.
function resolveAdminHost(raw = process.env.HOST) {
  if (raw == null || raw === '') return '127.0.0.1';
  if (typeof raw !== 'string' || !['127.0.0.1', '::1', 'localhost'].includes(raw)) {
    throw new Error('Refusing non-loopback FloodGuard admin HOST; use a trusted HTTPS reverse proxy or SSH tunnel.');
  }
  return raw;
}

module.exports = { createAdminGuard, validToken, resolveAdminHost };

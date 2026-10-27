'use strict';
const { createHash, timingSafeEqual } = require('node:crypto');

const TOKEN_ENV = 'FLOODGUARD_SETUP_TOKEN';
function validToken(token) {
  return typeof token === 'string' && token.length >= 32
    && token.length <= 512 && /^[!-~]+$/.test(token);
}

function createAdminGuard(token = process.env[TOKEN_ENV], {
  now = Date.now,
  maxFailedAttempts = 32,
  windowMs = 60000,
  lockoutMs = 60000
} = {}) {
  // Deliberately fail closed when no strong administrative token is configured.
  // Operators provision this privately before deploying the PR to EC2.
  const ready = validToken(token);
  const expected = ready ? createHash('sha256').update(token).digest() : null;
  // Only localhost requests reach the guard: share a small in-memory budget
  // across protected admin routes. Never trust X-Forwarded-For or store tokens.
  if (typeof now !== 'function' ||
      !Number.isSafeInteger(maxFailedAttempts) ||
      maxFailedAttempts < 1 || maxFailedAttempts > 100 ||
      !Number.isSafeInteger(windowMs) || windowMs < 100 || windowMs > 3600000 ||
      !Number.isSafeInteger(lockoutMs) || lockoutMs < 100 || lockoutMs > 3600000)
    throw new Error('Invalid FloodGuard admin throttle policy');
  let windowStart = 0;
  let failed = 0;
  let blockedUntil = 0;

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
    let timestamp;
    try { timestamp = now(); } catch { timestamp = NaN; }
    if (!Number.isSafeInteger(timestamp) || timestamp < 0) {
      res.status(503).type('text/plain').send('Administrative setup is unavailable.');
      return;
    }
    function throttle() {
      const seconds = Math.max(1, Math.ceil((blockedUntil - timestamp) / 1000));
      res.set('Retry-After', String(seconds));
      res.status(429).type('text/plain').send('Too many attempts. Retry later.');
    }
    if (timestamp < blockedUntil) {
      throttle();
      return;
    }
    if (windowStart === 0 || timestamp < windowStart ||
        timestamp - windowStart >= windowMs) {
      windowStart = timestamp;
      failed = 0;
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
      failed++;
      if (failed >= maxFailedAttempts) {
        blockedUntil = timestamp + lockoutMs;
        failed = 0;
        throttle();
        return;
      }
      res.set('WWW-Authenticate', 'Basic realm="FloodGuard Private Setup", charset="UTF-8"');
      res.status(401).type('text/plain').send('Authorization required.');
      return;
    }
    // Correct credentials clear the old failure budget, but cannot bypass
    // a lockout already in progress.
    failed = 0;
    blockedUntil = 0;
    windowStart = timestamp;
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

const jwt = require('jsonwebtoken');
const config = require('./config.cjs');
const { one } = require('./db.cjs');

const PUBLIC_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/refresh',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/health',
]);

const ROLES = ['admin', 'officer', 'citizen', 'viewer', 'super_admin'];

function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, name: user.name, email: user.email },
    config.JWT_SECRET,
    { expiresIn: config.ACCESS_TOKEN_TTL }
  );
}

function signRefreshToken(user) {
  return jwt.sign({ sub: user.id, typ: 'refresh' }, config.JWT_REFRESH_SECRET, {
    expiresIn: config.REFRESH_TOKEN_TTL,
  });
}

function verifyAccessToken(token) {
  return jwt.verify(token, config.JWT_SECRET);
}

function verifyRefreshToken(token) {
  return jwt.verify(token, config.JWT_REFRESH_SECRET);
}

function extractToken(req) {
  const header = req.headers.authorization || req.headers.Authorization || '';
  if (typeof header === 'string' && header.toLowerCase().startsWith('bearer ')) {
    return header.slice(7).trim();
  }
  return null;
}

function isPublic(pathname) {
  return PUBLIC_PATHS.has(pathname);
}

/**
 * Requires a valid JWT on every /api request except the public auth endpoints.
 * Attaches `req.auth = { id, role, name, email }`.
 */
async function authenticate(req, res, next) {
  const pathname = req.path || req.url || '';
  if (!pathname.startsWith('/api') || isPublic(pathname)) return next();

  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required', code: 'NO_TOKEN' });
  }

  try {
    const payload = verifyAccessToken(token);
    // Confirm the account still exists and is active.
    // In in-memory (demo) mode, resolve the user from the fixture array.
    let user = null;
    try {
      const row = await one('SELECT data FROM users WHERE id = $1', [payload.sub]);
      user = row ? row.data : null;
    } catch (err) {
      if (err && err.code === 'DB_NOT_CONFIGURED') {
        const serverUsers = require('../server.cjs').users || [];
        user = serverUsers.find(u => String(u.id) === String(payload.sub)) || null;
      } else {
        throw err;
      }
    }
    if (!user) {
      return res.status(401).json({ error: 'Account no longer exists', code: 'USER_GONE' });
    }
    const profile = user;
    if (profile.status && profile.status !== 'active') {
      return res.status(403).json({ error: 'Account is not active', code: 'ACCOUNT_DISABLED' });
    }
    req.auth = { id: profile.id, role: profile.role, name: profile.name, email: profile.email };
    req.currentUser = profile;
    return next();
  } catch (error) {
    const expired = error && error.name === 'TokenExpiredError';
    return res.status(401).json({
      error: expired ? 'Session expired' : 'Invalid session',
      code: expired ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID',
    });
  }
}

/** Role based authorization. super_admin is accepted wherever admin is. */
function requireRole(...roles) {
  const allowed = new Set(roles);
  if (allowed.has('admin')) allowed.add('super_admin');
  return (req, res, next) => {
    if (!req.auth) return res.status(401).json({ error: 'Authentication required' });
    if (!allowed.has(req.auth.role)) {
      return res.status(403).json({ error: 'Insufficient permissions', code: 'FORBIDDEN' });
    }
    return next();
  };
}

/** Convenience guard used by the mutating endpoints. */
function requireSelfOrRole(paramName, ...roles) {
  const guard = requireRole(...roles);
  return (req, res, next) => {
    if (req.auth && req.auth.role === 'citizen') {
      const target = req.params[paramName];
      if (target && target !== req.auth.id) {
        return res.status(403).json({ error: 'Not allowed to modify this record' });
      }
    }
    return guard(req, res, next);
  };
}

module.exports = {
  ROLES,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  extractToken,
  isPublic,
  authenticate,
  requireRole,
  requireSelfOrRole,
};

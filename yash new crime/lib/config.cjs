const path = require('path');
const crypto = require('crypto');

// Load .env from the project root (no-op when the file does not exist).
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const NODE_ENV = process.env.NODE_ENV || 'development';
const read = (key, fallback) => {
  const value = process.env[key];
  return value === undefined || value === '' ? fallback : value;
};

// Secrets are never hardcoded. In development we generate an ephemeral secret
// so the app still boots; in production a missing secret is fatal.
function resolveSecret(name) {
  const configured = process.env[name];
  if (configured && configured.length >= 16) return configured;
  if (NODE_ENV === 'production') {
    throw new Error(
      `[config] ${name} is missing or too short. Set it in .env before running in production.`
    );
  }
  console.warn(`[config] ${name} not set - generating an ephemeral development secret.`);
  return crypto.randomBytes(48).toString('hex');
}

const databaseUrl =
  read('DATABASE_URL', '') ||
  (() => {
    const user = read('DB_USER', '');
    const password = read('DB_PASSWORD', '');
    const host = read('DB_HOST', '');
    const port = read('DB_PORT', '5432');
    const name = read('DB_NAME', '');
    if (user && host && name) {
      return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${name}`;
    }
    return '';
  })();

module.exports = {
  NODE_ENV,
  PORT: Number(read('PORT', '5000')),
  DATABASE_URL: databaseUrl,
  JWT_SECRET: resolveSecret('JWT_SECRET'),
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || resolveSecret('JWT_SECRET') + '.refresh',
  ACCESS_TOKEN_TTL: read('ACCESS_TOKEN_TTL', '1h'),
  REFRESH_TOKEN_TTL: read('REFRESH_TOKEN_TTL', '7d'),
  CORS_ORIGINS: read('CORS_ORIGIN', 'http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000')
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean),
  IS_PROD: NODE_ENV === 'production',
  // Groq chat settings for the AI Crime Intelligence assistant. The key stays
  // server-side: Vite only ever inlines variables prefixed with VITE_.
  GROQ_API_KEY: read('GROQ_API_KEY', ''),
  GROQ_MODEL: read('GROQ_MODEL', 'openai/gpt-oss-20b'),
  GROQ_WEB_MODEL: read('GROQ_WEB_MODEL', 'openai/gpt-oss-120b'),
};

/**
 * Supabase configuration
 *
 * All secrets are loaded from environment variables (or a local .env file,
 * which is gitignored). Never commit real keys to source code.
 *
 * Copy .env.example to .env and fill in the values.
 */
const fs = require('fs');
const path = require('path');

// Minimal .env loader (no external dependencies)
(function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf-8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
})();

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`[config] Missing required environment variable: ${name}`);
    console.error('[config] Copy .env.example to .env and fill in the values.');
    process.exit(1);
  }
  return value;
}

module.exports = {
  SUPABASE_URL: required('SUPABASE_URL'),
  SUPABASE_KEY: required('SUPABASE_KEY'),
  ANON_KEY: process.env.ANON_KEY || '',
  MGMT_KEY: process.env.MGMT_KEY || '',
  PROJECT_REF: process.env.PROJECT_REF || '',
  LIB_EMAIL: process.env.LIB_EMAIL || '',
  LIB_PASSWORD: process.env.LIB_PASSWORD || '',
  LIB_USERNAME: process.env.LIB_USERNAME || '',
  LIB_FULL_NAME: process.env.LIB_FULL_NAME || '',
};

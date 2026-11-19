/**
 * Every environment variable the application reads is collected here and
 * nowhere else. A module that needs a setting imports `config`; it never
 * touches `process.env` directly. That way the whole configuration surface of
 * the project is one short file that can be reviewed at a glance.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config();

const here = path.dirname(fileURLToPath(import.meta.url));
export const rootDir = path.resolve(here, '..', '..');

/** Reads a number from the environment, falling back to a default. */
function num(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (Number.isNaN(value)) {
    throw new Error(`Environment variable ${name} must be a number, got "${raw}"`);
  }
  return value;
}

const env = process.env.NODE_ENV ?? 'development';
const isTest = env === 'test';

export const config = {
  env,
  isTest,
  isProduction: env === 'production',
  port: num('PORT', 3000),

  /**
   * Origins allowed to call the API from a browser. In development the
   * front-end is served by this same process, so the list only matters when
   * the two are deployed apart.
   */
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  auth: {
    // The fallback exists so that `npm test` and a fresh clone run without a
    // .env file. A real deployment must set JWT_SECRET (see checkConfig).
    jwtSecret: process.env.JWT_SECRET ?? 'development-only-secret-do-not-ship',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  },

  storage: {
    /**
     * memory   — one JSON file on disk. No database server, no account
     *            anywhere: `npm install && npm start` works from a clean
     *            clone. The tests and CI use this.
     * supabase — PostgreSQL on Supabase for the data and Supabase Auth for
     *            the accounts. This is the deployment the thesis describes.
     */
    driver: process.env.DB_DRIVER ?? 'memory',
    // Each test file gets its own data file so the suites cannot collide.
    dataFile: path.resolve(
      rootDir,
      process.env.DATA_FILE ?? (isTest ? './data/test-db.json' : './data/db.json'),
    ),
    // Supabase → Project Settings → Database → Connection string (URI).
    databaseUrl: process.env.SUPABASE_DB_URL ?? '',
  },

  supabase: {
    url: process.env.SUPABASE_URL ?? '',
    // The secret key (sb_secret_…, or the legacy service_role key) bypasses
    // row level security. It lives on the server only, never in the browser.
    serviceRoleKey: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  },

  // AES-256-GCM key for entry text (NFR-6): 64 hex characters = 32 bytes.
  // The database stores ciphertext only (entries.text_encrypted).
  encryptionKey: process.env.ENTRY_ENCRYPTION_KEY ?? '',

  /** Parameters of the adaptation model. Documented in README §Algorithm. */
  adaptation: {
    alpha: num('ADAPTATION_ALPHA', 0.3),
    explorationRate: num('EXPLORATION_RATE', 0.15),
    // Picking a question nudges its zone up once by this much (source = choice).
    choiceBoost: num('CHOICE_BOOST', 0.03),
    // Three questions a day: two from the selection rule, one random control.
    questionsPerDay: 3,
    minActiveZones: 3,
    topN: 3,
  },

  classifier: process.env.CLASSIFIER ?? 'keyword',
    research: { password: process.env.RESEARCH_PASSWORD ?? '' },
    claude: {
    apiKey: process.env.ANTHROPIC_API_KEY ?? '',
    model: process.env.CLAUDE_MODEL ?? 'claude-haiku-5-5',
    timeoutMs: num('CLAUDE_TIMEOUT_MS', 15000),
    retryDelayMs: num('CLAUDE_RETRY_DELAY_MS', 1000),
  },
};

/**
 * Fails fast on a misconfigured production start. Called from server.js only,
 * so importing the config in a test never throws.
 */
export function checkConfig() {
  const problems = [];
  if (config.isProduction && config.auth.jwtSecret.startsWith('development-only')) {
    problems.push('JWT_SECRET must be set to a real secret in production.');
  }
  const { alpha, explorationRate, choiceBoost } = config.adaptation;
  for (const [name, value] of Object.entries({ alpha, explorationRate, choiceBoost })) {
    if (value < 0 || value > 1) problems.push(`${name} must be between 0 and 1, got ${value}.`);
  }
  if (config.classifier === 'claude' && !config.claude.apiKey) {
    problems.push('ANTHROPIC_API_KEY is required when CLASSIFIER=claude.');
  }
  if (!['memory', 'supabase'].includes(config.storage.driver)) {
    problems.push(`DB_DRIVER must be "memory" or "supabase", got "${config.storage.driver}".`);
  }
  if (config.storage.driver === 'supabase') {
    if (!config.storage.databaseUrl) problems.push('SUPABASE_DB_URL is required when DB_DRIVER=supabase.');
    if (!config.supabase.url) problems.push('SUPABASE_URL is required when DB_DRIVER=supabase.');
    if (!config.supabase.serviceRoleKey) {
      problems.push('SUPABASE_SECRET_KEY is required when DB_DRIVER=supabase.');
    }
    if (!/^[0-9a-f]{64}$/i.test(config.encryptionKey)) {
      problems.push('ENTRY_ENCRYPTION_KEY must be 64 hex characters when DB_DRIVER=supabase.');
    }
  }
  if (problems.length > 0) {
    throw new Error(`Invalid configuration:\n  - ${problems.join('\n  - ')}`);
  }
}

export default config;

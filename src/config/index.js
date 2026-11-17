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
    // Each test file gets its own data file so the suites cannot collide.
    dataFile: path.resolve(
      rootDir,
      process.env.DATA_FILE ?? (isTest ? './data/test-db.json' : './data/db.json'),
    ),
  },

  /** Parameters of the adaptation model. Documented in README §Algorithm. */
  adaptation: {
    alpha: num('ADAPTATION_ALPHA', 0.3),
    explorationRate: num('EXPLORATION_RATE', 0.15),
    randomQuestionShare: num('RANDOM_QUESTION_SHARE', 0.33),
    minActiveZones: 3,
    topN: 3,
  },

  classifier: process.env.CLASSIFIER ?? 'keyword',
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
  const { alpha, explorationRate, randomQuestionShare } = config.adaptation;
  for (const [name, value] of Object.entries({ alpha, explorationRate, randomQuestionShare })) {
    if (value < 0 || value > 1) problems.push(`${name} must be between 0 and 1, got ${value}.`);
  }
  if (problems.length > 0) {
    throw new Error(`Invalid configuration:\n  - ${problems.join('\n  - ')}`);
  }
}

export default config;

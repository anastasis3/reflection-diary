/**
 * Shared setup for the integration tests.
 *
 * Two things matter here.
 *
 * 1. Isolation. Every test file gets its own data file under tests/.tmp, so
 *    the files cannot see each other's accounts and the suite gives the same
 *    result whatever order it runs in.
 *
 * 2. It is the real application. `createApp()` is the same function server.js
 *    calls — the same middleware, routes, validation and error handling. The
 *    tests exercise what actually ships, not a simplified stand-in, so a test
 *    that passes says something about the deployed behaviour.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';

process.env.NODE_ENV = 'test';

const here = path.dirname(fileURLToPath(import.meta.url));
export const tmpDir = path.resolve(here, '..', '.tmp');

const { createApp } = await import('../../src/app.js');
const { default: store } = await import('../../src/data/store.js');

/**
 * Builds a clean application for one test file.
 * @param {string} name a unique name, usually the test file's own
 */
export function freshApp(name) {
  fs.mkdirSync(tmpDir, { recursive: true });
  const file = path.join(tmpDir, `${name}.json`);
  store.useFile(file);
  store.reset();
  return { app: createApp(), store, file };
}

let counter = 0;

/**
 * Creates an account and returns an agent that is already authenticated.
 * Most tests start from "a participant exists", not from the sign-up form.
 */
export async function registerUser(app, overrides = {}) {
  counter += 1;
  const payload = {
    email: `participant${counter}.${Date.now()}@example.test`,
    password: 'correct horse battery staple',
    acceptPrivacyNotice: true,
    acceptAiProcessing: true,
    ...overrides,
  };

  const response = await request(app).post('/api/auth/register').send(payload);
  if (response.status !== 201) {
    throw new Error(`Could not register a test user: ${response.status} ${response.text}`);
  }

  const { token, user } = response.body;
  return {
    token,
    user,
    email: payload.email,
    password: payload.password,
    /** `auth(request(app).get('/api/profile'))` */
    auth: (req) => req.set('authorization', `Bearer ${token}`),
  };
}

/** Registers an account and takes it through the whole onboarding quiz. */
export async function registerAndOnboard(app, answers) {
  const session = await registerUser(app);
  const { body: state } = await session.auth(request(app).get('/api/onboarding'));

  for (const [index, statement] of state.statements.entries()) {
    await session.auth(
      request(app)
        .post('/api/onboarding/answers')
        .send({ zoneId: statement.zoneId, value: answers?.[statement.zoneId] ?? ((index % 5) + 1) }),
    );
  }
  await session.auth(request(app).post('/api/onboarding/complete'));
  return session;
}

export { request };

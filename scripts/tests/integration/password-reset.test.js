/**
 * "Forgot password?": the reset link, the new password, and what the answer
 * must not reveal. The memory driver keeps the link instead of e-mailing it,
 * so the test can follow it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { freshApp, registerUser, request } from '../helpers/testApp.js';
import { accountsRepo } from '../../src/repositories/index.js';

const { app } = freshApp('password-reset');

const tokenFrom = (link) => new URLSearchParams(link.split('#')[1]).get('access_token');

test('the answer is the same for a registered and an unknown e-mail', async () => {
  const session = await registerUser(app);
  const known = await request(app).post('/api/auth/forgot').send({ email: session.email });
  const unknown = await request(app).post('/api/auth/forgot').send({ email: 'nobody@example.test' });
  assert.equal(known.status, 200);
  assert.deepEqual(unknown.body, known.body);
});

test('the link sets a new password, logs the person in, and works only once', async () => {
  const session = await registerUser(app);
  await request(app).post('/api/auth/forgot').set('origin', 'http://localhost:3000').send({ email: session.email });
  const link = accountsRepo.lastResetLink();
  assert.ok(link.startsWith('http://localhost:3000/reset.html#access_token='), link);

  const reset = await request(app).post('/api/auth/reset').send({ token: tokenFrom(link), password: 'a brand new password' });
  assert.equal(reset.status, 200);
  assert.ok(reset.body.token, 'logged in after the reset');
  assert.equal(reset.body.user.email, session.email);

  const oldLogin = await request(app).post('/api/auth/login').send({ email: session.email, password: 'correct horse battery staple' });
  assert.equal(oldLogin.status, 401);
  const newLogin = await request(app).post('/api/auth/login').send({ email: session.email, password: 'a brand new password' });
  assert.equal(newLogin.status, 200);

  const again = await request(app).post('/api/auth/reset').send({ token: tokenFrom(link), password: 'yet another password' });
  assert.equal(again.status, 400);
  assert.equal(again.body.error.code, 'RESET_LINK_INVALID');
});

test('a made-up token and a short password are refused', async () => {
  const bad = await request(app).post('/api/auth/reset').send({ token: 'not-a-real-token-at-all', password: 'long enough password' });
  assert.equal(bad.body.error.code, 'RESET_LINK_INVALID');
  const short = await request(app).post('/api/auth/reset').send({ token: 'not-a-real-token-at-all', password: 'short' });
  assert.equal(short.status, 422);
});

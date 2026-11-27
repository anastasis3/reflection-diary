/**
 * Registration, log in and the token, driven over HTTP against the real
 * application. These are the rules of US-1.1 and US-1.2 written as tests.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { freshApp, registerUser, request } from '../helpers/testApp.js';

const { app } = freshApp('auth');

test('registering returns a token and the account, and never the password', async () => {
  const response = await request(app).post('/api/auth/register').send({
    email: 'new.participant@example.test',
    password: 'correct horse battery staple',
    acceptPrivacyNotice: true,
    acceptAiProcessing: true,
  });

  assert.equal(response.status, 201);
  assert.ok(response.body.token, 'a token is issued');
  assert.equal(response.body.user.email, 'new.participant@example.test');
  assert.equal(response.body.user.onboardingCompleted, false);

  const serialised = JSON.stringify(response.body);
  assert.ok(!serialised.includes('passwordHash'), 'the hash must never leave the server');
  assert.ok(!serialised.includes('correct horse'), 'the password must never come back');
});

test('an invalid e-mail and a short password are reported per field', async () => {
  const response = await request(app).post('/api/auth/register').send({
    email: 'not-an-email',
    password: 'short',
    acceptPrivacyNotice: true,
    acceptAiProcessing: true,
  });

  assert.equal(response.status, 422);
  assert.equal(response.body.error.code, 'VALIDATION_FAILED');

  const fields = response.body.error.details.map((d) => d.field);
  assert.ok(fields.includes('email'));
  assert.ok(fields.includes('password'));
});

test('registration is refused without the consent to analyse entries', async () => {
  const response = await request(app).post('/api/auth/register').send({
    email: 'no.consent@example.test',
    password: 'correct horse battery staple',
    acceptPrivacyNotice: true,
    acceptAiProcessing: false,
  });

  assert.equal(response.status, 400);
  assert.match(response.body.error.message, /cannot choose questions/);
});

test('the same e-mail cannot be registered twice', async () => {
  const payload = {
    email: 'twice@example.test',
    password: 'correct horse battery staple',
    acceptPrivacyNotice: true,
    acceptAiProcessing: true,
  };
  await request(app).post('/api/auth/register').send(payload);
  const second = await request(app).post('/api/auth/register').send(payload);

  assert.equal(second.status, 409);
  assert.equal(second.body.error.code, 'EMAIL_TAKEN');
});

test('logging in with the right password returns a token', async () => {
  const session = await registerUser(app);
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email: session.email, password: session.password });

  assert.equal(response.status, 200);
  assert.ok(response.body.token);
});

test('a wrong password and an unknown e-mail give the same answer', async () => {
  const session = await registerUser(app);

  const wrongPassword = await request(app)
    .post('/api/auth/login')
    .send({ email: session.email, password: 'definitely not it' });

  const unknownEmail = await request(app)
    .post('/api/auth/login')
    .send({ email: 'nobody@example.test', password: 'definitely not it' });

  assert.equal(wrongPassword.status, 401);
  assert.equal(unknownEmail.status, 401);
  assert.equal(
    wrongPassword.body.error.message,
    unknownEmail.body.error.message,
    'the response must not reveal which e-mail addresses exist',
  );
});

test('a protected endpoint refuses a request with no token', async () => {
  const response = await request(app).get('/api/profile');
  assert.equal(response.status, 401);
  assert.equal(response.body.error.code, 'UNAUTHORIZED');
});

test('a protected endpoint refuses a forged token', async () => {
  const response = await request(app)
    .get('/api/profile')
    .set('authorization', 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhbnlvbmUifQ.not-a-signature');

  assert.equal(response.status, 401);
});

test('/api/auth/me describes the signed-in account', async () => {
  const session = await registerUser(app);
  const response = await session.auth(request(app).get('/api/auth/me'));

  assert.equal(response.status, 200);
  assert.equal(response.body.user.email, session.email);
  assert.equal(response.body.user.aiProcessingConsent, true);
});

test('an unknown endpoint under /api answers with the standard error shape', async () => {
  const response = await request(app).get('/api/not-a-real-endpoint');
  assert.equal(response.status, 404);
  assert.equal(response.body.error.code, 'NOT_FOUND');
});

test('malformed JSON is reported as such, not as a crash', async () => {
  const response = await request(app)
    .post('/api/auth/login')
    .set('content-type', 'application/json')
    .send('{"email": broken');

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'MALFORMED_JSON');
});

test('a name given at sign-up is returned and used for the greeting', async () => {
  const session = await registerUser(app, { name: '  Mia ' });
  assert.equal(session.user.displayName, 'Mia', 'trimmed');

  const me = await session.auth(request(app).get('/api/auth/me'));
  assert.equal(me.body.user.displayName, 'Mia');
});

test('the name is optional: none given means no name, not an empty string', async () => {
  const session = await registerUser(app, { name: '   ' });
  assert.equal(session.user.displayName, null);
  const other = await registerUser(app);
  assert.equal(other.user.displayName, null);
});

test('the name can be changed or cleared in Settings, and is limited to 40 characters', async () => {
  const session = await registerUser(app);
  const set = await session.auth(request(app).patch('/api/account/name').send({ name: 'Ona' }));
  assert.equal(set.body.user.displayName, 'Ona');

  const cleared = await session.auth(request(app).patch('/api/account/name').send({ name: null }));
  assert.equal(cleared.body.user.displayName, null);

  const long = await session.auth(request(app).patch('/api/account/name').send({ name: 'x'.repeat(41) }));
  assert.equal(long.status, 422);
});

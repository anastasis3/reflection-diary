/**
 * The nine-statement quiz and the starting profile it produces (US-2.x).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { freshApp, registerUser, request } from '../helpers/testApp.js';

const { app } = freshApp('onboarding');

test('a new account is offered nine statements, none answered', async () => {
  const session = await registerUser(app);
  const { status, body } = await session.auth(request(app).get('/api/onboarding'));

  assert.equal(status, 200);
  assert.equal(body.total, 9);
  assert.equal(body.answered, 0);
  assert.equal(body.nextStep, 1);
  assert.equal(body.completed, false);
  assert.ok(body.statements.every((s) => s.value === null));
});

test('an answer is saved immediately, so the quiz can be resumed', async () => {
  const session = await registerUser(app);
  await session.auth(request(app).post('/api/onboarding/answers').send({ zoneId: 'work', value: 4 }));

  const { body } = await session.auth(request(app).get('/api/onboarding'));
  assert.equal(body.answered, 1);
  assert.equal(body.statements.find((s) => s.zoneId === 'work').value, 4);
  assert.equal(body.nextStep, 2, 'resumes at the first unanswered statement');
});

test('answering the same statement again replaces the earlier answer', async () => {
  const session = await registerUser(app);
  await session.auth(request(app).post('/api/onboarding/answers').send({ zoneId: 'work', value: 2 }));
  await session.auth(request(app).post('/api/onboarding/answers').send({ zoneId: 'work', value: 5 }));

  const { body } = await session.auth(request(app).get('/api/onboarding'));
  assert.equal(body.answered, 1, 'no duplicate row');
  assert.equal(body.statements.find((s) => s.zoneId === 'work').value, 5);
});

test('a value outside 1 to 5, or an unknown zone, is rejected', async () => {
  const session = await registerUser(app);

  const tooHigh = await session.auth(
    request(app).post('/api/onboarding/answers').send({ zoneId: 'work', value: 9 }),
  );
  assert.equal(tooHigh.status, 422);

  const unknownZone = await session.auth(
    request(app).post('/api/onboarding/answers').send({ zoneId: 'astrology', value: 3 }),
  );
  assert.equal(unknownZone.status, 422);
});

test('the quiz cannot be completed while a statement is unanswered', async () => {
  const session = await registerUser(app);
  await session.auth(request(app).post('/api/onboarding/answers').send({ zoneId: 'work', value: 3 }));

  const response = await session.auth(request(app).post('/api/onboarding/complete'));
  assert.equal(response.status, 400);
  assert.equal(response.body.error.details.missing.length, 8);
});

test('completing the quiz turns the answers into nine starting weights', async () => {
  const session = await registerUser(app);
  const { body: state } = await session.auth(request(app).get('/api/onboarding'));

  // Give every statement the value 5, which must map onto a weight of 1.00.
  for (const statement of state.statements) {
    await session.auth(
      request(app).post('/api/onboarding/answers').send({ zoneId: statement.zoneId, value: 5 }),
    );
  }

  const response = await session.auth(request(app).post('/api/onboarding/complete'));
  assert.equal(response.status, 200);
  assert.equal(response.body.completed, true);
  assert.equal(response.body.weights.length, 9);

  // weight = (answer - 1) / 4, so 5 -> 1.00 and 1 -> 0.00
  assert.ok(response.body.weights.every((w) => w.weight === 1));
  assert.ok(response.body.weights.every((w) => w.source === 'quiz'));
});

test('the 1 to 5 scale maps onto 0.00 to 1.00 across its whole range', async () => {
  const session = await registerUser(app);
  const { body: state } = await session.auth(request(app).get('/api/onboarding'));

  const expected = { 1: 0, 2: 0.25, 3: 0.5, 4: 0.75, 5: 1 };
  for (const [index, statement] of state.statements.entries()) {
    await session.auth(
      request(app)
        .post('/api/onboarding/answers')
        .send({ zoneId: statement.zoneId, value: (index % 5) + 1 }),
    );
  }

  const { body } = await session.auth(request(app).post('/api/onboarding/complete'));
  for (const [index, statement] of state.statements.entries()) {
    const weight = body.weights.find((w) => w.zoneId === statement.zoneId).weight;
    assert.equal(weight, expected[(index % 5) + 1], `${statement.zoneId} mapped wrongly`);
  }
});

test('no question is given before the quiz is finished', async () => {
  const session = await registerUser(app);
  const response = await session.auth(request(app).get('/api/prompts/today'));

  assert.equal(response.status, 409);
  assert.equal(response.body.error.code, 'ONBOARDING_INCOMPLETE');
});

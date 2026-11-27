/**
 * Consent, export and deletion (US-7.x).
 *
 * These are the promises the registration screen makes. A test that they are
 * kept is worth more than a paragraph saying they are.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { freshApp, registerAndOnboard, request } from '../helpers/testApp.js';

const { app, store } = freshApp('account');

test('both consents are recorded at registration', async () => {
  const session = await registerAndOnboard(app);
  const { status, body } = await session.auth(request(app).get('/api/account/consents'));

  assert.equal(status, 200);
  assert.equal(body.consents.length, 2);
  assert.ok(body.consents.every((c) => c.active));
  assert.ok(body.consents.some((c) => c.purpose === 'ai_processing'));
  assert.ok(body.consents.some((c) => c.purpose === 'study'));
});

test('withdrawing consent records when, and does not delete the row', async () => {
  const session = await registerAndOnboard(app);
  const { body } = await session.auth(request(app).delete('/api/account/consents/ai-processing'));

  const ai = body.consents.find((c) => c.purpose === 'ai_processing');
  assert.equal(ai.active, false);
  assert.ok(ai.withdrawnAt, 'the study has to be able to say when processing stopped');
  assert.ok(ai.grantedAt, 'and when it started');
});

test('consent can be given again', async () => {
  const session = await registerAndOnboard(app);
  await session.auth(request(app).delete('/api/account/consents/ai-processing'));
  const { body } = await session.auth(request(app).post('/api/account/consents/ai-processing'));

  assert.equal(body.consents.find((c) => c.purpose === 'ai_processing').active, true);
});

test('the export contains everything the account has, and the entry text', async () => {
  const session = await registerAndOnboard(app);
  const { body: question } = await session.auth(request(app).get('/api/prompts/today'));
  await session.auth(
    request(app)
      .post('/api/entries')
      .send({ text: 'A sentence I should find again in my export.', promptShownId: question.promptShownId }),
  );

  const { status, body, headers } = await session.auth(request(app).get('/api/account/export'));

  assert.equal(status, 200);
  assert.match(headers['content-disposition'], /attachment; filename="reflection-diary-/);

  assert.equal(body.account.email, session.email);
  assert.equal(body.onboardingAnswers.length, 9);
  assert.equal(body.weights.length, 9);
  assert.equal(body.entries.length, 1);
  assert.match(body.entries[0].text, /find again in my export/);
  assert.ok(body.entries[0].scores.work !== undefined, 'the topic scores are included');
  assert.ok(body.questionsShown[0].promptText, 'the questions are readable, not just ids');
  assert.ok(body.weightHistory.length >= 9);
  assert.ok(body.weightChanges.length >= 9);
});

test('the export never contains the password hash', async () => {
  const session = await registerAndOnboard(app);
  const { body } = await session.auth(request(app).get('/api/account/export'));
  assert.ok(!JSON.stringify(body).includes('scrypt$'));
});

test('deleting the account removes every row that belonged to it', async () => {
  const session = await registerAndOnboard(app);
  await session.auth(request(app).get('/api/prompts/today'));
  await session.auth(request(app).post('/api/entries').send({ text: 'This will be deleted.' }));

  const userId = session.user.id;
  const response = await session.auth(request(app).delete('/api/account'));

  assert.equal(response.status, 200);
  assert.equal(response.body.deleted, true);

  // Look directly in the store: nothing anywhere may still carry this id.
  const { state } = store;
  const leftovers = [
    ['users', state.users.filter((r) => r.id === userId)],
    ['profiles', state.profiles.filter((r) => r.id === userId)],
    ['consents', state.consents.filter((r) => r.userId === userId)],
    ['onboardingAnswers', state.onboardingAnswers.filter((r) => r.userId === userId)],
    ['userTopicWeights', state.userTopicWeights.filter((r) => r.userId === userId)],
    ['weightHistory', state.weightHistory.filter((r) => r.userId === userId)],
    ['weightChanges', state.weightChanges.filter((r) => r.userId === userId)],
    ['entries', state.entries.filter((r) => r.userId === userId)],
    ['promptsShown', state.promptsShown.filter((r) => r.userId === userId)],
  ].filter(([, rows]) => rows.length > 0);

  assert.deepEqual(leftovers.map(([name]) => name), [], 'rows left behind after deletion');
});

test('the topic scores of a deleted account go with it', async () => {
  const session = await registerAndOnboard(app);
  const created = await session.auth(
    request(app).post('/api/entries').send({ text: 'An entry about work and the office.' }),
  );
  const entryId = created.body.entry.id;

  await session.auth(request(app).delete('/api/account'));

  const orphans = store.state.entryTopicScores.filter((s) => s.entryId === entryId);
  assert.equal(orphans.length, 0, 'scores must not outlive the entry they describe');
});

test('the token stops working the moment the account is gone', async () => {
  const session = await registerAndOnboard(app);
  await session.auth(request(app).delete('/api/account'));

  const response = await session.auth(request(app).get('/api/auth/me'));
  assert.equal(response.status, 401);
});

test('deleting one account leaves every other account untouched', async () => {
  const leaving = await registerAndOnboard(app);
  const staying = await registerAndOnboard(app);

  await staying.auth(request(app).post('/api/entries').send({ text: 'I am staying, about work.' }));
  await leaving.auth(request(app).delete('/api/account'));

  const profile = await staying.auth(request(app).get('/api/profile'));
  const entries = await staying.auth(request(app).get('/api/entries'));

  assert.equal(profile.status, 200);
  assert.equal(profile.body.zones.length, 9);
  assert.equal(entries.body.entries.length, 1);
});

/**
 * Saving an entry and what that does to the profile (US-4.x). The three
 * questions themselves are covered in questions.test.js.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { freshApp, registerAndOnboard, registerUser, request } from '../helpers/testApp.js';

const { app } = freshApp('entries');

test('an empty entry is refused with the message the screen shows', async () => {
  const session = await registerAndOnboard(app);
  const response = await session.auth(request(app).post('/api/entries').send({ text: '   ' }));

  assert.equal(response.status, 422);
  assert.match(response.body.error.details[0].message, /few words/);
});

test('saving an entry classifies it and moves the profile', async () => {
  const session = await registerAndOnboard(app);
  const { body: today } = await session.auth(request(app).get('/api/prompts/today'));
  const question = today.questions[0];

  const response = await session.auth(
    request(app).post('/api/entries').send({
      text: 'Three meetings at the office that could have been one message, and the deadline moved again.',
      promptShownId: question.promptShownId,
    }),
  );

  assert.equal(response.status, 201);
  assert.equal(response.body.analysis, 'classified');
  assert.equal(response.body.entry.status, 'classified');
  assert.equal(response.body.entry.zone.id, 'work');
  assert.ok(response.body.weightChanges.length > 0, 'the profile moved');
});

test('entries can be listed and filtered by zone', async () => {
  const session = await registerAndOnboard(app);
  await session.auth(
    request(app).post('/api/entries').send({
      text: 'The office deadline moved again and the meeting ran long.',
    }),
  );

  const all = await session.auth(request(app).get('/api/entries'));
  assert.equal(all.status, 200);
  assert.equal(all.body.entries.length, 1);

  const work = await session.auth(request(app).get('/api/entries?zone=work'));
  assert.equal(work.body.entries.length, 1);

  const meaning = await session.auth(request(app).get('/api/entries?zone=meaning'));
  assert.equal(meaning.body.entries.length, 0, 'filtering by another zone finds nothing');
});

test('one account never sees another account\'s entries', async () => {
  const mine = await registerAndOnboard(app);
  const theirs = await registerAndOnboard(app);

  const created = await mine.auth(
    request(app).post('/api/entries').send({ text: 'Something private about my week.' }),
  );
  const entryId = created.body.entry.id;

  const list = await theirs.auth(request(app).get('/api/entries'));
  assert.equal(list.body.entries.length, 0);

  const direct = await theirs.auth(request(app).get(`/api/entries/${entryId}`));
  assert.equal(direct.status, 404, 'a known id must not be enough to read an entry');
});

test('an entry survives the classifier failing, and the profile does not move', async () => {
  // The degraded path of screen S-04b: saving an entry and understanding it
  // are separate steps, and the second one failing must not take the first
  // one with it. `config.classifier` is read at call time precisely so that
  // this path can be exercised without mocking anything.
  const { default: config } = await import('../../src/config/index.js');
  const session = await registerAndOnboard(app);
  const before = await session.auth(request(app).get('/api/profile'));

  config.classifier = 'failing';
  try {
    const response = await session.auth(
      request(app).post('/api/entries').send({ text: 'This one will not be analysed.' }),
    );

    assert.equal(response.status, 201, 'the entry is still created');
    assert.equal(response.body.analysis, 'failed');
    assert.equal(response.body.entry.status, 'classification_failed');
    assert.deepEqual(response.body.weightChanges, [], 'the profile must not move');
  } finally {
    config.classifier = 'keyword';
  }

  const after = await session.auth(request(app).get('/api/profile'));
  assert.deepEqual(
    after.body.zones.map((z) => z.weight),
    before.body.zones.map((z) => z.weight),
    'weights are unchanged after a failed classification',
  );

  // The entry itself is still there and still readable.
  const list = await session.auth(request(app).get('/api/entries'));
  assert.equal(list.body.entries.length, 1);
  assert.equal(list.body.entries[0].status, 'classification_failed');
});

test('an entry is saved but not analysed once consent is withdrawn', async () => {
  const session = await registerAndOnboard(app);
  await session.auth(request(app).delete('/api/account/consents/ai-processing'));

  const before = await session.auth(request(app).get('/api/profile'));
  const response = await session.auth(
    request(app).post('/api/entries').send({ text: 'Written after withdrawing consent.' }),
  );

  assert.equal(response.status, 201);
  assert.equal(response.body.analysis, 'skipped_no_consent');
  assert.deepEqual(response.body.weightChanges, []);

  const after = await session.auth(request(app).get('/api/profile'));
  assert.deepEqual(
    after.body.zones.map((z) => z.weight),
    before.body.zones.map((z) => z.weight),
    'the profile stops changing, which is what withdrawing consent means',
  );
});

test('an account that has not finished the quiz has no profile yet', async () => {
  const session = await registerUser(app);
  const response = await session.auth(request(app).get('/api/profile'));
  assert.equal(response.status, 409);
  assert.equal(response.body.error.code, 'ONBOARDING_INCOMPLETE');
});

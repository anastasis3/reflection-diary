/**
 * Three questions a day (US-3.x): what is offered, picking one, answering it,
 * rating it afterwards, and what the browser is never told.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { freshApp, registerAndOnboard, request } from '../helpers/testApp.js';

const { app, store } = freshApp('questions');

const today = (session) => session.auth(request(app).get('/api/prompts/today'));

test('three questions are offered, on three different zones', async () => {
  const session = await registerAndOnboard(app);
  const { status, body } = await today(session);

  assert.equal(status, 200);
  assert.equal(body.questions.length, 3);
  assert.deepEqual(body.questions.map((q) => q.slot), [1, 2, 3]);
  assert.equal(new Set(body.questions.map((q) => q.zone.id)).size, 3, 'three different zones');
  for (const q of body.questions) {
    assert.ok(q.text.length > 10);
    assert.equal(q.wasChosen, false);
    assert.equal(q.wasAnswered, false);
  }
  assert.equal(body.answeredCount, 0);
});

test('a reload returns the same three questions', async () => {
  const session = await registerAndOnboard(app);
  const first = await today(session);
  const second = await today(session);

  assert.deepEqual(
    second.body.questions.map((q) => q.promptShownId),
    first.body.questions.map((q) => q.promptShownId),
  );
  assert.equal(second.body.isNew, false, 'a reload must not re-roll the questions');
});

test('every day has exactly one random control and two adaptive questions', async () => {
  const session = await registerAndOnboard(app);
  await today(session);

  const rows = store.state.promptsShown.filter((p) => p.userId === session.user.id);
  const reasons = rows.map((r) => r.selectionReason).sort();
  assert.equal(rows.length, 3);
  assert.equal(reasons.filter((r) => r === 'baseline_random').length, 1);
  assert.equal(reasons.filter((r) => r !== 'baseline_random').length, 2);
});

test('which question is the random one is never sent to the browser', async () => {
  // A participant who could see which question was random would choose and
  // rate differently, and the comparison the study rests on would be
  // worthless. The reason is stored and read only for the analysis.
  const session = await registerAndOnboard(app);
  const { body } = await today(session);
  const json = JSON.stringify(body);

  assert.ok(!json.includes('selectionReason'));
  assert.ok(!json.includes('baseline_random'));
  assert.ok(!json.includes('top_three'));

  const day = await session.auth(request(app).get(`/api/history/day/${body.day}`));
  assert.ok(!JSON.stringify(day.body).includes('baseline_random'), 'nor in History');
});

test('picking a question moves its zone up once, by 0.03', async () => {
  // every zone at 0.5, so no weight is near the ceiling of 1.0
  const middle = Object.fromEntries(
    ['work', 'people', 'health', 'energy', 'emotion', 'self', 'interest', 'meaning', 'everyday'].map((z) => [z, 3]),
  );
  const session = await registerAndOnboard(app, middle);
  const { body } = await today(session);
  const q = body.questions[0];

  const before = await session.auth(request(app).get('/api/profile'));
  const w0 = before.body.zones.find((z) => z.zone.id === q.zone.id).weight;

  const first = await session.auth(request(app).post(`/api/prompts/${q.promptShownId}/choose`));
  assert.equal(first.status, 200);
  assert.equal(first.body.question.wasChosen, true);
  assert.equal(first.body.boost.from, w0);
  assert.equal(first.body.boost.to, 0.53);

  const again = await session.auth(request(app).post(`/api/prompts/${q.promptShownId}/choose`));
  assert.equal(again.body.boost, null, 'a second click does not move it again');

  const changes = await session.auth(request(app).get('/api/profile/changes'));
  assert.ok(changes.body.changes.some((c) => c.source === 'choice'), 'recorded with source = choice');
});

test('answering one question leaves the other two open', async () => {
  const session = await registerAndOnboard(app);
  const { body } = await today(session);
  const q = body.questions[1];

  const saved = await session.auth(
    request(app).post('/api/entries').send({ text: 'I slept badly and had no energy.', promptShownId: q.promptShownId }),
  );
  assert.equal(saved.status, 201);
  assert.equal(saved.body.entry.prompt.promptShownId, q.promptShownId);

  const after = await today(session);
  assert.equal(after.body.answeredCount, 1);
  const answered = after.body.questions.find((x) => x.promptShownId === q.promptShownId);
  assert.equal(answered.wasAnswered, true);
  assert.equal(answered.wasChosen, true, 'answered without the choose call still counts as picked');
  assert.equal(after.body.questions.filter((x) => !x.wasAnswered).length, 2);
});

test('all three can be answered, each only once', async () => {
  const session = await registerAndOnboard(app);
  const { body } = await today(session);

  for (const q of body.questions) {
    const r = await session.auth(
      request(app).post('/api/entries').send({ text: `About ${q.zone.name}.`, promptShownId: q.promptShownId }),
    );
    assert.equal(r.status, 201);
  }
  const twice = await session.auth(
    request(app).post('/api/entries').send({ text: 'Again.', promptShownId: body.questions[0].promptShownId }),
  );
  assert.equal(twice.status, 409);
  assert.equal(twice.body.error.code, 'ALREADY_ANSWERED');

  const after = await today(session);
  assert.equal(after.body.answeredCount, 3);
});

test('a question is rated only after it has been answered', async () => {
  const session = await registerAndOnboard(app);
  const { body } = await today(session);
  const q = body.questions[2];

  const early = await session.auth(
    request(app).post(`/api/prompts/${q.promptShownId}/rating`).send({ relevant: true }),
  );
  assert.equal(early.status, 409);
  assert.equal(early.body.error.code, 'NOT_ANSWERED');

  await session.auth(
    request(app).post('/api/entries').send({ text: 'Written.', promptShownId: q.promptShownId }),
  );
  const rated = await session.auth(
    request(app).post(`/api/prompts/${q.promptShownId}/rating`).send({ relevant: false }),
  );
  assert.equal(rated.status, 200);
  assert.equal(rated.body.relevanceRating, false);
  assert.ok(rated.body.ratedAt, 'a rating without its time would break the database CHECK');
});

test('the explanation is honest and does not reveal the reason up front', async () => {
  const session = await registerAndOnboard(app);
  const { body } = await today(session);

  for (const q of body.questions) {
    const { status, body: why } = await session.auth(
      request(app).get(`/api/prompts/${q.promptShownId}/explanation`),
    );
    assert.equal(status, 200);
    const row = store.state.promptsShown.find((p) => p.id === q.promptShownId);
    if (row.selectionReason === 'baseline_random') assert.match(why.text, /at random/);
    else assert.doesNotMatch(why.text, /at random/);
    assert.equal(row.explanationOpened, true);
  }
});

test('another account cannot pick, read, answer or rate your question', async () => {
  const mine = await registerAndOnboard(app);
  const theirs = await registerAndOnboard(app);
  const { body } = await today(mine);
  const id = body.questions[0].promptShownId;

  const calls = await Promise.all([
    theirs.auth(request(app).post(`/api/prompts/${id}/choose`)),
    theirs.auth(request(app).get(`/api/prompts/${id}/explanation`)),
    theirs.auth(request(app).post(`/api/prompts/${id}/rating`).send({ relevant: true })),
    theirs.auth(request(app).post('/api/entries').send({ text: 'not mine', promptShownId: id })),
  ]);
  assert.deepEqual(calls.map((c) => c.status), [404, 404, 404, 404]);
});

test('yesterday\'s question cannot be picked or answered today', async () => {
  const session = await registerAndOnboard(app);
  const { body } = await today(session);
  const row = store.state.promptsShown.find((p) => p.id === body.questions[0].promptShownId);
  row.shownOn = '2000-01-01';

  const pick = await session.auth(request(app).post(`/api/prompts/${row.id}/choose`));
  const write = await session.auth(
    request(app).post('/api/entries').send({ text: 'Late.', promptShownId: row.id }),
  );
  assert.equal(pick.status, 409);
  assert.equal(write.body.error.code, 'QUESTION_EXPIRED');
});

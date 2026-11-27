/**
 * History: the totals per zone, the month calendar and one day in full
 * (US-6.x).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { freshApp, registerAndOnboard, request } from '../helpers/testApp.js';

const { app } = freshApp('history');
const today = new Date().toISOString().slice(0, 10);
const thisMonth = today.slice(0, 7);

test('a new account has an empty history, with all nine zones at zero', async () => {
  const session = await registerAndOnboard(app);
  const { status, body } = await session.auth(request(app).get('/api/history/summary'));

  assert.equal(status, 200);
  assert.equal(body.total, 0);
  assert.equal(body.zones.length, 9, 'every zone is listed, including the empty ones');
  assert.ok(body.zones.every((z) => z.count === 0));
});

test('an entry is counted under the zone it was mostly about', async () => {
  const session = await registerAndOnboard(app);
  await session.auth(
    request(app).post('/api/entries').send({
      text: 'The office deadline moved again and I sat through three meetings about it.',
    }),
  );

  const { body } = await session.auth(request(app).get('/api/history/summary'));
  assert.equal(body.total, 1);
  assert.equal(body.zones.find((z) => z.zone.id === 'work').count, 1);
  assert.equal(body.zones[0].zone.id, 'work', 'the busiest zone comes first');
});

test('the calendar covers the whole month, empty days included', async () => {
  const session = await registerAndOnboard(app);
  const { status, body } = await session.auth(
    request(app).get(`/api/history/calendar?month=${thisMonth}`),
  );

  assert.equal(status, 200);
  assert.equal(body.days.length, body.daysInMonth);
  assert.ok(body.firstWeekday >= 0 && body.firstWeekday <= 6);
  assert.equal(body.days[0].day, `${thisMonth}-01`);
});

test("today's entry shows up on today's square with its colour", async () => {
  const session = await registerAndOnboard(app);
  await session.auth(
    request(app).post('/api/entries').send({ text: 'I slept badly and had no energy all day.' }),
  );

  const { body } = await session.auth(request(app).get(`/api/history/calendar?month=${thisMonth}`));
  const cell = body.days.find((d) => d.day === today);

  assert.equal(cell.entryCount, 1);
  assert.equal(cell.zones[0].id, 'energy');
  assert.match(cell.zones[0].colour, /^#[0-9A-F]{6}$/i, 'the colour comes from the catalogue');
});

test('a badly written month is refused with a usable message', async () => {
  const session = await registerAndOnboard(app);
  const response = await session.auth(request(app).get('/api/history/calendar?month=November'));

  assert.equal(response.status, 422);
  assert.match(response.body.error.details[0].message, /YYYY-MM/);
});

test('one day returns its three questions, the entry and how it was rated', async () => {
  const session = await registerAndOnboard(app);
  const { body: todays } = await session.auth(request(app).get('/api/prompts/today'));
  const question = todays.questions[0];

  await session.auth(
    request(app)
      .post('/api/entries')
      .send({ text: 'Called my sister and we talked for an hour.', promptShownId: question.promptShownId }),
  );
  await session.auth(
    request(app).post(`/api/prompts/${question.promptShownId}/rating`).send({ relevant: true }),
  );

  const { status, body } = await session.auth(request(app).get(`/api/history/day/${today}`));

  assert.equal(status, 200);
  assert.equal(body.day, today);
  assert.equal(body.questions.length, 3);
  const answered = body.questions.find((q) => q.promptShownId === question.promptShownId);
  assert.equal(answered.relevanceRating, true);
  assert.equal(answered.wasAnswered, true);
  assert.equal(body.questions.filter((q) => q.wasAnswered).length, 1);
  assert.equal(body.entries.length, 1);
  assert.match(body.entries[0].text, /sister/);
});

test('a day with nothing on it is a valid answer, not an error', async () => {
  const session = await registerAndOnboard(app);
  const { status, body } = await session.auth(request(app).get('/api/history/day/2020-01-01'));

  assert.equal(status, 200);
  assert.equal(body.entries.length, 0);
  assert.deepEqual(body.questions, []);
});

test('a malformed day is refused', async () => {
  const session = await registerAndOnboard(app);
  const response = await session.auth(request(app).get('/api/history/day/not-a-day'));
  assert.equal(response.status, 422);
});

test('history is per account', async () => {
  const mine = await registerAndOnboard(app);
  const theirs = await registerAndOnboard(app);

  await mine.auth(request(app).post('/api/entries').send({ text: 'My own entry about work.' }));

  const { body } = await theirs.auth(request(app).get('/api/history/summary'));
  assert.equal(body.total, 0);
});
